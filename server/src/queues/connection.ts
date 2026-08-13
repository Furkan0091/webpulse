import IORedis from 'ioredis';
import { env } from '../config/env.js';

// Dedicated connection for BullMQ (maxRetriesPerRequest must be null).
export const queueConnection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

queueConnection.on('error', () => {
  // Swallow — handled at the queue/worker level for graceful failure.
});
