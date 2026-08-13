import { Worker, type Job } from 'bullmq';
import type { AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { queueConnection } from '../queues/connection.js';
import { QUEUES } from '../queues/names.js';
import { dispatchChannel, type AlertPayload } from '../notifications/senders.js';
import { logger } from '../config/logger.js';
import type { NotificationJob } from '../queues/index.js';

const EVENTS: Record<AlertType, string> = {
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

export async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { monitor: true, incident: true, channel: true, webhook: true },
  });

  if (!delivery) {
    logger.warn({ deliveryId: job.data.deliveryId }, 'delivery not found');
    return;
  }

  const payload: AlertPayload = {
    event: EVENTS[delivery.alertType],
    alertType: delivery.alertType,
    organizationId: delivery.organizationId,
    monitor: {
      id: delivery.monitor.id,
      name: delivery.monitor.name,
      type: delivery.monitor.type,
      target: delivery.monitor.target,
    },
    incidentId: delivery.incidentId ?? undefined,
    incidentTitle: delivery.incident?.title,
    severity: delivery.incident?.severity,
    message: delivery.incident?.title ?? `${delivery.monitor.name} alert (${delivery.alertType})`,
    timestamp: new Date().toISOString(),
  };

  await prisma.notificationDelivery.update({
    where: { id: delivery.id },
    data: { status: 'RETRYING', attempts: { increment: 1 } },
  });

  try {
    if (delivery.channel) {
      await dispatchChannel({ type: delivery.channel.type, config: delivery.channel.config as never }, payload);
    } else if (delivery.webhook) {
      await dispatchChannel(
        { type: 'WEBHOOK', config: { url: delivery.webhook.url, secret: delivery.webhook.secret } },
        payload,
      );
    } else {
      throw new Error('Delivery has no channel or webhook.');
    }

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: 'DELIVERED', deliveredAt: new Date(), sentAt: delivery.sentAt ?? new Date() },
    });
  } catch (err) {
    logger.error({ err, deliveryId: delivery.id }, 'notification delivery failed');
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'Delivery failed',
      },
    });
  }
}

export function startNotificationWorker(): Worker<NotificationJob> {
  const worker = new Worker<NotificationJob>(QUEUES.NOTIFICATIONS, processNotification, {
    connection: queueConnection,
    concurrency: 20,
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'notification job failed');
  });

  return worker;
}
