import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * Resolves the organization from `req.params.organizationId` and verifies the
 * authenticated user is an ACTIVE member. Attaches `req.org` with the member's
 * role. This is the single choke-point enforcing multi-tenant isolation.
 */
export async function requireOrg(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authentication required.'));
      return;
    }

    const organizationId = req.params.organizationId;
    if (!organizationId) {
      next(new AppError('BAD_REQUEST', 'Missing organization id.'));
      return;
    }

    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: req.user.id } },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      // Deliberately ambiguous: do not reveal whether the org exists.
      next(new AppError('FORBIDDEN', 'You do not have access to this organization.'));
      return;
    }

    req.org = {
      organizationId,
      role: membership.role,
      membershipId: membership.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}
