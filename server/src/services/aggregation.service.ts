import type { CheckStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { max, mean, min, p50, p95, p99 } from '../utils/stats.js';

export type Bucket = 'HOURLY' | 'DAILY';

export interface BucketCheck {
  status: CheckStatus;
  responseTimeMs: number | null;
}

export interface BucketMetrics {
  checkCount: number;
  upCount: number;
  downCount: number;
  degradedCount: number;
  uptimePct: number;
  avgResponseTimeMs: number | null;
  minResponseTimeMs: number | null;
  maxResponseTimeMs: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure aggregation over the checks in a single time bucket. Kept side-effect
 * free so it can be unit tested without a database.
 */
export function computeBucketMetrics(checks: BucketCheck[]): BucketMetrics {
  const upCount = checks.filter((c) => c.status === 'UP').length;
  const downCount = checks.filter((c) => c.status === 'DOWN').length;
  const degradedCount = checks.filter((c) => c.status === 'DEGRADED').length;
  const total = checks.length;

  const times = checks
    .filter((c) => c.responseTimeMs != null)
    .map((c) => c.responseTimeMs as number)
    .sort((a, b) => a - b);

  return {
    checkCount: total,
    upCount,
    downCount,
    degradedCount,
    uptimePct: total ? Math.round((upCount / total) * 10000) / 100 : 100,
    avgResponseTimeMs: mean(times),
    minResponseTimeMs: min(times),
    maxResponseTimeMs: max(times),
    p50: p50(times),
    p95: p95(times),
    p99: p99(times),
  };
}

/** Align a date to the start of its HOURLY or DAILY bucket (UTC). */
export function bucketStartFor(bucket: Bucket, date: Date): Date {
  const ms = bucket === 'HOURLY' ? HOUR_MS : DAY_MS;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/**
 * Roll up all raw check results for one closed bucket into `aggregated_metrics`.
 * Idempotent: the unique (monitorId, bucket, bucketStart) constraint makes
 * repeated runs safe (a re-run simply overwrites with the same values).
 */
async function rollupBucket(bucket: Bucket, bucketStart: Date): Promise<number> {
  const bucketEnd = new Date(bucketStart.getTime() + (bucket === 'HOURLY' ? HOUR_MS : DAY_MS));

  const checks = await prisma.checkResult.findMany({
    where: { checkedAt: { gte: bucketStart, lt: bucketEnd } },
    select: { monitorId: true, organizationId: true, status: true, responseTimeMs: true },
  });

  const byMonitor = new Map<string, { organizationId: string; checks: BucketCheck[] }>();
  for (const c of checks) {
    const entry = byMonitor.get(c.monitorId) ?? { organizationId: c.organizationId, checks: [] as BucketCheck[] };
    entry.checks.push({ status: c.status, responseTimeMs: c.responseTimeMs });
    byMonitor.set(c.monitorId, entry);
  }

  let upserted = 0;
  for (const [monitorId, entry] of byMonitor) {
    const m = computeBucketMetrics(entry.checks);
    const data = {
      organizationId: entry.organizationId,
      monitorId,
      bucket,
      bucketStart,
      checkCount: m.checkCount,
      upCount: m.upCount,
      downCount: m.downCount,
      degradedCount: m.degradedCount,
      uptimePct: m.uptimePct,
      avgResponseTimeMs: m.avgResponseTimeMs ?? 0,
      minResponseTimeMs: m.minResponseTimeMs ?? 0,
      maxResponseTimeMs: m.maxResponseTimeMs ?? 0,
      p50: m.p50 ?? 0,
      p95: m.p95 ?? 0,
      p99: m.p99 ?? 0,
    };
    await prisma.aggregatedMetric.upsert({
      where: { monitorId_bucket_bucketStart: { monitorId, bucket, bucketStart } },
      create: data,
      update: data,
    });
    upserted += 1;
  }

  return upserted;
}

/** Roll up the most recently completed hour and day buckets. */
export async function runRollups(): Promise<{ hourly: number; daily: number }> {
  const now = new Date();
  const hourStart = new Date(bucketStartFor('HOURLY', now).getTime() - HOUR_MS);
  const dayStart = new Date(bucketStartFor('DAILY', now).getTime() - DAY_MS);

  // Order matters: roll up before pruning so no raw data is lost.
  const hourly = await rollupBucket('HOURLY', hourStart);
  const daily = await rollupBucket('DAILY', dayStart);
  return { hourly, daily };
}

/**
 * Prune raw check results past their retention window (they live on as
 * `aggregated_metrics`), plus stale notification deliveries. Call *after*
 * rollups so recently-retained checks have already been aggregated.
 */
export async function runRetention(): Promise<{ prunedChecks: number; prunedDeliveries: number }> {
  const rawCutoff = new Date(Date.now() - env.monitoring.retentionRawChecksDays * DAY_MS);
  const prunedChecks = await prisma.checkResult.deleteMany({ where: { checkedAt: { lt: rawCutoff } } });

  const deliveryCutoff = new Date(Date.now() - 90 * DAY_MS);
  const prunedDeliveries = await prisma.notificationDelivery.deleteMany({
    where: { createdAt: { lt: deliveryCutoff } },
  });

  return { prunedChecks: prunedChecks.count, prunedDeliveries: prunedDeliveries.count };
}
