import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { slugify } from '../utils/slug.js';
import { nanoid } from 'nanoid';

export async function listStatusPages(organizationId: string) {
  return prisma.statusPage.findMany({
    where: { organizationId },
    include: { monitors: { include: { monitor: { select: { id: true, name: true, status: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createStatusPage(
  organizationId: string,
  input: { name: string; description?: string; slug?: string; logoUrl?: string; theme?: Prisma.InputJsonValue },
) {
  let slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!slug) slug = `status-${nanoid(6)}`;
  const exists = await prisma.statusPage.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${nanoid(4)}`;

  return prisma.statusPage.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      slug,
      logoUrl: input.logoUrl,
      theme: (input.theme ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function getStatusPage(organizationId: string, id: string) {
  const page = await prisma.statusPage.findFirst({
    where: { id, organizationId },
    include: { monitors: { include: { monitor: true }, orderBy: { position: 'asc' } } },
  });
  if (!page) throw new AppError('STATUS_PAGE_NOT_FOUND', 'Status page not found.');
  return page;
}

export async function updateStatusPage(
  organizationId: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    logoUrl?: string | null;
    theme?: Prisma.InputJsonValue;
    published?: boolean;
    customDomain?: string | null;
    showUptime?: boolean;
    showIncidents?: boolean;
  },
) {
  await getStatusPage(organizationId, id);
  return prisma.statusPage.update({ where: { id }, data: input });
}

export async function deleteStatusPage(organizationId: string, id: string) {
  await getStatusPage(organizationId, id);
  await prisma.statusPage.delete({ where: { id } });
}

export async function setStatusPageMonitors(organizationId: string, id: string, monitorIds: string[]) {
  await getStatusPage(organizationId, id);
  await prisma.$transaction(async (tx) => {
    await tx.statusPageMonitor.deleteMany({ where: { statusPageId: id } });
    await tx.statusPageMonitor.createMany({
      data: monitorIds.map((monitorId, position) => ({ statusPageId: id, monitorId, position })),
    });
  });
  return getStatusPage(organizationId, id);
}

/** Public, read-only status aggregation. */
export async function getPublicStatus(slug: string) {
  const page = await prisma.statusPage.findUnique({
    where: { slug },
    include: {
      monitors: {
        include: {
          monitor: {
            include: {
              sslCertificates: { orderBy: { checkedAt: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!page || !page.published) {
    throw new AppError('STATUS_PAGE_NOT_FOUND', 'Status page not found.');
  }

  const now = new Date();
  const activeMaintenance = await prisma.maintenanceWindow.findMany({
    where: {
      organizationId: page.organizationId,
      public: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    include: { monitors: { select: { monitorId: true } } },
  });

  const monitorIds = page.monitors.map((m) => m.monitorId);
  const activeIncidents = await prisma.incident.findMany({
    where: {
      organizationId: page.organizationId,
      public: true,
      status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] },
      monitorId: { in: monitorIds },
    },
    include: { monitor: { select: { id: true, name: true } } },
    orderBy: { startedAt: 'desc' },
  });

  const maintenanceByMonitor = new Map<string, boolean>();
  for (const w of activeMaintenance) {
    for (const m of w.monitors) maintenanceByMonitor.set(m.monitorId, true);
  }

  const monitors = page.monitors.map(({ monitor }) => {
    const inMaintenance = maintenanceByMonitor.get(monitor.id) ?? false;
    return {
      id: monitor.id,
      name: monitor.name,
      type: monitor.type,
      target: monitor.target,
      status: inMaintenance ? 'MAINTENANCE' : monitor.status,
      lastCheckAt: monitor.lastCheckAt,
      lastResponseTimeMs: monitor.lastResponseTimeMs,
    };
  });

  const statuses = monitors.map((m) => m.status);
  const overall = statuses.some((s) => s === 'DOWN')
    ? 'DOWN'
    : statuses.some((s) => s === 'DEGRADED')
      ? 'DEGRADED'
      : statuses.some((s) => s === 'MAINTENANCE')
        ? 'MAINTENANCE'
        : statuses.every((s) => s === 'UP' || s === 'PENDING')
          ? 'UP'
          : 'UP';

  return {
    name: page.name,
    description: page.description,
    logoUrl: page.logoUrl,
    theme: page.theme,
    overall,
    showUptime: page.showUptime,
    showIncidents: page.showIncidents,
    monitors,
    activeIncidents,
    maintenance: activeMaintenance.map((w) => ({
      title: w.title,
      description: w.description,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
    })),
  };
}
