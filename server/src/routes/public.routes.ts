import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getPublicStatus } from '../services/status-page.service.js';
import { z } from 'zod';
import { validateParams } from '../middleware/validate.js';

export const publicRouter = Router();

/**
 * GET /api/public/status/:slug — unauthenticated, read-only status.
 */
publicRouter.get(
  '/status/:slug',
  validateParams(z.object({ slug: z.string().max(60) })),
  asyncHandler(async (req, res) => {
    const status = await getPublicStatus(req.params.slug);
    res.json({ success: true, data: status });
  }),
);
