import { prisma } from '../lib/prisma.js';
import { monitorQueue } from '../queues/index.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { sendAlert } from '../notifications/engine.js';

/**
 * Claims due monitors atomically (advancing nextCheckAt) so multiple scheduler
 * instances never enqueue the same check twice. Then enqueues a job.
 */
export async function enqueueDueChecks(): Promise<number> {
  const now = new Date();

  const due = await prisma.monitor.findMany({
    where: {
      enabled: true,
      paused: false,
      nextCheckAt: { lte: now },
    },
    select: { id: true, organizationId: true, intervalSeconds: true },
    take: 500,
  });

  let enqueued = 0;
  for (const monitor of due) {
    // Atomically claim: only advance if still due.
    const claimed = await prisma.monitor.updateMany({
      where: { id: monitor.id, nextCheckAt: { lte: now } },
      data: { nextCheckAt: new Date(now.getTime() + monitor.intervalSeconds * 1000) },
    });

    if (claimed.count === 0) continue; // claimed by another scheduler

    await monitorQueue.add(
      'check',
      { monitorId: monitor.id, organizationId: monitor.organizationId },
      { jobId: `check:${monitor.id}:${now.getTime()}`, removeOnComplete: { count: 2000 } },
    );
    enqueued += 1;
  }

  return enqueued;
}

/**
 * Escalation: re-notify if an incident stays unresolved past its configured
 * escalation thresholds.
 */
export async function escalationScan(): Promise<void> {
  const now = Date.now();
  const active = await prisma.incident.findMany({
    where: { status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] } },
    include: { monitor: true },
  });

  for (const incident of active) {
    const monitor = await prisma.monitor.findUnique({
      where: { id: incident.monitorId },
      select: { alertPolicyId: true },
    });
    const policy = monitor?.alertPolicyId
      ? await prisma.alertPolicy.findFirst({ where: { id: monitor.alertPolicyId } })
      : await prisma.alertPolicy.findFirst({ where: { organizationId: incident.organizationId, monitors: { none: {} } } });
    const thresholds = policy?.escalationMinutes ?? [];
    if (thresholds.length === 0) continue;

    const meta = (incident.errorInfo ?? {}) as Record<string, unknown>;
    const sent = (meta.escalationsSent as number[]) ?? [];
    const elapsedMin = (now - incident.detectedAt.getTime()) / 60000;

    for (const minutes of thresholds) {
      if (elapsedMin >= minutes && !sent.includes(minutes)) {
        await sendAlert({
          organizationId: incident.organizationId,
          monitor: incident.monitor,
          alertType: 'ESCALATION',
          message: `${incident.monitor.name} has been down for ${Math.round(elapsedMin)} minutes.`,
          incidentId: incident.id,
          incidentTitle: incident.title,
          severity: incident.severity,
          dedupeKey: `escalation:${incident.id}:${minutes}`,
          data: { minutes, elapsedMinutes: Math.round(elapsedMin) },
        });

        const updated = [...sent, minutes];
        await prisma.incident.update({
          where: { id: incident.id },
          data: { errorInfo: { ...meta, escalationsSent: updated } },
        });
        await prisma.incidentEvent.create({
          data: {
            incidentId: incident.id,
            type: 'ESCALATED',
            message: `Escalated after ${minutes} minute(s)`,
            metadata: { minutes },
          },
        });
        logger.info({ incidentId: incident.id, minutes }, 'escalation sent');
      }
    }
  }
}

export function startScheduler(): NodeJS.Timeout {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const count = await enqueueDueChecks();
      if (count > 0) logger.debug({ count }, 'enqueued due checks');
    } catch (err) {
      logger.error({ err }, 'scheduler tick failed');
    } finally {
      running = false;
    }
  };

  const interval = setInterval(tick, env.monitoring.schedulerIntervalMs);
  tick();

  // Escalation scanner runs on a slower cadence.
  const escalation = setInterval(async () => {
    try {
      await escalationScan();
    } catch (err) {
      logger.error({ err }, 'escalation scan failed');
    }
  }, 60_000);

  // Return a combined handle; unref so it doesn't block shutdown.
  (interval as unknown as { _escalation: NodeJS.Timeout })._escalation = escalation;
  return interval;
}
