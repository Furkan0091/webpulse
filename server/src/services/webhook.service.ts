import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { assertSafeUrl } from '../utils/ssrf.js';

const VALID_EVENTS = [
  'monitor.down',
  'monitor.recovered',
  'incident.created',
  'incident.resolved',
  'ssl.expiring',
  'maintenance.started',
] as const;

export async function listWebhooks(organizationId: string) {
  return prisma.webhook.findMany({
    where: { organizationId },
    include: { monitor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createWebhook(
  organizationId: string,
  input: { name: string; url: string; events: string[]; monitorId?: string },
) {
  if (!input.events.length) throw new AppError('VALIDATION_ERROR', 'At least one event is required.');
  for (const e of input.events) {
    if (!VALID_EVENTS.includes(e as (typeof VALID_EVENTS)[number])) {
      throw new AppError('VALIDATION_ERROR', `Unknown event: ${e}`);
    }
  }
  await assertSafeUrl(input.url).catch(() => {
    throw new AppError('VALIDATION_ERROR', 'Webhook URL must be a valid, public URL.');
  });

  return prisma.webhook.create({
    data: {
      organizationId,
      name: input.name,
      url: input.url,
      events: input.events,
      monitorId: input.monitorId ?? null,
      secret: nanoid(32),
    },
    select: { id: true, name: true, url: true, events: true, monitorId: true, createdAt: true },
  });
}

export async function deleteWebhook(organizationId: string, id: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id, organizationId } });
  if (!webhook) throw new AppError('NOT_FOUND', 'Webhook not found.');
  await prisma.webhook.delete({ where: { id } });
}
