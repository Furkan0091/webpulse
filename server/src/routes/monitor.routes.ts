import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import * as monitorService from '../services/monitor.service.js';
import { z } from 'zod';
import {
  checksQuery,
  createMonitorSchema,
  listMonitorsQuery,
  updateMonitorSchema,
} from '../validators/monitor.validators.js';

export const monitorRouter = Router({ mergeParams: true });

const orgParams = z.object({ organizationId: z.string().uuid() });
const monitorParams = z.object({ organizationId: z.string().uuid(), monitorId: z.string().uuid() });

monitorRouter.use(requireAuth, requireOrg);

/**
 * @swagger
 * /orgs/{organizationId}/monitors:
 *   get:
 *     summary: List monitors
 *     security: [{ bearerAuth: [] }]
 */
monitorRouter.get(
  '/',
  validateParams(orgParams),
  validateQuery(listMonitorsQuery),
  asyncHandler(async (req, res) => {
    const q = listMonitorsQuery.parse(req.query);
    const result = await monitorService.listMonitors(req.org!.organizationId, q);
    res.json({ success: true, data: result });
  }),
);

monitorRouter.post(
  '/',
  requireRole('DEVELOPER'),
  validateParams(orgParams),
  validateBody(createMonitorSchema),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.createMonitor(
      req.org!.organizationId,
      req.user!.id,
      req.body,
      req.ip,
    );
    res.status(201).json({ success: true, data: monitor });
  }),
);

monitorRouter.get(
  '/:monitorId',
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.getMonitor(req.org!.organizationId, req.params.monitorId);
    res.json({ success: true, data: monitor });
  }),
);

monitorRouter.patch(
  '/:monitorId',
  requireRole('DEVELOPER'),
  validateParams(monitorParams),
  validateBody(updateMonitorSchema),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.updateMonitor(
      req.org!.organizationId,
      req.params.monitorId,
      req.user!.id,
      req.body,
      req.ip,
    );
    res.json({ success: true, data: monitor });
  }),
);

monitorRouter.delete(
  '/:monitorId',
  requireRole('DEVELOPER'),
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    await monitorService.deleteMonitor(req.org!.organizationId, req.params.monitorId, req.user!.id, req.ip);
    res.json({ success: true });
  }),
);

monitorRouter.post(
  '/:monitorId/pause',
  requireRole('DEVELOPER'),
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.setPaused(req.org!.organizationId, req.params.monitorId, true, req.user!.id);
    res.json({ success: true, data: monitor });
  }),
);

monitorRouter.post(
  '/:monitorId/resume',
  requireRole('DEVELOPER'),
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.setPaused(req.org!.organizationId, req.params.monitorId, false, req.user!.id);
    res.json({ success: true, data: monitor });
  }),
);

monitorRouter.get(
  '/:monitorId/checks',
  validateParams(monitorParams),
  validateQuery(checksQuery),
  asyncHandler(async (req, res) => {
    const q = checksQuery.parse(req.query);
    const result = await monitorService.listChecks(req.org!.organizationId, req.params.monitorId, {
      page: q.page,
      pageSize: q.pageSize,
      status: q.status,
      from: q.from,
      to: q.to,
    });
    res.json({ success: true, data: result });
  }),
);

monitorRouter.get(
  '/:monitorId/analytics',
  validateParams(monitorParams),
  validateQuery(z.object({ range: z.enum(['1h', '24h', '7d', '30d', '90d']).default('24h') })),
  asyncHandler(async (req, res) => {
    const analytics = await monitorService.getMonitorAnalytics(
      req.org!.organizationId,
      req.params.monitorId,
      req.query.range as never,
    );
    res.json({ success: true, data: analytics });
  }),
);

monitorRouter.get(
  '/:monitorId/activity',
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    const { prisma } = await import('../lib/prisma.js');
    const activity = await prisma.activityLog.findMany({
      where: { monitorId: req.params.monitorId, organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: activity });
  }),
);
