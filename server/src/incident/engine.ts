import type { Monitor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { logger } from '../config/logger.js';
import type { CheckOutcome } from '../monitoring/types.js';
import { sendAlert } from '../notifications/engine.js';
import { isAnomalous } from '../utils/stats.js';
import { logActivity } from '../services/audit.service.js';

const ACTIVE_STATUSES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] as const;

function failureKey(monitorId: string): string {
  return `failcount:${monitorId}`;
}

async function inActiveMaintenance(monitorId: string): Promise<boolean> {
  const now = new Date();
  const window = await prisma.maintenanceWindow.findFirst({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
      monitors: { some: { monitorId } },
    },
  });
  return window != null;
}

async function createIncident(monitor: Monitor, outcome: CheckOutcome, failureCount: number) {
  const down = outcome.status === 'DOWN';
  const incident = await prisma.$transaction(async (tx) => {
    const created = await tx.incident.create({
      data: {
        organizationId: monitor.organizationId,
        monitorId: monitor.id,
        title: down ? `${monitor.name} is down` : `${monitor.name} degraded performance`,
        severity: monitor.severity,
        status: 'INVESTIGATING',
        startedAt: new Date(Date.now() - (failureCount - 1) * monitor.intervalSeconds * 1000),
        detectedAt: new Date(),
        errorInfo: { error: outcome.error, errorCode: outcome.errorCode },
        failedCheckCount: failureCount,
      },
    });
    await tx.incidentEvent.create({
      data: {
        incidentId: created.id,
        type: 'INCIDENT_CREATED',
        message: `Incident created after ${failureCount} failed check(s)`,
        metadata: { errorCode: outcome.errorCode },
      },
    });
    return created;
  });

  await logActivity({
    organizationId: monitor.organizationId,
    monitorId: monitor.id,
    type: 'INCIDENT_CREATED',
    message: `Incident created: ${incident.title}`,
  });

  await sendAlert({
    organizationId: monitor.organizationId,
    monitor,
    alertType: 'MONITOR_DOWN',
    message: incident.title,
    incidentId: incident.id,
    incidentTitle: incident.title,
    severity: incident.severity,
    dedupeKey: `down:${incident.id}`,
    data: { errorCode: outcome.errorCode },
  });

  return incident;
}

async function resolveIncident(monitor: Monitor, incident: { id: string; startedAt: Date }) {
  const resolvedAt = new Date();
  const durationSeconds = Math.round((resolvedAt.getTime() - incident.startedAt.getTime()) / 1000);

  const resolved = await prisma.$transaction(async (tx) => {
    const updated = await tx.incident.update({
      where: { id: incident.id },
      data: {
        status: 'RESOLVED',
        resolvedAt,
        durationSeconds,
      },
    });
    await tx.incidentEvent.create({
      data: { incidentId: incident.id, type: 'RESOLVED', message: 'Incident resolved' },
    });
    return updated;
  });

  await logActivity({
    organizationId: monitor.organizationId,
    monitorId: monitor.id,
    type: 'INCIDENT_RESOLVED',
    message: `Incident resolved after ${Math.round(durationSeconds / 60)}m`,
  });

  await sendAlert({
    organizationId: monitor.organizationId,
    monitor,
    alertType: 'MONITOR_RECOVERED',
    message: `${monitor.name} has recovered.`,
    incidentId: incident.id,
    incidentTitle: resolved.title,
    severity: resolved.severity,
    dedupeKey: `recovery:${incident.id}`,
  });

  return resolved;
}

/**
 * Core state machine. Called after every stored check result.
 */
