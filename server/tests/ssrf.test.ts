import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, cleanupOrg, cleanupUser, createOrg, registerUser, uniqueEmail } from './helpers.js';

const emails: string[] = [];
const orgs: string[] = [];

describe('SSRF protection', () => {
  afterAll(async () => {
    for (const slug of orgs) await cleanupOrg(slug);
    for (const email of emails) await cleanupUser(email);
  });

  let orgId = '';
  let token = '';

  it('set up org', async () => {
    const user = await registerUser(uniqueEmail('ssrf'));
    emails.push(user.email);
    const org = await createOrg(user.accessToken, 'SSRF Org');
    orgs.push(org.slug);
    orgId = org.id;
    token = user.accessToken;
  });

  it('blocks private IP targets', async () => {
    for (const target of ['http://127.0.0.1:5432', 'http://10.0.0.5', 'http://192.168.1.1', 'http://169.254.169.254/latest/meta-data']) {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/monitors`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'bad', type: 'HTTP', target });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    }
  });

  it('blocks localhost and internal hostnames', async () => {
    for (const target of ['http://localhost:3000', 'http://metadata.google.internal']) {
      const res = await request(app)
        .post(`/api/orgs/${orgId}/monitors`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'bad', type: 'HTTP', target });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    }
  });
});
