import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, cleanupOrg, cleanupUser, createOrg, registerUser, uniqueEmail } from './helpers.js';

const emails: string[] = [];
const orgs: string[] = [];

describe('multi-tenant isolation', () => {
  afterAll(async () => {
    for (const slug of orgs) await cleanupOrg(slug);
    for (const email of emails) await cleanupUser(email);
  });

  it('prevents cross-organization access to monitors', async () => {
    // Org A
    const userA = await registerUser(uniqueEmail('orga'));
    emails.push(userA.email);
    const orgA = await createOrg(userA.accessToken, 'Isolation A');
    orgs.push(orgA.slug);

    // Org B
    const userB = await registerUser(uniqueEmail('orgb'));
    emails.push(userB.email);
    const orgB = await createOrg(userB.accessToken, 'Isolation B');
    orgs.push(orgB.slug);

    // A creates a monitor.
    const createRes = await request(app)
      .post(`/api/orgs/${orgA.id}/monitors`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .send({ name: 'Secret Monitor', type: 'HTTP', target: 'https://example.com' });
    expect(createRes.status).toBe(201);
    const monitorId = createRes.body.data.id;

    // A can read it.
    const readOk = await request(app)
      .get(`/api/orgs/${orgA.id}/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${userA.accessToken}`);
    expect(readOk.status).toBe(200);

    // B cannot read A's org resources (membership check → 403).
    const crossRead = await request(app)
      .get(`/api/orgs/${orgA.id}/monitors/${monitorId}`)
      .set('Authorization', `Bearer ${userB.accessToken}`);
    expect(crossRead.status).toBe(403);

    // B cannot list A's monitors.
    const crossList = await request(app)
      .get(`/api/orgs/${orgA.id}/monitors`)
      .set('Authorization', `Bearer ${userB.accessToken}`);
    expect(crossList.status).toBe(403);

    // B's own org does not contain A's monitor.
    const ownList = await request(app)
      .get(`/api/orgs/${orgB.id}/monitors`)
      .set('Authorization', `Bearer ${userB.accessToken}`);
    expect(ownList.status).toBe(200);
    expect(ownList.body.data.monitors.map((m: { id: string }) => m.id)).not.toContain(monitorId);
  });

  it('enforces role-based permissions (viewer cannot mutate)', async () => {
    const owner = await registerUser(uniqueEmail('owner'));
    emails.push(owner.email);
    const org = await createOrg(owner.accessToken, 'RBAC Org');
    orgs.push(org.slug);

    // Add a viewer member (second user).
    const viewer = await registerUser(uniqueEmail('viewer'));
    emails.push(viewer.email);
    const inviteRes = await request(app)
      .post(`/api/orgs/${org.id}/members/invite`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: viewer.email, role: 'VIEWER' });
    expect(inviteRes.status).toBe(201);

    // Viewer can read monitors.
    const read = await request(app)
      .get(`/api/orgs/${org.id}/monitors`)
      .set('Authorization', `Bearer ${viewer.accessToken}`);
    expect(read.status).toBe(200);

    // Viewer cannot create monitors.
    const create = await request(app)
      .post(`/api/orgs/${org.id}/monitors`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ name: 'Forbidden', type: 'HTTP', target: 'https://example.com' });
    expect(create.status).toBe(403);
  });
});