export async function processCheckOutcome(
  monitor: Monitor,
  outcome: CheckOutcome,
  checkResultId: string,
): Promise<void> {
  const isFailure = outcome.status === 'DOWN' || outcome.status === 'DEGRADED';
  const isDown = outcome.status === 'DOWN';

  // ── Failure counter ─────────────────────────────────────
  let failureCount = 0;
  if (isFailure) {
    failureCount = await redis.incr(failureKey(monitor.id));
    await redis.expire(failureKey(monitor.id), 3600);
  } else {
    await redis.del(failureKey(monitor.id));
  }

  const activeIncident = await prisma.incident.findFirst({
    where: { monitorId: monitor.id, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { startedAt: 'desc' },
  });

  const inMaintenance = await inActiveMaintenance(monitor.id);

  // ── Recovery detection ──────────────────────────────────
  if (!isFailure) {
    if (activeIncident) {
      if (activeIncident.status === 'MONITORING') {
        await resolveIncident(monitor, activeIncident);
      } else {
        await prisma.incident.update({
          where: { id: activeIncident.id },
          data: { status: 'MONITORING' },
        });
        await prisma.incidentEvent.create({
          data: {
            incidentId: activeIncident.id,
            type: 'RECOVERED',
            message: 'Service recovered — monitoring before resolution',
            metadata: { checkResultId },
          },
        });
      }
    }
    await handleResponseTimeAnomaly(monitor, outcome);
    await handleSsl(monitor, outcome);
    return;
  }

  // ── Failure path ────────────────────────────────────────
  if (activeIncident) {
    // If we were in recovery monitoring and it failed again, revert.
    if (activeIncident.status === 'MONITORING') {
      await prisma.incident.update({ where: { id: activeIncident.id }, data: { status: 'INVESTIGATING' } });
    }
    await prisma.incident.update({
      where: { id: activeIncident.id },
      data: { failedCheckCount: { increment: 1 } },
    });
    await prisma.incidentEvent.create({
      data: {
        incidentId: activeIncident.id,
        type: 'FAILED_CHECK',
        message: `Failed check (${outcome.errorCode ?? 'unknown'})`,
        metadata: { error: outcome.error, checkResultId },
      },
    });
    return;
  }

  // No active incident. Suppress while in maintenance.
  if (inMaintenance) {
    logger.info({ monitorId: monitor.id }, 'failure during maintenance window, incident suppressed');
    return;
  }

  // Threshold not yet reached.
  if (failureCount < monitor.failureThreshold) {
    return;
  }

  await createIncident(monitor, outcome, failureCount);

  if (isDown) {
    await handleSsl(monitor, outcome);
  }
}

// ── SSL persistence + expiry alerts ──────────────────────────
async function handleSsl(monitor: Monitor, outcome: CheckOutcome): Promise<void> {
  const meta = outcome.metadata ?? {};
  if (!meta.daysRemaining && !meta.validTo) return;

  const validTo = meta.validTo ? new Date(meta.validTo as string) : null;

  await prisma.sslCertificate.create({
    data: {
      organizationId: monitor.organizationId,
      monitorId: monitor.id,
      subject: (meta.subject as string) ?? null,
      issuer: (meta.issuer as string) ?? null,
      serialNumber: (meta.serialNumber as string) ?? null,
      fingerprint: (meta.fingerprint as string) ?? null,
      validFrom: meta.validFrom ? new Date(meta.validFrom as string) : null,
      validTo,
      daysRemaining: (meta.daysRemaining as number) ?? null,
      tlsVersion: (meta.tlsVersion as string) ?? null,
    },
  });

  const days = meta.daysRemaining as number | null;
  if (days == null) return;

  if (days <= 0) {
    await sendAlert({
      organizationId: monitor.organizationId,
      monitor,
      alertType: 'SSL_EXPIRED',
      message: `${monitor.name} SSL certificate has expired.`,
      dedupeKey: `ssl-expired:${monitor.id}`,
      data: { daysRemaining: days },
    });
  } else if (days <= monitor.sslExpiryThresholdDays) {
    await sendAlert({
      organizationId: monitor.organizationId,
      monitor,
      alertType: 'SSL_EXPIRING',
      message: `${monitor.name} SSL certificate expires in ${days} day(s).`,
      dedupeKey: `ssl-expiring:${monitor.id}`,
      dedupeTtlSeconds: 24 * 3600, // at most once per day
      data: { daysRemaining: days },
    });
  }
}

// ── Anomaly detection ────────────────────────────────────────
async function handleResponseTimeAnomaly(monitor: Monitor, outcome: CheckOutcome): Promise<void> {
  if (outcome.responseTimeMs == null) return;

  // Pull a small rolling window of recent response times.
  const recent = await prisma.checkResult.findMany({
    where: { monitorId: monitor.id, status: 'UP', responseTimeMs: { not: null } },
    orderBy: { checkedAt: 'desc' },
    take: 30,
    select: { responseTimeMs: true },
  });
  const history = recent.map((r) => r.responseTimeMs as number);

  if (isAnomalous(outcome.responseTimeMs, history)) {
    const baseline = history.length ? Math.round(history.reduce((a, b) => a + b, 0) / history.length) : null;
    await prisma.anomaly.create({
      data: {
        organizationId: monitor.organizationId,
        monitorId: monitor.id,
        type: 'RESPONSE_TIME_SPIKE',
        severity: 'MEDIUM',
        message: `Unusual response time detected: ${outcome.responseTimeMs}ms (baseline ~${baseline}ms).`,
        metric: 'response_time_ms',
        value: outcome.responseTimeMs,
        baseline,
      },
    });
  }
}
