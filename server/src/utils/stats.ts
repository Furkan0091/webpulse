export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

export function p50(values: number[]): number | null {
  return percentile(values, 0.5);
}
export function p95(values: number[]): number | null {
  return percentile(values, 0.95);
}
export function p99(values: number[]): number | null {
  return percentile(values, 0.99);
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null;
}
export function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null;
}

/**
 * Simple statistical anomaly detector: flags a value as anomalous when it is
 * more than `k` standard deviations above the rolling mean.
 */
export function isAnomalous(value: number, history: number[], k = 3): boolean {
  if (history.length < 10) return false;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((a, b) => a + (b - avg) ** 2, 0) / history.length;
  const std = Math.sqrt(variance);
  if (std === 0) return value > avg * 1.5;
  return value > avg + k * std;
}
