import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { sha256 } from '../utils/crypto.js';

const KEY_PREFIX = 'wp_live_';

export const VALID_SCOPES = [
  'monitors:read',
  'monitors:write',
  'incidents:read',
  'incidents:write',
  'status:read',
  'checks:read',
] as const;

export async function createApiKey(
  organizationId: string,
  userId: string,
  input: { name: string; scopes: string[]; expiresAt?: string },
) {
  if (!input.scopes.length) throw new AppError('VALIDATION_ERROR', 'At least one scope is required.');
  for (const s of input.scopes) {
    if (!VALID_SCOPES.includes(s as (typeof VALID_SCOPES)[number])) {
      throw new AppError('VALIDATION_ERROR', `Unknown scope: ${s}`);
    }
  }

  const secret = nanoid(32);
  const plaintext = `${KEY_PREFIX}${secret}`;
  const key = await prisma.apiKey.create({
    data: {
      organizationId,
      createdById: userId,
      name: input.name,
      prefix: plaintext.slice(0, 12),
      keyHash: sha256(plaintext),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  // Plaintext is returned exactly once.
  return { id: key.id, name: key.name, key: plaintext, prefix: key.prefix, scopes: key.scopes, expiresAt: key.expiresAt };
}

export async function listApiKeys(organizationId: string) {
  return prisma.apiKey.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiKey(organizationId: string, id: string) {
  const key = await prisma.apiKey.findFirst({ where: { id, organizationId } });
  if (!key) throw new AppError('API_KEY_NOT_FOUND', 'API key not found.');
  return prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}
