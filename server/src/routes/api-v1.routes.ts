import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticateApiKey, requireScope } from '../middleware/apiKeyAuth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import * as monitorService from '../services/monitor.service.js';
import * as incidentService from '../services/incident.service.js';
import { createMonitorSchema, updateMonitorSchema, listMonitorsQuery, checksQuery } from '../validators/monitor.validators.js';
import { z } from 'zod';

export const apiV1Router = Router();

apiV1Router.use(authenticateApiKey);

const monitorParams = z.object({ monitorId: z.string().uuid() });

/**
 * @swagger
 * /v1/monitors:
 *   get:
 *     summary: List monitors (API key)
 */
apiV1Router.get(
  '/monitors',
  requireScope('monitors:read'),
  validateQuery(listMonitorsQuery),
  asyncHandler(async (req, res) => {
    const q = listMonitorsQuery.parse(req.query);
    const result = await monitorService.listMonitors(req.apiKeyOrgId!, q);
    res.json({ success: true, data: result });
  }),
);

apiV1Router.post(
  '/monitors',
  requireScope('monitors:write'),
  validateBody(createMonitorSchema),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.createMonitor(req.apiKeyOrgId!, 'api-key', req.body);
    res.status(201).json({ success: true, data: monitor });
  }),
);

apiV1Router.get(
  '/monitors/:monitorId',
  requireScope('monitors:read'),
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.getMonitor(req.apiKeyOrgId!, req.params.monitorId);
    res.json({ success: true, data: monitor });
  }),
);

apiV1Router.patch(
  '/monitors/:monitorId',
  requireScope('monitors:write'),
  validateParams(monitorParams),
  validateBody(updateMonitorSchema),
  asyncHandler(async (req, res) => {
    const monitor = await monitorService.updateMonitor(req.apiKeyOrgId!, req.params.monitorId, 'api-key', req.body);
    res.json({ success: true, data: monitor });
  }),
);

apiV1Router.get(
  '/monitors/:monitorId/status',
  requireScope('status:read'),
  validateParams(monitorParams),
  asyncHandler(async (req, res) => {
    const monitor = await prisma.monitor.findFirst({
      where: { id: req.params.monitorId, organizationId: req.apiKeyOrgId },
      select: { id: true, name: true, status: true, lastCheckAt: true, lastResponseTimeMs: true },
    });
    if (!monitor) throw new AppError('MONITOR_NOT_FOUND', 'The requested monitor could not be found.');
    res.json({ success: true, data: monitor });
  }),
);

apiV1Router.get(
  '/monitors/:monitorId/uptime',
  requireScope('status:read'),
  validateParams(monitorParams),
  validateQuery(z.object({ range: z.enum(['24h', '7d', '30d', '90d']).default('24h') })),
  asyncHandler(async (req, res) => {
    const analytics = await monitorService.getMonitorAnalytics(
      req.apiKeyOrgId!,
      req.params.monitorId,
      req.query.range as never,
    );
    res.json({ success: true, data: analytics });
  }),
);

apiV1Router.get(
  '/monitors/:monitorId/checks',
  requireScope('checks:read'),
  validateParams(monitorParams),
  validateQuery(checksQuery),
  asyncHandler(async (req, res) => {
    const q = checksQuery.parse(req.query);
    const result = await monitorService.listChecks(req.apiKeyOrgId!, req.params.monitorId, {
      page: q.page,
      pageSize: q.pageSize,
      status: q.status,
      from: q.from,
      to: q.to,
    });
    res.json({ success: true, data: result });
  }),
);

apiV1Router.get(
  '/incidents',
  requireScope('incidents:read'),
  validateQuery(z.object({ status: z.string().optional(), page: z.coerce.number().int().default(1), pageSize: z.coerce.number().int().max(100).default(25) })),
  asyncHandler(async (req, res) => {
    const q = { status: req.query.status as string | undefined, page: Number(req.query.page ?? 1), pageSize: Number(req.query.pageSize ?? 25) };
    const result = await incidentService.listIncidents(req.apiKeyOrgId!, {
      status: q.status,
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json({ success: true, data: result });
  }),
);
