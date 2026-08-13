import 'dotenv/config';

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function list(value: string | undefined, fallback: string[] = []): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 4000),
  corsOrigins: list(process.env.CORS_ORIGINS, ['http://localhost:5173']),

  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://webpulse:webpulse@localhost:5432/webpulse?schema=public',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'insecure-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'insecure-refresh-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },

  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:4000',
  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:5173',

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'WebPulse <alerts@webpulse.local>',
    secure: bool(process.env.SMTP_SECURE, false),
  },

  // Resend (https://resend.com) is used when RESEND_API_KEY is set; it takes
  // priority over SMTP. Leave empty to fall back to SMTP / dev logging.
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.RESEND_FROM ?? 'WebPulse <onboarding@resend.dev>',
  },

  monitoring: {
    region: process.env.MONITORING_REGION ?? 'us-east-1',
    workerConcurrency: int(process.env.MONITOR_WORKER_CONCURRENCY, 10),
    schedulerIntervalMs: int(process.env.SCHEDULER_INTERVAL_MS, 5000),
    retentionRawChecksDays: int(process.env.RETENTION_RAW_CHECKS_DAYS, 30),
  },
} as const;

export type Env = typeof env;
