import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'password',
      'passwordHash',
      '*.password',
      'req.headers.authorization',
      'refreshToken',
      'keyHash',
      'secret',
      '*.secret',
      'token',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'webpulse-api' },
  transport: env.isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});

export type Logger = typeof logger;
