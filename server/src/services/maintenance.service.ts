import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

export async function listMaintenance(organizationId: string) {
  return prisma.maintenanceWindow.findMany({
    where: { organizationId },
    include: { monitors: { include: { monitor: { select: { id: true, name: true } } } } },
    orderBy: { startsAt: 'desc' },
  });
}

export async function createMaintenance(
  organizationId: string,
  input: { title: string; description?: string; startsAt: Date; endsAt: Date; public: boolean; monitorIds: string[] },
) {
  if (input.endsAt <= input.startsAt) {
    throw new AppError('VALIDATION_ERROR', 'End time must be after start time.');
  }

  const { monitorIds, ...data } = input;
  const window = await prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceWindow.create({
      data: {
        ...data,
        organizationId,
        status: input.startsAt <= new Date() && new Date() < input.endsAt ? 'ACTIVE' : 'SCHEDULED',
      },
    });
    if (monitorIds.length) {
      await tx.maintenanceWindowMonitor.createMany({
        data: monitorIds.map((monitorId) => ({ maintenanceWindowId: created.id, monitorId })),
      });
    }
    return created;
  });
  return window;
}

export async function deleteMaintenance(organizationId: string, id: string) {
  const window = await prisma.maintenanceWindow.findFirst({ where: { id, organizationId } });
  if (!window) throw new AppError('NOT_FOUND', 'Maintenance window not found.');
  await prisma.maintenanceWindow.delete({ where: { id } });
}
