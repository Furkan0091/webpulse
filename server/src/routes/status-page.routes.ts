import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import * as statusPageService from '../services/status-page.service.js';
import { z } from 'zod';

export const statusPageRouter = Router({ mergeParams: true });

statusPageRouter.use(requireAuth, requireOrg);

const pageParams = z.object({ organizationId: z.string().uuid(), statusPageId: z.string().uuid() });

statusPageRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const pages = await statusPageService.listStatusPages(req.org!.organizationId);
    res.json({ success: true, data: pages });
  }),
);

statusPageRouter.post(
  '/',
  requireRole('ADMIN'),
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      slug: z.string().max(60).optional(),
      logoUrl: z.string().url().optional(),
      theme: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.createStatusPage(req.org!.organizationId, req.body);
    res.status(201).json({ success: true, data: page });
  }),
);

statusPageRouter.get(
  '/:statusPageId',
  validateParams(pageParams),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.getStatusPage(req.org!.organizationId, req.params.statusPageId);
    res.json({ success: true, data: page });
  }),
);

statusPageRouter.patch(
  '/:statusPageId',
  requireRole('ADMIN'),
  validateParams(pageParams),
  validateBody(
    z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).nullable().optional(),
      logoUrl: z.string().url().nullable().optional(),
      theme: z.record(z.string(), z.unknown()).optional(),
      published: z.boolean().optional(),
      customDomain: z.string().max(200).nullable().optional(),
      showUptime: z.boolean().optional(),
      showIncidents: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.updateStatusPage(req.org!.organizationId, req.params.statusPageId, req.body);
    res.json({ success: true, data: page });
  }),
);

statusPageRouter.delete(
  '/:statusPageId',
  requireRole('ADMIN'),
  validateParams(pageParams),
  asyncHandler(async (req, res) => {
    await statusPageService.deleteStatusPage(req.org!.organizationId, req.params.statusPageId);
    res.json({ success: true });
  }),
);

statusPageRouter.put(
  '/:statusPageId/monitors',
  requireRole('ADMIN'),
  validateParams(pageParams),
  validateBody(z.object({ monitorIds: z.array(z.string().uuid()) })),
  asyncHandler(async (req, res) => {
    const page = await statusPageService.setStatusPageMonitors(
      req.org!.organizationId,
      req.params.statusPageId,
      req.body.monitorIds,
    );
    res.json({ success: true, data: page });
  }),
);
