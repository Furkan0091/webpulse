import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  DEVELOPER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function roleAtLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Verifies the Bearer access token and attaches `req.user`. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 'Missing access token.'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAccessToken(token);
  req.user = { id: payload.sub, email: payload.email };
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 'Missing access token.'));
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyAccessToken(token);
  req.user = { id: payload.sub, email: payload.email };
  next();
}

/** Requires `req.org` (set by requireOrg) and checks the member's role. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.org) {
      next(new AppError('UNAUTHORIZED', 'Organization context required.'));
      return;
    }
    if (!roles.some((r) => roleAtLeast(req.org!.role, r))) {
      next(new AppError('FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}
