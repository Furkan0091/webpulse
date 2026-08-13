import type { ChannelType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { assertSafeUrl } from '../utils/ssrf.js';

export async function listChannels(organizationId: string) {
  return prisma.notificationChannel.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
}

export async function createChannel(
  organizationId: string,
  input: { name: string; type: ChannelType; config: Record<string, unknown> },
) {
  if (input.type === 'SLACK' || input.type === 'DISCORD' || input.type === 'TEAMS') {
    const url = input.config.webhookUrl as string;
    if (!url) throw new AppError('VALIDATION_ERROR', 'webhookUrl is required.');
    await assertSafeUrl(url).catch(() => {
      throw new AppError('VALIDATION_ERROR', 'webhookUrl must be a valid, public URL.');
    });
  }
  return prisma.notificationChannel.create({
    data: {
      organizationId,
      name: input.name,
      type: input.type,
      config: input.config as Prisma.InputJsonValue,
    },
  });
}

export async function updateChannel(
  organizationId: string,
  id: string,
  input: { name?: string; enabled?: boolean; config?: Record<string, unknown> },
) {
  const channel = await prisma.notificationChannel.findFirst({ where: { id, organizationId } });
  if (!channel) throw new AppError('CHANNEL_NOT_FOUND', 'Notification channel not found.');
  return prisma.notificationChannel.update({
    where: { id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.config ? { config: input.config as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function deleteChannel(organizationId: string, id: string) {
  const channel = await prisma.notificationChannel.findFirst({ where: { id, organizationId } });
  if (!channel) throw new AppError('CHANNEL_NOT_FOUND', 'Notification channel not found.');
  await prisma.notificationChannel.delete({ where: { id } });
}

export async function listPolicies(organizationId: string) {
  return prisma.alertPolicy.findMany({
    where: { organizationId },
    include: { channels: { include: { channel: true } }, monitors: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function upsertPolicy(
  organizationId: string,
  input: {
    id?: string;
    name: string;
    notifyImmediately: boolean;
    notifyAfterFailures: number;
    notifyRecovery: boolean;
    escalationMinutes: number[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    channelIds: string[];
  },
) {
  const { channelIds, ...data } = input;

  const channels = await prisma.notificationChannel.findMany({
    where: { id: { in: channelIds }, organizationId },
  });

  const policy = await prisma.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.alertPolicy.findFirst({ where: { id: input.id, organizationId } });
      if (!existing) throw new AppError('NOT_FOUND', 'Alert policy not found.');
      const updated = await tx.alertPolicy.update({
        where: { id: input.id },
        data: {
          name: data.name,
          notifyImmediately: data.notifyImmediately,
          notifyAfterFailures: data.notifyAfterFailures,
          notifyRecovery: data.notifyRecovery,
          escalationMinutes: data.escalationMinutes,
          severity: data.severity,
        },
      });
      await tx.alertPolicyChannel.deleteMany({ where: { policyId: updated.id } });
      await tx.alertPolicyChannel.createMany({
        data: channels.map((c) => ({ policyId: updated.id, channelId: c.id })),
      });
      return updated;
    }

    const created = await tx.alertPolicy.create({
      data: {
        organizationId,
        name: data.name,
        notifyImmediately: data.notifyImmediately,
        notifyAfterFailures: data.notifyAfterFailures,
        notifyRecovery: data.notifyRecovery,
        escalationMinutes: data.escalationMinutes,
        severity: data.severity,
      },
    });
    await tx.alertPolicyChannel.createMany({
      data: channels.map((c) => ({ policyId: created.id, channelId: c.id })),
    });
    return created;
  });

  return policy;
}

export async function deletePolicy(organizationId: string, id: string) {
  const policy = await prisma.alertPolicy.findFirst({ where: { id, organizationId } });
  if (!policy) throw new AppError('NOT_FOUND', 'Alert policy not found.');
  await prisma.alertPolicy.delete({ where: { id } });
}
