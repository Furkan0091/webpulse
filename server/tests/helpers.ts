import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp();

let counter = 0;
export function uniqueEmail(prefix = 'test'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export async function registerUser(email = uniqueEmail(), name = 'Test User', password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ email, name, password });
  expect(res.status).toBe(201);
  const accessToken = res.body.data.accessToken as string;
  const refreshToken = res.body.data.refreshToken as string;
  const userId = res.body.data.user.id as string;
  return { accessToken, refreshToken, userId, email };
}

export async function createOrg(accessToken: string, name = 'Test Org') {
  const res = await request(app).post('/api/orgs').set('Authorization', `Bearer ${accessToken}`).send({ name });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; name: string; slug: string };
}

export async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) await prisma.user.delete({ where: { id: user.id } });
}

export async function cleanupOrg(slug: string) {
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (org) await prisma.organization.delete({ where: { id: org.id } });
}
