import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import * as alertingService from '../services/alerting.service.js';
import * as maintenanceService from '../services/maintenance.service.js';
import * as webhookService from '../services/webhook.service.js';
import * as searchService from '../services/search.service.js';

export const resourcesRouter = Router({ mergeParams: true });

resourcesRouter.use(requireAuth, requireOrg);

const idParams = z.object({ organizationId: z.string().uuid(), id: z.string().uuid() });

// ── Notification channels ──────────────────────────────────
resourcesRouter.get('/channels', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await alertingService.listChannels(req.org!.organizationId) });
}));

resourcesRouter.post(
  '/channels',
  requireRole('ADMIN'),
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['EMAIL', 'SLACK', 'DISCORD', 'TEAMS']),
      config: z.record(z.string(), z.unknown()),
    }),
  ),
  asyncHandler(async (req, res) => {
    const channel = await alertingService.createChannel(req.org!.organizationId, req.body);
    res.status(201).json({ success: true, data: channel });
  }),
);

resourcesRouter.patch(
  '/channels/:id',
  requireRole('ADMIN'),
  validateParams(idParams),
  validateBody(z.object({ name: z.string().min(1).max(100).optional(), enabled: z.boolean().optional(), config: z.record(z.string(), z.unknown()).optional() })),
  asyncHandler(async (req, res) => {
    const channel = await alertingService.updateChannel(req.org!.organizationId, req.params.id, req.body);
    res.json({ success: true, data: channel });
  }),
);

resourcesRouter.delete('/channels/:id', requireRole('ADMIN'), validateParams(idParams), asyncHandler(async (req, res) => {
  await alertingService.deleteChannel(req.org!.organizationId, req.params.id);
  res.json({ success: true });
}));

// ── Alert policies ─────────────────────────────────────────
resourcesRouter.get('/alert-policies', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await alertingService.listPolicies(req.org!.organizationId) });
}));

resourcesRouter.post(
  '/alert-policies',
  requireRole('ADMIN'),
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      notifyImmediately: z.boolean().default(true),
      notifyAfterFailures: z.number().int().min(1).max(10).default(1),
      notifyRecovery: z.boolean().default(true),
      escalationMinutes: z.array(z.number().int().min(1)).default([15, 30, 60]),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
      channelIds: z.array(z.string().uuid()).default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const policy = await alertingService.upsertPolicy(req.org!.organizationId, req.body);
    res.status(201).json({ success: true, data: policy });
  }),
);

resourcesRouter.patch(
  '/alert-policies/:id',
  requireRole('ADMIN'),
  validateParams(idParams),
  validateBody(
    z.object({
      name: z.string().min(1).max(100).optional(),
      notifyImmediately: z.boolean().optional(),
      notifyAfterFailures: z.number().int().min(1).max(10).optional(),
      notifyRecovery: z.boolean().optional(),
      escalationMinutes: z.array(z.number().int().min(1)).optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      channelIds: z.array(z.string().uuid()).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = await prisma.alertPolicy.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
      include: { channels: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Alert policy not found.' } });
      return;
    }
    const policy = await alertingService.upsertPolicy(req.org!.organizationId, {
      id: existing.id,
      name: req.body.name ?? existing.name,
      notifyImmediately: req.body.notifyImmediately ?? existing.notifyImmediately,
      notifyAfterFailures: req.body.notifyAfterFailures ?? existing.notifyAfterFailures,
      notifyRecovery: req.body.notifyRecovery ?? existing.notifyRecovery,
      escalationMinutes: req.body.escalationMinutes ?? existing.escalationMinutes,
      severity: req.body.severity ?? existing.severity,
      channelIds: req.body.channelIds ?? existing.channels.map((c) => c.channelId),
    });
    res.json({ success: true, data: policy });
  }),
);

resourcesRouter.delete('/alert-policies/:id', requireRole('ADMIN'), validateParams(idParams), asyncHandler(async (req, res) => {
  await alertingService.deletePolicy(req.org!.organizationId, req.params.id);
  res.json({ success: true });
}));

// ── Maintenance windows ────────────────────────────────────
resourcesRouter.get('/maintenance', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await maintenanceService.listMaintenance(req.org!.organizationId) });
}));

