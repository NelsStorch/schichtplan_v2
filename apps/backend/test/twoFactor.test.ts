import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authCookie, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';
import { totpCode, totpStep } from '../src/services/twoFactor.js';

describe.skipIf(!hasTestDb)('Zwei-Faktor-Anmeldung', () => {
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

  /** Cookie-Header aus Set-Cookie einer Antwort (nur name=wert) */
  function cookiesFrom(res: { cookies: { name: string; value: string }[] }, name: string) {
    const c = res.cookies.find((x) => x.name === name);
    return c ? `${c.name}=${c.value}` : undefined;
  }

  /** Konto mit Passwort, 2FA über die API eingeschaltet. Gibt Secret und Wiederherstellungscodes zurück. */
  async function userWithTwoFactor(opts: { ceviDbId?: number } = {}) {
    const user = await createUser(app, {
      email: `tf${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: await bcrypt.hash('passwort-123', 4),
      ...(opts.ceviDbId ? { ceviDbId: opts.ceviDbId } : {}),
    });
    const cookie = authCookie(app, user);
    const setup = await inject(app, { method: 'POST', url: '/api/auth/2fa/setup', cookie, payload: { currentPassword: 'passwort-123' } });
    expect(setup.statusCode).toBe(200);
    const secret = (setup.json().secret as string).replace(/ /g, '');
    const step = totpStep();
    const enable = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/enable',
      cookie,
      payload: { code: totpCode(secret, step) },
    });
    expect(enable.statusCode).toBe(200);
    return { user, cookie, secret, step, recoveryCodes: enable.json().recoveryCodes as string[] };
  }

  const login = (email: string, password = 'passwort-123') =>
    inject(app, { method: 'POST', url: '/api/auth/login', payload: { email, password } });

  it('richtet 2FA ein: Passwort nötig, Secret verschlüsselt, Codes nur als Hash', async () => {
    const user = await createUser(app, { email: 'setup@example.com', passwordHash: await bcrypt.hash('passwort-123', 4) });
    const cookie = authCookie(app, user);

    const wrong = await inject(app, { method: 'POST', url: '/api/auth/2fa/setup', cookie, payload: { currentPassword: 'falsch' } });
    expect(wrong.statusCode).toBe(401);

    const setup = await inject(app, { method: 'POST', url: '/api/auth/2fa/setup', cookie, payload: { currentPassword: 'passwort-123' } });
    expect(setup.statusCode).toBe(200);
    const secret = (setup.json().secret as string).replace(/ /g, '');
    expect(setup.json().qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpPendingSecret).toBeTruthy();
    expect(stored.totpPendingSecret).not.toContain(secret);
    expect(stored.totpEnabledAt).toBeNull();

    const bad = await inject(app, { method: 'POST', url: '/api/auth/2fa/enable', cookie, payload: { code: '000000' } });
    expect(bad.statusCode).toBe(401);

    const ok = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/enable',
      cookie,
      payload: { code: totpCode(secret, totpStep()) },
    });
    expect(ok.statusCode).toBe(200);
    const codes = ok.json().recoveryCodes as string[];
    expect(codes).toHaveLength(10);
    expect(ok.json().user.twoFactor).toMatchObject({ enabled: true, onProviderLogin: false, recoveryCodesLeft: 10 });

    const rows = await app.prisma.twoFactorRecoveryCode.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.codeHash)).not.toContain(codes[0]);
  });

  it('Passwort-Login: erst nach dem Code gibt es ein Login-Cookie, ein Code gilt nur einmal', async () => {
    const { user, secret, step } = await userWithTwoFactor();

    const first = await login(user.email!);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ twoFactorRequired: true });
    expect(cookiesFrom(first, 'token')).toBeUndefined();
    const challenge = cookiesFrom(first, 'mfa_challenge');
    expect(challenge).toBeTruthy();

    // Das Challenge-Cookie ist kein Login
    expect((await inject(app, { method: 'GET', url: '/api/auth/me', cookie: challenge })).statusCode).toBe(401);
    expect(
      (await inject(app, { method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${challenge!.split('=')[1]}` } }))
        .statusCode
    ).toBe(401);

    // Der Code von der Einrichtung ist verbraucht
    const replay = await inject(app, { method: 'POST', url: '/api/auth/2fa/verify', cookie: challenge, payload: { code: totpCode(secret, step) } });
    expect(replay.statusCode).toBe(401);

    const ok = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/verify',
      cookie: challenge,
      payload: { code: totpCode(secret, step + 1) },
    });
    expect(ok.statusCode).toBe(200);
    const token = cookiesFrom(ok, 'token');
    expect(token).toBeTruthy();
    expect((await inject(app, { method: 'GET', url: '/api/auth/me', cookie: token })).statusCode).toBe(200);

    // Gleicher Code nochmals (z. B. abgefangen): abgelehnt
    const again = await login(user.email!);
    const replay2 = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/verify',
      cookie: cookiesFrom(again, 'mfa_challenge'),
      payload: { code: totpCode(secret, step + 1) },
    });
    expect(replay2.statusCode).toBe(401);
  });

  it('Wiederherstellungscode funktioniert genau einmal', async () => {
    const { user, recoveryCodes } = await userWithTwoFactor();

    const first = await login(user.email!);
    const ok = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/verify',
      cookie: cookiesFrom(first, 'mfa_challenge'),
      payload: { code: recoveryCodes[0].toUpperCase() },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().recoveryCodesLeft).toBe(9);

    const second = await login(user.email!);
    const reused = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/verify',
      cookie: cookiesFrom(second, 'mfa_challenge'),
      payload: { code: recoveryCodes[0] },
    });
    expect(reused.statusCode).toBe(401);
  });

  it('ohne Challenge-Cookie oder mit gefälschtem kein Login', async () => {
    const { secret, step } = await userWithTwoFactor();
    const none = await inject(app, { method: 'POST', url: '/api/auth/2fa/verify', payload: { code: totpCode(secret, step + 1) } });
    expect(none.statusCode).toBe(400);
    const forged = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/verify',
      cookie: 'mfa_challenge=eyJ1aWQiOiJ4In0.falsch',
      payload: { code: totpCode(secret, step + 1) },
    });
    expect(forged.statusCode).toBe(400);
  });

  it('bremst das Durchprobieren von Codes pro Konto', async () => {
    const { user, secret, step } = await userWithTwoFactor();
    const challenge = cookiesFrom(await login(user.email!), 'mfa_challenge');
    for (let i = 0; i < 5; i++) {
      const res = await inject(app, { method: 'POST', url: '/api/auth/2fa/verify', cookie: challenge, payload: { code: '000000' } });
      expect(res.statusCode).toBe(401);
    }
    // Auch der richtige Code hilft jetzt nicht mehr
    const blocked = await inject(app, {
      method: 'POST',
      url: '/api/auth/2fa/verify',
      cookie: challenge,
      payload: { code: totpCode(secret, step + 1) },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it('Ausschalten und Einstellungen verlangen einen aktuellen Code', async () => {
    const { user, cookie, secret, step } = await userWithTwoFactor({ ceviDbId: 4711 });

    const noCode = await inject(app, { method: 'POST', url: '/api/auth/2fa/disable', cookie, payload: { code: '123456' } });
    expect(noCode.statusCode).toBe(401);

    const setting = await inject(app, {
      method: 'PUT',
      url: '/api/auth/2fa/settings',
      cookie,
      payload: { code: totpCode(secret, step + 1), onProviderLogin: true },
    });
    expect(setting.statusCode).toBe(200);
    expect(setting.json().user.twoFactor.onProviderLogin).toBe(true);

    const newCodes = await inject(app, { method: 'POST', url: '/api/auth/2fa/recovery-codes', cookie, payload: { code: 'falsch-falsch' } });
    expect(newCodes.statusCode).toBe(401);

    const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpEnabledAt).not.toBeNull();
  });

  it('Admin kann 2FA zurücksetzen, mit Protokolleintrag', async () => {
    const { user } = await userWithTwoFactor();
    const admin = await createUser(app, { isGlobalAdmin: true, ceviDbId: 1 });
    const token = app.jwt.sign({ id: admin.id, email: admin.email ?? 'a@x', isGlobalAdmin: true, amr: 'cevidb' });
    const res = await inject(app, {
      method: 'POST',
      url: `/api/admin/users/${user.id}/2fa/reset`,
      cookie: `token=${token}`,
      headers: { host: 'admin.cevi-schichtplan.ch', origin: 'https://admin.cevi-schichtplan.ch', 'sec-fetch-site': 'same-origin' },
    });
    expect(res.statusCode).toBe(200);

    const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpEnabledAt).toBeNull();
    expect(stored.totpSecret).toBeNull();
    expect(await app.prisma.twoFactorRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'USER_TWO_FACTOR_RESET', targetId: user.id } })).toBe(1);

    // Danach reicht das Passwort wieder
    const after = await login(user.email!);
    expect(cookiesFrom(after, 'token')).toBeTruthy();
  });
});
