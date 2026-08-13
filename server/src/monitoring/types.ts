import type { CheckStatus, Monitor } from '@prisma/client';

export interface CheckOutcome {
  status: CheckStatus;
  httpStatus?: number;
  responseTimeMs?: number;
  error?: string;
  errorCode?: string;
  dnsMs?: number | null;
  connectMs?: number | null;
  tlsMs?: number | null;
  transferMs?: number | null;
  totalMs?: number | null;
  metadata?: Record<string, unknown>;
}

export type Checker = (monitor: Monitor) => Promise<CheckOutcome>;
