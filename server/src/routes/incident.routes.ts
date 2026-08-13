import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import * as incidentService from '../services/incident.service.js';
import { z } from 'zod';

export const incidentRouter = Router({ mergeParams: true });

incidentRouter.use(requireAuth, requireOrg);

const params = z.object({ organizationId: z.string().uuid() });
const incidentParams = z.object({ organizationId: z.string().uuid(), incidentId: z.string().uuid() });

const incidentListQuery = z.object({
  status: z.enum(['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  monitorId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

incidentRouter.get(
  '/',
  validateParams(params),
  validateQuery(incidentListQuery),
  asyncHandler(async (req, res) => {
    const q = incidentListQuery.parse(req.query);
    const result = await incidentService.listIncidents(req.org!.organizationId, {
      status: q.status,
      severity: q.severity,
      monitorId: q.monitorId,
      from: q.from,
      to: q.to,
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json({ success: true, data: result });
  }),
);

incidentRouter.get(
  '/:incidentId',
  validateParams(incidentParams),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.getIncident(req.org!.organizationId, req.params.incidentId);
    res.json({ success: true, data: incident });
  }),
);

incidentRouter.post(
  '/:incidentId/acknowledge',
  requireRole('DEVELOPER'),
  validateParams(incidentParams),
  validateBody(z.object({ comment: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.acknowledgeIncident(
      req.org!.organizationId,
      req.params.incidentId,
      req.user!.id,
      req.body.comment,
      req.ip,
    );
    res.json({ success: true, data: incident });
  }),
);

incidentRouter.post(
  '/:incidentId/notes',
  requireRole('DEVELOPER'),
  validateParams(incidentParams),
  validateBody(z.object({ content: z.string().min(1).max(2000) })),
  asyncHandler(async (req, res) => {
    const note = await incidentService.addNote(
      req.org!.organizationId,
      req.params.incidentId,
      req.user!.id,
      req.body.content,
    );
    res.status(201).json({ success: true, data: note });
  }),
);

incidentRouter.patch(
  '/:incidentId/status',
  requireRole('DEVELOPER'),
  validateParams(incidentParams),
  validateBody(
    z.object({
      status: z.enum(['INVESTIGATING', 'IDENTIFIED', 'MONITORING']),
      cause: z.string().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const incident = await incidentService.updateIncidentStatus(
      req.org!.organizationId,
      req.params.incidentId,
      req.user!.id,
      req.body.status,
      req.body.cause,
      req.ip,
    );
    res.json({ success: true, data: incident });
  }),
);
