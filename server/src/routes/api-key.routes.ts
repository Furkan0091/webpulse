import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireOrg } from '../middleware/orgAccess.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import * as apiKeyService from '../services/api-key.service.js';
import { z } from 'zod';

export const apiKeyRouter = Router({ mergeParams: true });

apiKeyRouter.use(requireAuth, requireOrg, requireRole('ADMIN'));

apiKeyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const keys = await apiKeyService.listApiKeys(req.org!.organizationId);
    res.json({ success: true, data: keys });
  }),
);

apiKeyRouter.post(
  '/',
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.string()).min(1),
      expiresAt: z.string().datetime().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const key = await apiKeyService.createApiKey(req.org!.organizationId, req.user!.id, req.body);
    res.status(201).json({ success: true, data: key, warning: 'Store this key now — it will not be shown again.' });
  }),
);

apiKeyRouter.delete(
  '/:keyId',
  validateParams(z.object({ organizationId: z.string().uuid(), keyId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    await apiKeyService.revokeApiKey(req.org!.organizationId, req.params.keyId);
    res.json({ success: true });
  }),
);
