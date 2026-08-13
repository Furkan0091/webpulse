import type { IncidentStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { logAudit } from './audit.service.js';

export async function listIncidents(
  organizationId: string,
  query: {
    status?: string;
    severity?: string;
    monitorId?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  },
) {
  const where: Prisma.IncidentWhereInput = { organizationId };
  if (query.status) where.status = query.status as IncidentStatus;
  if (query.severity) where.severity = query.severity as never;
  if (query.monitorId) where.monitorId = query.monitorId;
  if (query.from || query.to) {
    where.startedAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: { monitor: { select: { id: true, name: true, type: true, target: true } } },
      orderBy: { startedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.incident.count({ where }),
  ]);

  return { incidents, total, page: query.page, pageSize: query.pageSize };
}

export async function getIncident(organizationId: string, incidentId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, organizationId },
    include: {
      monitor: true,
      acknowledgedBy: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: 'asc' } },
      notes: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!incident) throw new AppError('INCIDENT_NOT_FOUND', 'The requested incident could not be found.');
  return incident;
}

export async function acknowledgeIncident(
  organizationId: string,
  incidentId: string,
  userId: string,
  comment?: string,
  ip?: string,
) {
  const incident = await getIncident(organizationId, incidentId);
  if (incident.status === 'RESOLVED') {
    throw new AppError('CONFLICT', 'Cannot acknowledge a resolved incident.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const inc = await tx.incident.update({
      where: { id: incidentId },
      data: {
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
        acknowledgedComment: comment ?? null,
      },
    });
    await tx.incidentEvent.create({
      data: {
        incidentId,
        type: 'ACKNOWLEDGED',
        message: `Incident acknowledged${comment ? `: ${comment}` : ''}`,
        metadata: { userId },
      },
    });
    return inc;
  });

  await logAudit({
    organizationId,
    userId,
    action: 'incident.acknowledged',
    resourceType: 'incident',
    resourceId: incidentId,
    ip,
  });
  return updated;
}

export async function addNote(organizationId: string, incidentId: string, userId: string, content: string) {
  const incident = await getIncident(organizationId, incidentId);
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.incidentNote.create({ data: { incidentId, userId, content } });
    await tx.incidentEvent.create({
      data: { incidentId, type: 'NOTE_ADDED', message: 'Internal note added', metadata: { noteId: created.id } },
    });
    return created;
  });
  return note;
}

export async function updateIncidentStatus(
  organizationId: string,
  incidentId: string,
  userId: string,
  status: Exclude<IncidentStatus, 'RESOLVED'>,
  cause?: string,
  ip?: string,
) {
  const incident = await getIncident(organizationId, incidentId);
  if (incident.status === 'RESOLVED') {
    throw new AppError('CONFLICT', 'Cannot change the status of a resolved incident.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const inc = await tx.incident.update({
      where: { id: incidentId },
      data: { status, ...(cause !== undefined ? { cause } : {}) },
    });
    await tx.incidentEvent.create({
      data: {
        incidentId,
        type: 'STATUS_CHANGED',
        message: `Incident status changed to ${status}`,
        metadata: { userId, from: incident.status, to: status },
      },
    });
    return inc;
  });

  await logAudit({
    organizationId,
    userId,
    action: 'incident.status_changed',
    resourceType: 'incident',
    resourceId: incidentId,
    metadata: { status },
    ip,
  });
  return updated;
}
