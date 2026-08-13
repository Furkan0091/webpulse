import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { redisPing } from '../lib/redis.js';

export const healthRouter = Router();

async function dbHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [db, redis] = await Promise.all([dbHealth(), redisPing()]);
    const healthy = db && redis;
    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: {
        api: 'healthy',
        database: db ? 'healthy' : 'unhealthy',
        redis: redis ? 'healthy' : 'unhealthy',
        workers: 'healthy', // worker liveness tracked separately
      },
    });
  }),
);

healthRouter.get(
  '/database',
  asyncHandler(async (_req, res) => {
    const db = await dbHealth();
    res.status(db ? 200 : 503).json({ success: db, data: { database: db ? 'healthy' : 'unhealthy' } });
  }),
);

healthRouter.get(
  '/redis',
  asyncHandler(async (_req, res) => {
    const redis = await redisPing();
    res.status(redis ? 200 : 503).json({ success: redis, data: { redis: redis ? 'healthy' : 'unhealthy' } });
  }),
);
