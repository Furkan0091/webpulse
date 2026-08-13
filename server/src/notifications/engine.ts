import type { AlertType, Monitor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { notificationQueue } from '../queues/index.js';
import { logger } from '../config/logger.js';
import type { AlertPayload } from './senders.js';

const ALERT_EVENTS: Record<AlertType, string> = {
  MONITOR_DOWN: 'monitor.down',
  MONITOR_RECOVERED: 'monitor.recovered',
  RESPONSE_TIME: 'monitor.response_time',
  SSL_EXPIRING: 'ssl.expiring',
  SSL_EXPIRED: 'ssl.expired',
  KEYWORD_FAIL: 'monitor.keyword_fail',
  ASSERTION_FAIL: 'monitor.assertion_fail',
  DNS_FAIL: 'monitor.dns_fail',
  ESCALATION: 'incident.escalated',
};

export interface SendAlertInput {
  organizationId: string;
  monitor: Monitor;
  alertType: AlertType;
  message: string;
  incidentId?: string;
  incidentTitle?: string;
  severity?: string;
  dedupeKey: string;
  dedupeTtlSeconds?: number; // for periodic alerts (ssl expiring, response time)
  data?: Record<string, unknown>;
}

/**
 * Fan-out an alert to all configured channels. Deduplication is enforced with
 * a Redis SET-NX so we never spam the same event (one DOWN alert per incident,
 * bounded periodic alerts, etc.).
 */
export async function sendAlert(input: SendAlertInput): Promise<boolean> {
  const dedupeKey = `alert:${input.organizationId}:${input.dedupeKey}`;

  // Dedup gate.
  const acquired = await redis
    .set(dedupeKey, '1', 'EX', input.dedupeTtlSeconds ?? 7 * 24 * 3600, 'NX')
    .catch(() => null);
  if (acquired !== 'OK' && input.dedupeTtlSeconds !== undefined) {
    // For bounded periodic alerts, respect TTL-based dedup.
    return false;
  }

  const channels = await resolveChannels(input.organizationId, input.monitor.id);
  const webhooks = await prisma.webhook.findMany({
    where: { organizationId: input.organizationId, enabled: true, OR: [{ monitorId: input.monitor.id }, { monitorId: null }] },
  });

  const payload: AlertPayload = {
    event: ALERT_EVENTS[input.alertType],
    alertType: input.alertType,
    organizationId: input.organizationId,
    monitor: {
      id: input.monitor.id,
      name: input.monitor.name,
      type: input.monitor.type,
      target: input.monitor.target,
    },
    incidentId: input.incidentId,
    incidentTitle: input.incidentTitle,
    severity: input.severity,
    message: input.message,
    timestamp: new Date().toISOString(),
    data: input.data,
  };

  // Create delivery records and enqueue.
  const deliveries = [
    ...channels.map((c) => ({
      organizationId: input.organizationId,
      monitorId: input.monitor.id,
      incidentId: input.incidentId ?? null,
      channelId: c.id,
      channelType: c.type,
      alertType: input.alertType,
      dedupeKey,
    })),
    ...webhooks.map((w) => ({
      organizationId: input.organizationId,
      monitorId: input.monitor.id,
      incidentId: input.incidentId ?? null,
      webhookId: w.id,
      channelType: 'WEBHOOK',
      alertType: input.alertType,
      dedupeKey,
    })),
  ];

  if (deliveries.length === 0) {
    logger.info({ monitor: input.monitor.name, alertType: input.alertType }, 'no channels configured, alert skipped');
    return false;
  }

  for (const d of deliveries) {
    const delivery = await prisma.notificationDelivery.create({ data: d });
    await notificationQueue.add('send', { deliveryId: delivery.id }, { removeOnComplete: { count: 5000 } });
  }

  if (input.incidentId) {
    await prisma.incidentEvent.create({
      data: {
        incidentId: input.incidentId,
        type: 'ALERT_SENT',
        message: `Alert sent (${input.alertType}) via ${deliveries.length} channel(s)`,
        metadata: { alertType: input.alertType, channelCount: deliveries.length },
      },
    });
  }

  return true;
}

async function resolveChannels(organizationId: string, monitorId: string) {
  const monitor = await prisma.monitor.findUnique({
    where: { id: monitorId },
    select: { alertPolicyId: true },
  });

  const monitorPolicy = monitor?.alertPolicyId
    ? await prisma.alertPolicy.findFirst({
        where: { organizationId, id: monitor.alertPolicyId },
        include: { channels: { include: { channel: true } } },
      })
    : null;

  const policy =
    monitorPolicy ??
    (await prisma.alertPolicy.findFirst({
      where: { organizationId, monitors: { none: {} } },
      orderBy: { name: 'asc' },
      include: { channels: { include: { channel: true } } },
    }));

  if (!policy) return [];
  return policy.channels.filter((c) => c.channel.enabled).map((c) => c.channel);
}
