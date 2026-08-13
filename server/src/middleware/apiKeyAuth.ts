import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { sha256, timingSafeEqualStr } from '../utils/crypto.js';

/**
 * Authenticates a request using an organization API key.
 * Format: `Authorization: Bearer wp_live_<secret>`. The secret is hashed at
 * rest; we locate the key by prefix then compare the hash.
 */
export async function authenticateApiKey(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next(new AppError('UNAUTHORIZED', 'Missing API key.'));
      return;
    }

    const raw = header.slice('Bearer '.length).trim();
    const prefix = raw.slice(0, 12); // "wp_live_" + 4 chars
    const hash = sha256(raw);

    const candidates = await prisma.apiKey.findMany({
      where: { prefix, revokedAt: null },
      take: 20,
    });

    const key = candidates.find((k) => timingSafeEqualStr(k.keyHash, hash));
    if (!key) {
      next(new AppError('UNAUTHORIZED', 'Invalid API key.'));
      return;
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      next(new AppError('UNAUTHORIZED', 'API key has expired.'));
      return;
    }

    // Best-effort usage tracking (non-blocking).
    prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    req.apiKeyOrgId = key.organizationId;
    req.apiKeyScopes = key.scopes;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.apiKeyScopes || !req.apiKeyScopes.includes(scope)) {
      next(new AppError('FORBIDDEN', `API key missing required scope: ${scope}.`));
      return;
    }
    next();
  };
}
