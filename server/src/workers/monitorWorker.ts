import { Worker, type Job } from 'bullmq';
import type { Monitor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { queueConnection } from '../queues/connection.js';
import { QUEUES } from '../queues/names.js';
import { runCheck } from '../monitoring/index.js';
import { processCheckOutcome } from '../incident/engine.js';
import { realtimeBus } from '../realtime/events.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { MonitorCheckJob } from '../queues/index.js';

export async function processMonitorCheck(job: Job<MonitorCheckJob>): Promise<void> {
  const { monitorId, organizationId } = job.data;

  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, organizationId },
  });

  if (!monitor || !monitor.enabled || monitor.paused) {
    return; // monitor deleted or paused mid-flight
  }

  const outcome = await runCheck(monitor);

  // Persist the check result.
  const checkResult = await prisma.checkResult.create({
    data: {
      organizationId,
      monitorId,
      status: outcome.status,
      httpStatus: outcome.httpStatus ?? null,
      responseTimeMs: outcome.responseTimeMs ?? null,
      error: outcome.error ?? null,
      errorCode: outcome.errorCode ?? null,
      region: env.monitoring.region,
      dnsMs: outcome.dnsMs ?? null,
      connectMs: outcome.connectMs ?? null,
      tlsMs: outcome.tlsMs ?? null,
      transferMs: outcome.transferMs ?? null,
      totalMs: outcome.totalMs ?? null,
      metadata: (outcome.metadata ?? {}) as never,
    },
  });

  // Update monitor state. Respect active maintenance windows.
  const inMaintenance = !!(await prisma.maintenanceWindow.findFirst({
    where: {
      startsAt: { lte: new Date() },
      endsAt: { gte: new Date() },
      monitors: { some: { monitorId } },
    },
    select: { id: true },
  }));
  const status = inMaintenance
    ? 'MAINTENANCE'
    : outcome.status === 'DEGRADED'
      ? 'DEGRADED'
      : outcome.status === 'UP'
        ? 'UP'
        : 'DOWN';
  await prisma.monitor.update({
    where: { id: monitorId },
    data: {
      status,
      lastCheckAt: new Date(),
      lastCheckId: checkResult.id,
      lastResponseTimeMs: outcome.responseTimeMs ?? null,
      nextCheckAt: new Date(Date.now() + monitor.intervalSeconds * 1000),
    },
  });

  // Persist DNS records for DNS monitors.
  if (monitor.type === 'DNS' && outcome.metadata?.records) {
    await prisma.dnsRecord.create({
      data: {
        organizationId,
        monitorId,
        recordType: monitor.dnsRecordType ?? 'A',
        records: outcome.metadata.records as never,
        status: outcome.status === 'UP' ? 'OK' : 'ERROR',
        error: outcome.error ?? null,
      },
    });
  }

  // Run incident / alert / ssl / anomaly engines.
  await processCheckOutcome(monitor, outcome, checkResult.id);

  realtimeBus.publish({
    type: 'check.completed',
    organizationId,
    payload: {
      monitorId,
      status,
      responseTimeMs: outcome.responseTimeMs ?? null,
      checkResultId: checkResult.id,
    },
  });
}

export function startMonitorWorker(): Worker<MonitorCheckJob> {
  const worker = new Worker<MonitorCheckJob>(
    QUEUES.MONITOR_CHECKS,
    async (job) => {
      await processMonitorCheck(job);
    },
    {
      connection: queueConnection,
      concurrency: env.monitoring.workerConcurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'monitor check completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'monitor check failed');
  });

  return worker;
}
