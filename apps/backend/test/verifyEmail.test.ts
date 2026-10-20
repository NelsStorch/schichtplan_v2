import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

describe.skipIf(!hasTestDb)('E-Mail bestätigen', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('bestätigt die Adresse, meldet aber nicht automatisch an', async () => {
    const user = await createUser(app, { email: 'neu@example.com', passwordHash: 'x', emailVerified: false });
    await app.prisma.emailVerificationToken.create({
      data: { userId: user.id, token: 'tok-123', email: 'neu@example.com', expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await inject(app, { method: 'POST', url: '/api/auth/verify-email', payload: { token: 'tok-123' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.json().user).toBeUndefined();
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
  });
});
