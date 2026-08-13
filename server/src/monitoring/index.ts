import type { Monitor, MonitorType } from '@prisma/client';
import type { Checker, CheckOutcome } from './types.js';
import { httpChecker } from './checkers/http.checker.js';
import { sslChecker } from './checkers/ssl.checker.js';
import { dnsChecker } from './checkers/dns.checker.js';
import { tcpChecker } from './checkers/tcp.checker.js';
import { logger } from '../config/logger.js';

const CHECKERS: Partial<Record<MonitorType, Checker>> = {
  HTTP: httpChecker,
  API: httpChecker,
  KEYWORD: httpChecker,
  JSON: httpChecker,
  SSL: sslChecker,
  DNS: dnsChecker,
  TCP: tcpChecker,
};

const RETRY_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a single check (with configurable retries on failure) for a monitor.
 * Retries are bounded and only apply to transient failures.
 */
export async function runCheck(monitor: Monitor): Promise<CheckOutcome> {
  const checker = CHECKERS[monitor.type];
  if (!checker) {
    return {
      status: 'DOWN',
      error: `Unsupported monitor type: ${monitor.type}`,
      errorCode: 'UNSUPPORTED_TYPE',
    };
  }

  let outcome: CheckOutcome;
  try {
    outcome = await checker(monitor);
  } catch (err) {
    logger.warn({ err, monitorId: monitor.id }, 'check threw');
    outcome = {
      status: 'DOWN',
      error: err instanceof Error ? err.message : 'Check failed.',
      errorCode: err instanceof Error && 'code' in err ? (err as { code?: string }).code : 'CHECK_ERROR',
    };
  }

  // Retry transient failures up to the configured limit.
  let attempts = 0;
  while (outcome.status === 'DOWN' && attempts < monitor.retries) {
    attempts += 1;
    await sleep(RETRY_DELAY_MS * attempts);
    try {
      outcome = await checker(monitor);
    } catch (err) {
      logger.warn({ err, monitorId: monitor.id, attempt: attempts }, 'retry threw');
      outcome = {
        status: 'DOWN',
        error: err instanceof Error ? err.message : 'Check failed.',
        errorCode: err instanceof Error && 'code' in err ? (err as { code?: string }).code : 'CHECK_ERROR',
      };
    }
  }

  return outcome;
}
