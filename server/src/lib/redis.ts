import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  // Redis is a dependency for queues but the API should remain operational
  // if it is temporarily unavailable (graceful failure).
  logger.error({ err }, 'redis error');
});

redis.on('ready', () => logger.info('redis connected'));

export async function redisPing(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
