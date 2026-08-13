import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import * as orgService from '../services/org.service.js';
import { logAudit } from '../services/audit.service.js';
import { z } from 'zod';

export const orgRouter = Router();

const orgIdParams = z.object({ organizationId: z.string().uuid() });

orgRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const orgs = await orgService.listOrganizations(req.user!.id);
    res.json({ success: true, data: orgs });
  }),
);

orgRouter.post(
  '/',
  requireAuth,
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      logoUrl: z.string().url().optional(),
      website: z.string().url().optional(),
      industry: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
      timezone: z.string().max(64).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const org = await orgService.createOrganization(req.user!.id, req.body);
    await logAudit({
      organizationId: org.id,
      userId: req.user!.id,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: org.id,
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: org });
  }),
);

orgRouter.get(
  '/:organizationId',
  requireAuth,
  validateParams(orgIdParams),
  requireOrg,
  asyncHandler(async (req, res) => {
    const org = await orgService.getOrganization(req.org!.organizationId, req.user!.id);
    res.json({ success: true, data: org });
  }),
);

orgRouter.patch(
  '/:organizationId',
  requireAuth,
  validateParams(orgIdParams),
  requireOrg,
  requireRole('ADMIN'),
  validateBody(
    z.object({
      name: z.string().min(1).max(100).optional(),
      logoUrl: z.string().url().nullable().optional(),
      website: z.string().url().nullable().optional(),
      industry: z.string().max(100).nullable().optional(),
      description: z.string().max(500).nullable().optional(),
      timezone: z.string().max(64).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const org = await orgService.updateOrganization(req.org!.organizationId, req.body);
    await logAudit({
      organizationId: req.org!.organizationId,
      userId: req.user!.id,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: org.id,
      ip: req.ip,
    });
    res.json({ success: true, data: org });
  }),
);

// ── Members ────────────────────────────────────────────────

orgRouter.get(
  '/:organizationId/members',
  requireAuth,
  validateParams(orgIdParams),
  requireOrg,
  asyncHandler(async (req, res) => {
    const members = await orgService.listMembers(req.org!.organizationId);
    res.json({ success: true, data: members });
  }),
);

orgRouter.post(
  '/:organizationId/members/invite',
  requireAuth,
  validateParams(orgIdParams),
  requireOrg,
  requireRole('ADMIN'),
  validateBody(z.object({ email: z.string().email(), role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']) })),
  asyncHandler(async (req, res) => {
    const member = await orgService.inviteMember(req.org!.organizationId, req.user!.id, req.body);
    await logAudit({
      organizationId: req.org!.organizationId,
      userId: req.user!.id,
      action: 'member.invited',
      resourceType: 'member',
      resourceId: member.id,
      metadata: { email: req.body.email, role: req.body.role },
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: member });
  }),
);

orgRouter.patch(
  '/:organizationId/members/:memberId',
  requireAuth,
  validateParams(orgIdParams.extend({ memberId: z.string().uuid() })),
  requireOrg,
  requireRole('ADMIN'),
  validateBody(
    z.object({
      role: z.enum(['ADMIN', 'DEVELOPER', 'VIEWER']).optional(),
      status: z.enum(['ACTIVE', 'DEACTIVATED']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const member = await orgService.updateMember(req.org!.organizationId, req.params.memberId, req.body);
    res.json({ success: true, data: member });
  }),
);

orgRouter.delete(
  '/:organizationId/members/:memberId',
  requireAuth,
  validateParams(orgIdParams.extend({ memberId: z.string().uuid() })),
  requireOrg,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await orgService.removeMember(req.org!.organizationId, req.params.memberId, req.user!.id);
    res.json({ success: true });
  }),
);
