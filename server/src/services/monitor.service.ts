import type { Monitor, MonitorType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { assertSafeUrl } from '../utils/ssrf.js';
import { logAudit, logActivity } from './audit.service.js';
import { computeAnalytics, type AnalyticsRange } from './analytics.service.js';
import type { z } from 'zod';
import type { createMonitorSchema, updateMonitorSchema } from '../validators/monitor.validators.js';

type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;

const URL_BASED_TYPES: MonitorType[] = ['HTTP', 'API', 'SSL', 'KEYWORD', 'JSON'];

async function validateTarget(type: MonitorType, target: string): Promise<void> {
  if (URL_BASED_TYPES.includes(type)) {
    await assertSafeUrl(target);
    return;
  }
  if (type === 'DNS') {
    if (!/^[a-zA-Z0-9.-]+$/.test(target)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid DNS hostname.');
    }
    return;
  }
  if (type === 'TCP') {
    // host:port
    const [host, port] = target.split(':');
    if (!host || !port || Number.isNaN(Number(port))) {
      throw new AppError('VALIDATION_ERROR', 'TCP target must be in the form host:port.');
    }
    await assertSafeUrl(`http://${target}`).catch(() => {
      throw new AppError('VALIDATION_ERROR', 'TCP target must be in the form host:port.');
    });
    return;
  }
}

export async function createMonitor(
  organizationId: string,
  userId: string,
  input: CreateMonitorInput,
  ip?: string,
): Promise<Monitor> {
  await validateTarget(input.type, input.target);

  if (input.intervalSeconds < 30) {
    throw new AppError('VALIDATION_ERROR', 'Minimum check interval is 30 seconds.');
  }

  const { tags = [], dependencyIds = [], ...data } = input;

  const monitor = await prisma.$transaction(async (tx) => {
    const created = await tx.monitor.create({
      data: {
        ...data,
        organizationId,
        createdById: userId,
        nextCheckAt: new Date(Date.now() + input.intervalSeconds * 1000),
        headers: input.headers as Prisma.InputJsonValue,
        requestBody: input.requestBody as Prisma.InputJsonValue,
        auth: input.auth as Prisma.InputJsonValue,
        assertions: input.assertions as Prisma.InputJsonValue,
        tags: {
          connectOrCreate: tags.map((name) => ({
            where: { organizationId_name: { organizationId, name } },
            create: { organizationId, name },
          })),
        },
        ...(dependencyIds.length
          ? { dependents: { connect: dependencyIds.map((id) => ({ id })) } }
          : {}),
      },
    });
    return created;
  });

  await logAudit({
    organizationId,
    userId,
    action: 'monitor.created',
    resourceType: 'monitor',
    resourceId: monitor.id,
    metadata: { name: monitor.name, type: monitor.type },
    ip,
  });
  await logActivity({
    organizationId,
    monitorId: monitor.id,
    userId,
    type: 'MONITOR_CREATED',
    message: `Monitor "${monitor.name}" created`,
  });

  return monitor;
}

export async function listMonitors(
  organizationId: string,
  query: {
    status?: string;
    type?: string;
    tag?: string;
    groupId?: string;
    search?: string;
    page: number;
    pageSize: number;
  },
) {
  const where: Prisma.MonitorWhereInput = { organizationId };

  if (query.status) where.status = query.status as never;
  if (query.type) where.type = query.type as never;
  if (query.groupId) where.groupId = query.groupId;
  if (query.tag) where.tags = { some: { name: query.tag } };
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { target: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [monitors, total] = await Promise.all([
    prisma.monitor.findMany({
      where,
      include: {
        tags: true,
        group: true,
        sslCertificates: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.monitor.count({ where }),
  ]);

  return { monitors, total, page: query.page, pageSize: query.pageSize };
}

export async function getMonitor(organizationId: string, monitorId: string) {
  const monitor = await prisma.monitor.findFirst({
    where: { id: monitorId, organizationId },
    include: {
      tags: true,
      group: true,
      alertPolicy: { include: { channels: { include: { channel: true } } } },
      sslCertificates: { orderBy: { checkedAt: 'desc' }, take: 1 },
      dependents: { select: { id: true, name: true, status: true, type: true } },
      dependencies: { select: { id: true, name: true, status: true, type: true } },
    },
  });
  if (!monitor) throw new AppError('MONITOR_NOT_FOUND', 'The requested monitor could not be found.');
  return monitor;
}

export async function updateMonitor(
  organizationId: string,
  monitorId: string,
  userId: string,
  input: UpdateMonitorInput,
  ip?: string,
) {
  const existing = await getMonitor(organizationId, monitorId);

  if (input.target && input.target !== existing.target) {
    await validateTarget(existing.type, input.target);
  }

  const { tags, dependencyIds, alertPolicyId, ...data } = input;

  const monitor = await prisma.$transaction(async (tx) => {
    const updated = await tx.monitor.update({
      where: { id: monitorId },
      data: {
        ...data,
        ...(alertPolicyId !== undefined ? { alertPolicyId: alertPolicyId || null } : {}),
        headers: input.headers === undefined ? undefined : (input.headers as Prisma.InputJsonValue),
        requestBody: input.requestBody === undefined ? undefined : (input.requestBody as Prisma.InputJsonValue),
        auth: input.auth === undefined ? undefined : (input.auth as Prisma.InputJsonValue),
        assertions: input.assertions === undefined ? undefined : (input.assertions as Prisma.InputJsonValue),
        ...(input.intervalSeconds
          ? { nextCheckAt: new Date(Date.now() + input.intervalSeconds * 1000) }
          : {}),
        ...(tags ? { tags: { set: [], connectOrCreate: tags.map((name) => ({
            where: { organizationId_name: { organizationId, name } },
            create: { organizationId, name },
          })) } } : {}),
        ...(dependencyIds ? { dependents: { set: dependencyIds.map((id) => ({ id })) } } : {}),
      },
    });
    return updated;
  });

  await logAudit({
    organizationId,
    userId,
    action: 'monitor.updated',
    resourceType: 'monitor',
    resourceId: monitorId,
    metadata: { fields: Object.keys(input) },
    ip,
  });
  await logActivity({
    organizationId,
    monitorId,
    userId,
    type: 'MONITOR_UPDATED',
    message: `Monitor configuration updated`,
  });

  return monitor;
}

export async function deleteMonitor(organizationId: string, monitorId: string, userId: string, ip?: string) {
  await getMonitor(organizationId, monitorId);
  await prisma.monitor.delete({ where: { id: monitorId } });
  await logAudit({
    organizationId,
    userId,
    action: 'monitor.deleted',
    resourceType: 'monitor',
    resourceId: monitorId,
    ip,
  });
}

export async function setPaused(organizationId: string, monitorId: string, paused: boolean, userId: string) {
  await getMonitor(organizationId, monitorId);
  const monitor = await prisma.monitor.update({
    where: { id: monitorId },
    data: { paused, status: paused ? 'PAUSED' : 'PENDING', nextCheckAt: paused ? null : new Date() },
  });
  await logActivity({
    organizationId,
    monitorId,
    userId,
    type: paused ? 'MONITOR_PAUSED' : 'MONITOR_RESUMED',
    message: paused ? 'Monitor paused' : 'Monitor resumed',
  });
  return monitor;
}

export async function listChecks(
  organizationId: string,
  monitorId: string,
  query: { page: number; pageSize: number; status?: string; from?: Date; to?: Date },
) {
  await getMonitor(organizationId, monitorId);

  const where: Prisma.CheckResultWhereInput = {
    monitorId,
    organizationId,
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.from || query.to
      ? {
          checkedAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const [checks, total] = await Promise.all([
    prisma.checkResult.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.checkResult.count({ where }),
  ]);

  return { checks, total, page: query.page, pageSize: query.pageSize };
}

export async function getMonitorAnalytics(organizationId: string, monitorId: string, range: AnalyticsRange) {
  await getMonitor(organizationId, monitorId);
  return computeAnalytics(organizationId, monitorId, range);
}
