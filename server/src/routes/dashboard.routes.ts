import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { getDashboard } from '../services/dashboard.service.js';

export const dashboardRouter = Router({ mergeParams: true });

dashboardRouter.use(requireAuth, requireOrg);

dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const summary = await getDashboard(req.org!.organizationId);
    res.json({ success: true, data: summary });
  }),
);
