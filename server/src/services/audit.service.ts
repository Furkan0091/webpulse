import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../config/logger.js';

export async function logAudit(input: {
  organizationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({ data: input });
  } catch (err) {
    logger.error({ err, action: input.action }, 'failed to write audit log');
  }
}

export async function logActivity(input: {
  organizationId: string;
  monitorId?: string;
  userId?: string;
  type: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.activityLog.create({ data: input });
  } catch (err) {
    logger.error({ err, type: input.type }, 'failed to write activity log');
  }
}
