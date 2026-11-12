import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authCookie, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

// Keine echten Mails: den Link aus dem Aufruf lesen
const sendPasswordResetEmail = vi.hoisted(() => vi.fn(async (_args: { to: string; resetUrl: string }) => true));
vi.mock('../src/services/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/email.js')>()),
  sendPasswordResetEmail,
}));

describe.skipIf(!hasTestDb)('Passwort vergessen', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await resetDb(app);
    sendPasswordResetEmail.mockClear();
  });

  const request = (email: string) =>
    inject(app, { method: 'POST', url: '/api/auth/password-reset/request', payload: { email } });
  const confirm = (token: string, password: string) =>
    inject(app, { method: 'POST', url: '/api/auth/password-reset/confirm', payload: { token, password } });
  const login = (email: string, password: string) =>
    inject(app, { method: 'POST', url: '/api/auth/login', payload: { email, password } });

  function tokenFromMail(): string {
    const url = new URL(sendPasswordResetEmail.mock.calls.at(-1)![0].resetUrl);
    return url.searchParams.get('token')!;
  }

  it('setzt mit dem Link aus der E-Mail ein neues Passwort', async () => {
    const user = await createUser(app, { email: 'pw@example.com', passwordHash: await bcrypt.hash('altes-passwort', 4) });
    const oldCookie = authCookie(app, user);

    const res = await request('PW@example.com');
    expect(res.statusCode).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0].to).toBe('pw@example.com');

    // In der DB steht nur der Hash
    const token = tokenFromMail();
    const stored = await app.prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token);

    // Älteres Login-Token soll danach nicht mehr gelten
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect((await confirm(token, 'neues-passwort-123')).statusCode).toBe(200);
    expect((await login('pw@example.com', 'altes-passwort')).statusCode).toBe(401);
    expect((await login('pw@example.com', 'neues-passwort-123')).statusCode).toBe(200);
    expect((await inject(app, { method: 'GET', url: '/api/auth/me', cookie: oldCookie })).statusCode).toBe(401);

    // Der Link gilt nur einmal
    expect((await confirm(token, 'nochmal-anders-123')).statusCode).toBe(400);
  });

  it('antwortet gleich, ob es ein Konto gibt oder nicht, und ignoriert Platzhalter-Adressen', async () => {
    await createUser(app, { email: 'cevi_99@cevi-schichtplan.ch', ceviDbId: 99 });
    const unknown = await request('niemand@example.com');
    const placeholder = await request('cevi_99@cevi-schichtplan.ch');
    expect(unknown.statusCode).toBe(200);
    expect(placeholder.statusCode).toBe(200);
    expect(placeholder.json()).toEqual(unknown.json());
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('erlaubt Passwort-Reset auch für Hitobito-Konten ohne bisheriges Passwort', async () => {
    const user = await createUser(app, { email: 'hitobito@example.com', ceviDbId: 101, passwordHash: null });
    const res = await request('hitobito@example.com');
    expect(res.statusCode).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail.mock.calls[0][0].to).toBe('hitobito@example.com');

    const token = tokenFromMail();
    expect((await confirm(token, 'neues-passwort-123')).statusCode).toBe(200);
    expect((await login('hitobito@example.com', 'neues-passwort-123')).statusCode).toBe(200);
    const updated = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordHash).not.toBeNull();
  });

  it('erlaubt das Setzen und Ändern des Passworts über /api/auth/me/password', async () => {
    const user = await createUser(app, { email: 'profil@example.com', ceviDbId: 202, passwordHash: null });
    const cookie = authCookie(app, user);

    // 1. Fallback-Passwort ohne currentPassword setzen
    const setRes = await inject(app, {
      method: 'POST',
      url: '/api/auth/me/password',
      cookie,
      payload: { newPassword: 'erstes-passwort-123' },
    });
    expect(setRes.statusCode).toBe(200);
    expect(setRes.json().success).toBe(true);

    // Login mit neuem Passwort möglich
    expect((await login('profil@example.com', 'erstes-passwort-123')).statusCode).toBe(200);

    // 2. Passwort ändern erfordert currentPassword
    const failChange = await inject(app, {
      method: 'POST',
      url: '/api/auth/me/password',
      cookie: setRes.headers['set-cookie'] as string,
      payload: { currentPassword: 'falsches-passwort', newPassword: 'zweites-passwort-456' },
    });
    expect(failChange.statusCode).toBe(401);

    const successChange = await inject(app, {
      method: 'POST',
      url: '/api/auth/me/password',
      cookie: setRes.headers['set-cookie'] as string,
      payload: { currentPassword: 'erstes-passwort-123', newPassword: 'zweites-passwort-456' },
    });
    expect(successChange.statusCode).toBe(200);
    expect((await login('profil@example.com', 'zweites-passwort-456')).statusCode).toBe(200);
  });

  it('lehnt abgelaufene und erfundene Links ab', async () => {
    const user = await createUser(app, { email: 'alt@example.com', passwordHash: await bcrypt.hash('x', 4) });
    await request('alt@example.com');
    const token = tokenFromMail();
    await app.prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });

    expect((await confirm(token, 'neues-passwort-123')).json().code).toBe('INVALID_TOKEN');
    expect((await confirm('x'.repeat(43), 'neues-passwort-123')).statusCode).toBe(400);
  });

  it('bestätigt die E-Mail mit dem Zurücksetzen', async () => {
    const user = await createUser(app, {
      email: 'unbestaetigt@example.com',
      passwordHash: await bcrypt.hash('x', 4),
      emailVerified: false,
    });
    await request('unbestaetigt@example.com');
    expect((await confirm(tokenFromMail(), 'neues-passwort-123')).statusCode).toBe(200);
    const after = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerified).toBe(true);
  });

  it('schickt höchstens einen Link pro Minute', async () => {
    await createUser(app, { email: 'oft@example.com', passwordHash: await bcrypt.hash('x', 4) });
    await request('oft@example.com');
    await request('oft@example.com');
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});
