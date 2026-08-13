import type { CheckStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { bucketStartFor, computeBucketMetrics } from '../src/services/aggregation.service.js';

function checks(values: { status: CheckStatus; responseTimeMs: number | null }[]) {
  return values;
}

describe('computeBucketMetrics', () => {
  it('handles an empty bucket', () => {
    const m = computeBucketMetrics([]);
    expect(m.checkCount).toBe(0);
    expect(m.uptimePct).toBe(100);
    expect(m.avgResponseTimeMs).toBeNull();
    expect(m.p50).toBeNull();
  });

  it('computes counts and uptime for mixed statuses', () => {
    const m = computeBucketMetrics(
      checks([
        { status: 'UP', responseTimeMs: 100 },
        { status: 'UP', responseTimeMs: 200 },
        { status: 'DOWN', responseTimeMs: null },
        { status: 'DEGRADED', responseTimeMs: 500 },
      ]),
    );
    expect(m.checkCount).toBe(4);
    expect(m.upCount).toBe(2);
    expect(m.downCount).toBe(1);
    expect(m.degradedCount).toBe(1);
    expect(m.uptimePct).toBe(50);
    expect(m.avgResponseTimeMs).toBe(267);
    expect(m.minResponseTimeMs).toBe(100);
    expect(m.maxResponseTimeMs).toBe(500);
    expect(m.p50).toBe(200);
  });

  it('computes 100% uptime when all checks are up', () => {
    const m = computeBucketMetrics(
      checks([
        { status: 'UP', responseTimeMs: 100 },
        { status: 'UP', responseTimeMs: 100 },
      ]),
    );
    expect(m.uptimePct).toBe(100);
    expect(m.downCount).toBe(0);
  });
});

describe('bucketStartFor', () => {
  it('aligns to the hour', () => {
    const d = new Date('2026-08-13T10:42:17.000Z');
    expect(bucketStartFor('HOURLY', d).toISOString()).toBe('2026-08-13T10:00:00.000Z');
  });

  it('aligns to the day', () => {
    const d = new Date('2026-08-13T10:42:17.000Z');
    expect(bucketStartFor('DAILY', d).toISOString()).toBe('2026-08-13T00:00:00.000Z');
  });
});
