import { logger } from '../config/logger.js';
import { runRetention, runRollups } from '../services/aggregation.service.js';

/**
 * One housekeeping pass: roll up recently-closed buckets into aggregated
 * metrics, then prune raw checks past retention. Safe to run concurrently
 * across processes because rollups are idempotent upserts and pruning is a
 * bounded delete.
 */
export async function runHousekeeping(): Promise<void> {
  try {
    const { hourly, daily } = await runRollups();
    if (hourly || daily) logger.info({ hourly, daily }, 'rollups completed');
  } catch (err) {
    logger.error({ err }, 'rollup failed');
  }

  try {
    const { prunedChecks, prunedDeliveries } = await runRetention();
    if (prunedChecks || prunedDeliveries) {
      logger.info({ prunedChecks, prunedDeliveries }, 'retention completed');
    }
  } catch (err) {
    logger.error({ err }, 'retention failed');
  }
}

export function startHousekeeping(): NodeJS.Timeout {
  // Kick off shortly after boot, then hourly.
  const boot = setTimeout(() => void runHousekeeping(), 30_000);
  boot.unref?.();

  const interval = setInterval(() => void runHousekeeping(), 60 * 60 * 1000);
  interval.unref?.();
  return interval;
}
