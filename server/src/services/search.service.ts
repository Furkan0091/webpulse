import { prisma } from '../lib/prisma.js';

export async function search(organizationId: string, query: string) {
  const q = query.trim();
  if (!q) return { monitors: [], incidents: [], statusPages: [], apiKeys: [], maintenance: [] };

  const contains = { contains: q, mode: 'insensitive' as const };

  const [monitors, incidents, statusPages, apiKeys, maintenance] = await Promise.all([
    prisma.monitor.findMany({
      where: { organizationId, OR: [{ name: contains }, { target: contains }] },
      select: { id: true, name: true, type: true, status: true },
      take: 10,
    }),
    prisma.incident.findMany({
      where: { organizationId, OR: [{ title: contains }, { cause: contains }] },
      select: { id: true, title: true, status: true, severity: true },
      take: 10,
    }),
    prisma.statusPage.findMany({
      where: { organizationId, OR: [{ name: contains }, { slug: contains }] },
      select: { id: true, name: true, slug: true, published: true },
      take: 10,
    }),
    prisma.apiKey.findMany({
      where: { organizationId, name: contains },
      select: { id: true, name: true, prefix: true },
      take: 10,
    }),
    prisma.maintenanceWindow.findMany({
      where: { organizationId, title: contains },
      select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
      take: 10,
    }),
  ]);

  return { monitors, incidents, statusPages, apiKeys, maintenance };
}

export async function listAuditLogs(organizationId: string, page = 1, pageSize = 25) {
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where: { organizationId } }),
  ]);
  return { logs, total, page, pageSize };
}
