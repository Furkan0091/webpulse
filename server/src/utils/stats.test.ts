import { describe, expect, it } from 'vitest';
import { isAnomalous, max, mean, min, p50, p95, p99, percentile } from './stats.js';

describe('percentile', () => {
  it('computes median (p50) of a sorted list', () => {
    expect(p50([1, 2, 3, 4, 5])).toBe(3);
    expect(p50([1, 2, 3, 4])).toBe(3); // nearest-rank interpolation
  });

  it('computes p95 and p99', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(p95(values)).toBe(95);
    expect(p99(values)).toBe(99);
  });

  it('returns null for empty input', () => {
    expect(p50([])).toBeNull();
    expect(p95([])).toBeNull();
    expect(p99([])).toBeNull();
  });
});

describe('aggregates', () => {
  it('computes mean/min/max', () => {
    expect(mean([10, 20, 30])).toBe(20);
    expect(min([10, 20, 30])).toBe(10);
    expect(max([10, 20, 30])).toBe(30);
    expect(mean([])).toBeNull();
  });
});

describe('isAnomalous', () => {
  const baseline = [150, 160, 155, 165, 150, 158, 162, 155, 160, 159, 152, 158];

  it('flags a large spike', () => {
    expect(isAnomalous(2300, baseline)).toBe(true);
  });

  it('does not flag normal variation', () => {
    expect(isAnomalous(165, baseline)).toBe(false);
  });

  it('requires enough history', () => {
    expect(isAnomalous(999999, [150, 160])).toBe(false);
  });
});
