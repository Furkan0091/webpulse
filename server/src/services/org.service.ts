import { nanoid } from 'nanoid';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { slugify } from '../utils/slug.js';
import { sendMail } from './mail.service.js';
import { env } from '../config/env.js';

const VALID_ROLES: Role[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];

export async function createOrganization(userId: string, input: {
  name: string;
  logoUrl?: string;
  website?: string;
  industry?: string;
  description?: string;
  timezone?: string;
}) {
  let slug = slugify(input.name) || `org-${nanoid(6)}`;

  // Ensure slug uniqueness.
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${nanoid(6)}`;
  }

  const organization = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.name,
        slug,
        logoUrl: input.logoUrl,
        website: input.website,
        industry: input.industry,
        description: input.description,
        timezone: input.timezone ?? 'UTC',
      },
    });
    await tx.organizationMember.create({
      data: { organizationId: org.id, userId, role: 'OWNER' },
    });
    return org;
  });

  return organization;
}

export async function listOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { organization: true },
    orderBy: { joinedAt: 'asc' },
  });
  return memberships.map((m) => ({ ...m.organization, role: m.role }));
}

export async function getOrganization(organizationId: string, userId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: true },
  });
  if (!membership || membership.status !== 'ACTIVE') {
    throw new AppError('FORBIDDEN', 'You do not have access to this organization.');
  }
  return membership.organization;
}

export async function updateOrganization(organizationId: string, input: {
  name?: string;
  logoUrl?: string;
  website?: string;
  industry?: string;
  description?: string;
  timezone?: string;
}) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: input.name,
      logoUrl: input.logoUrl,
      website: input.website,
      industry: input.industry,
      description: input.description,
      timezone: input.timezone,
    },
  });
}

export async function listMembers(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId },
    include: {
      user: { select: { id: true, email: true, name: true, avatarUrl: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });
}

export async function inviteMember(organizationId: string, inviterId: string, input: {
  email: string;
  role: Role;
}) {
  if (!VALID_ROLES.includes(input.role) || input.role === 'OWNER') {
    throw new AppError('VALIDATION_ERROR', 'Role must be ADMIN, DEVELOPER or VIEWER.');
  }

  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError('BAD_REQUEST', 'No WebPulse user with this email exists yet.');
  }

  const existing = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.id } },
  });

  if (existing) {
    if (existing.status === 'ACTIVE') {
      throw new AppError('CONFLICT', 'This user is already a member of the organization.');
    }
    const updated = await prisma.organizationMember.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', role: input.role },
    });
    return updated;
  }

  const membership = await prisma.organizationMember.create({
    data: {
      organizationId,
      userId: user.id,
      role: input.role,
      status: 'ACTIVE',
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  await sendMail({
    to: user.email,
    subject: 'You were added to an organization on WebPulse',
    text: `You have been added as ${input.role} to an organization on WebPulse: ${env.webBaseUrl}`,
  });

  return membership;
}

export async function updateMember(organizationId: string, memberId: string, input: {
  role?: Role;
  status?: 'ACTIVE' | 'DEACTIVATED';
}) {
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) throw new AppError('NOT_FOUND', 'Member not found.');

  if (input.role !== undefined) {
    if (input.role === 'OWNER') {
      throw new AppError('VALIDATION_ERROR', 'The OWNER role cannot be assigned this way.');
    }
  }

  return prisma.organizationMember.update({
    where: { id: memberId },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  });
}

export async function removeMember(organizationId: string, memberId: string, actorId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId },
  });
  if (!member) throw new AppError('NOT_FOUND', 'Member not found.');
  if (member.role === 'OWNER') {
    throw new AppError('FORBIDDEN', 'The organization owner cannot be removed.');
  }

  // Soft-deactivate to preserve audit trail.
  return prisma.organizationMember.update({
    where: { id: memberId },
    data: { status: 'DEACTIVATED' },
  });
}
