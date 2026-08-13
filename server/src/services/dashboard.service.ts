import { prisma } from '../lib/prisma.js';
import { computeOrganizationUptime } from './analytics.service.js';

export async function getDashboard(organizationId: string) {
  const [monitorCounts, activeIncidents, uptime, recentActivity, recentIncidents, attentionMonitors] =
    await Promise.all([
      prisma.monitor.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      prisma.incident.count({
        where: { organizationId, status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] } },
      }),
      computeOrganizationUptime(organizationId, '24h'),
      prisma.activityLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { monitor: { select: { id: true, name: true } } },
      }),
      prisma.incident.findMany({
        where: { organizationId, status: { in: ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] } },
        include: { monitor: { select: { id: true, name: true, type: true } } },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      prisma.monitor.findMany({
        where: { organizationId, status: { in: ['DOWN', 'DEGRADED'] } },
        include: { tags: true },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
    ]);

  const counts: Record<string, number> = { PENDING: 0, UP: 0, DOWN: 0, DEGRADED: 0, PAUSED: 0, MAINTENANCE: 0 };
  for (const row of monitorCounts) counts[row.status] = row._count._all;

  const activeMonitors = counts.UP + counts.DOWN + counts.DEGRADED + counts.PENDING;

  return {
    uptime: {
      pct: uptime.uptimePct,
      avgResponseTimeMs: uptime.avgResponseTimeMs,
      range: uptime.range,
    },
    monitors: {
      total: activeMonitors,
      operational: counts.UP,
      degraded: counts.DEGRADED,
      down: counts.DOWN,
      paused: counts.PAUSED,
      maintenance: counts.MAINTENANCE,
      pending: counts.PENDING,
    },
    activeIncidents,
    attentionMonitors,
    recentActivity,
    recentIncidents,
  };
}