resourcesRouter.post(
  '/maintenance',
  requireRole('ADMIN'),
  validateBody(
    z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      public: z.boolean().default(true),
      monitorIds: z.array(z.string().uuid()).default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const window = await maintenanceService.createMaintenance(req.org!.organizationId, req.body);
    res.status(201).json({ success: true, data: window });
  }),
);

resourcesRouter.delete('/maintenance/:id', requireRole('ADMIN'), validateParams(idParams), asyncHandler(async (req, res) => {
  await maintenanceService.deleteMaintenance(req.org!.organizationId, req.params.id);
  res.json({ success: true });
}));

// ── Webhooks ───────────────────────────────────────────────
resourcesRouter.get('/webhooks', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await webhookService.listWebhooks(req.org!.organizationId) });
}));

resourcesRouter.post(
  '/webhooks',
  requireRole('ADMIN'),
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      url: z.string().url(),
      events: z.array(z.string()).min(1),
      monitorId: z.string().uuid().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const webhook = await webhookService.createWebhook(req.org!.organizationId, req.body);
    res.status(201).json({ success: true, data: webhook });
  }),
);

resourcesRouter.delete('/webhooks/:id', requireRole('ADMIN'), validateParams(idParams), asyncHandler(async (req, res) => {
  await webhookService.deleteWebhook(req.org!.organizationId, req.params.id);
  res.json({ success: true });
}));

// ── Tags ───────────────────────────────────────────────────
resourcesRouter.get('/tags', asyncHandler(async (req, res) => {
  const tags = await prisma.tag.findMany({
    where: { organizationId: req.org!.organizationId },
    include: { _count: { select: { monitors: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: tags });
}));

resourcesRouter.post('/tags', requireRole('DEVELOPER'), validateBody(z.object({ name: z.string().min(1).max(50), color: z.string().max(20).optional() })), asyncHandler(async (req, res) => {
  const tag = await prisma.tag.create({
    data: { organizationId: req.org!.organizationId, name: req.body.name, color: req.body.color },
  });
  res.status(201).json({ success: true, data: tag });
}));

// ── Monitor groups ─────────────────────────────────────────
resourcesRouter.get('/groups', asyncHandler(async (req, res) => {
  const groups = await prisma.monitorGroup.findMany({
    where: { organizationId: req.org!.organizationId },
    include: { monitors: { select: { id: true, name: true, status: true } }, children: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: groups });
}));

resourcesRouter.post('/groups', requireRole('DEVELOPER'), validateBody(z.object({ name: z.string().min(1).max(100), parentId: z.string().uuid().optional(), description: z.string().max(300).optional() })), asyncHandler(async (req, res) => {
  const group = await prisma.monitorGroup.create({
    data: { organizationId: req.org!.organizationId, name: req.body.name, parentId: req.body.parentId, description: req.body.description },
  });
  res.status(201).json({ success: true, data: group });
}));

// ── Search ─────────────────────────────────────────────────
resourcesRouter.get(
  '/search',
  validateQuery(z.object({ q: z.string().max(100).default('') })),
  asyncHandler(async (req, res) => {
    const results = await searchService.search(req.org!.organizationId, (req.query.q as string) ?? '');
    res.json({ success: true, data: results });
  }),
);

// ── Audit logs ─────────────────────────────────────────────
resourcesRouter.get(
  '/audit-logs',
  requireRole('ADMIN'),
  validateQuery(z.object({ page: z.coerce.number().int().default(1), pageSize: z.coerce.number().int().max(100).default(25) })),
  asyncHandler(async (req, res) => {
    const result = await searchService.listAuditLogs(
      req.org!.organizationId,
      Number(req.query.page ?? 1),
      Number(req.query.pageSize ?? 25),
    );
    res.json({ success: true, data: result });
  }),
);
