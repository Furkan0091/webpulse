import { prisma } from '../lib/prisma.js';
import { max, mean, min, p50, p95, p99 } from '../utils/stats.js';

export type AnalyticsRange = '1h' | '24h' | '7d' | '30d' | '90d';

const RANGE_WINDOWS: Record<AnalyticsRange, { days: number; bucketMs: number }> = {
  '1h': { days: 0.0417, bucketMs: 5 * 60 * 1000 },
  '24h': { days: 1, bucketMs: 60 * 60 * 1000 },
  '7d': { days: 7, bucketMs: 6 * 60 * 60 * 1000 },
  '30d': { days: 30, bucketMs: 24 * 60 * 60 * 1000 },
  '90d': { days: 90, bucketMs: 24 * 60 * 60 * 1000 },
};

export interface AnalyticsResult {
  range: AnalyticsRange;
  from: Date;
  to: Date;
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  degradedChecks: number;
  uptimePct: number;
  responseTime: { avg: number | null; min: number | null; max: number | null; p50: number | null; p95: number | null; p99: number | null };
  series: Array<{ ts: string; avgResponseTimeMs: number | null; uptimePct: number | null; checks: number }>;
}

export async function computeAnalytics(
  organizationId: string,
  monitorId: string,
  range: AnalyticsRange,
): Promise<AnalyticsResult> {
  const { days, bucketMs } = RANGE_WINDOWS[range];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const checks = await prisma.checkResult.findMany({
    where: { organizationId, monitorId, checkedAt: { gte: from, lte: to } },
    select: { status: true, responseTimeMs: true, checkedAt: true },
    orderBy: { checkedAt: 'asc' },
  });

  const upChecks = checks.filter((c) => c.status === 'UP').length;
  const downChecks = checks.filter((c) => c.status === 'DOWN').length;
  const degradedChecks = checks.filter((c) => c.status === 'DEGRADED').length;
  const uptimePct = checks.length ? (upChecks / checks.length) * 100 : 100;

  const responseTimes = checks
    .filter((c) => c.responseTimeMs != null)
    .map((c) => c.responseTimeMs as number)
    .sort((a, b) => a - b);

  // Build time-series buckets.
  const buckets = new Map<string, { times: number[]; total: number; up: number }>();
  const bucketCount = Math.ceil((to.getTime() - from.getTime()) / bucketMs);

  for (let i = 0; i < bucketCount; i++) {
    const ts = new Date(from.getTime() + i * bucketMs);
    buckets.set(ts.toISOString(), { times: [], total: 0, up: 0 });
  }

  for (const check of checks) {
    const bucketStart = Math.floor(check.checkedAt.getTime() / bucketMs) * bucketMs;
    const key = new Date(bucketStart).toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (check.status === 'UP') bucket.up += 1;
    if (check.responseTimeMs != null) bucket.times.push(check.responseTimeMs);
  }

  const series = Array.from(buckets.entries()).map(([ts, b]) => ({
    ts,
    avgResponseTimeMs: mean(b.times),
    uptimePct: b.total ? (b.up / b.total) * 100 : null,
    checks: b.total,
  }));

  return {
    range,
    from,
    to,
    totalChecks: checks.length,
    upChecks,
    downChecks,
    degradedChecks,
    uptimePct: Math.round(uptimePct * 100) / 100,
    responseTime: {
      avg: mean(responseTimes),
      min: min(responseTimes),
      max: max(responseTimes),
      p50: p50(responseTimes),
      p95: p95(responseTimes),
      p99: p99(responseTimes),
    },
    series,
  };
}

/** Multi-monitor aggregate for the dashboard. */
export async function computeOrganizationUptime(organizationId: string, range: AnalyticsRange) {
  const { days } = RANGE_WINDOWS[range];
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await prisma.checkResult.groupBy({
    by: ['status'],
    where: { organizationId, checkedAt: { gte: from } },
    _count: { _all: true },
  });

  const counts = { UP: 0, DOWN: 0, DEGRADED: 0 };
  for (const row of result) {
    counts[row.status as keyof typeof counts] = row._count._all;
  }
  const total = counts.UP + counts.DOWN + counts.DEGRADED;
  const uptimePct = total ? (counts.UP / total) * 100 : 100;

  const agg = await prisma.checkResult.aggregate({
    where: { organizationId, checkedAt: { gte: from }, responseTimeMs: { not: null } },
    _avg: { responseTimeMs: true },
  });

  return {
    range,
    totalChecks: total,
    ...counts,
    uptimePct: Math.round(uptimePct * 100) / 100,
    avgResponseTimeMs: agg._avg.responseTimeMs ? Math.round(agg._avg.responseTimeMs) : null,
  };
}
