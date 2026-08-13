import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, cleanupUser, registerUser, uniqueEmail } from './helpers.js';

const emails: string[] = [];

describe('auth', () => {
  afterAll(async () => {
    for (const e of emails) await cleanupUser(e);
  });

  it('registers a new user and returns tokens', async () => {
    const email = uniqueEmail('reg');
    emails.push(email);
    const res = await request(app).post('/api/auth/register').send({ email, name: 'Reg User', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it('rejects duplicate registration', async () => {
    const email = uniqueEmail('dup');
    emails.push(email);
    await registerUser(email);
    const res = await request(app).post('/api/auth/register').send({ email, name: 'Dup', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: uniqueEmail('weak'), name: 'Weak', password: 'short' });
    expect(res.status).toBe(422);
  });

  it('logs in with correct credentials and rejects bad passwords', async () => {
    const email = uniqueEmail('login');
    emails.push(email);
    await registerUser(email, 'Login User', 'correct-horse');

    const ok = await request(app).post('/api/auth/login').send({ email, password: 'correct-horse' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();

    const bad = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('refreshes tokens and rejects invalid refresh tokens', async () => {
    const { refreshToken } = await registerUser(uniqueEmail('refresh'));
    emails.push(emails[emails.length - 1]);

    const ok = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();

    const bad = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid' });
    expect(bad.status).toBe(401);
  });

  it('requires auth for /me', async () => {
    const { accessToken } = await registerUser(uniqueEmail('me'));
    emails.push(emails[emails.length - 1]);

    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(ok.status).toBe(200);

    const anon = await request(app).get('/api/auth/me');
    expect(anon.status).toBe(401);
  });
});
