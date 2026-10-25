import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  authCookie,
  createDepartment,
  createEvent,
  createShift,
  createTestApp,
  createUser,
  hasTestDb,
  inject,
  resetDb,
} from './helpers.js';

/** Befunde aus dem Security-Review vom 2026-10-25 */
describe.skipIf(!hasTestDb)('Security-Review 2026-10-25', () => {
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

  describe('Cevi-Name-Login', () => {
    const login = (departmentSlug: string, ceviName: string, birthDate: string, ip: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/ceviname-login',
        remoteAddress: ip,
        payload: { departmentSlug, ceviName, birthDate },
      });

    it('lässt während der Sperre auch das richtige Geburtsdatum nicht durch', async () => {
      const department = await createDepartment(app);
      await createUser(app, {
        email: null,
        ceviName: 'Fuchs',
        birthDate: new Date('2012-04-01T00:00:00Z'),
        homeDepartmentId: department.id,
      });

      // Jeder Versuch von einer anderen IP: nur die Bremse pro Name zählt
      for (let i = 0; i < 8; i++) {
        const res = await login(department.slug, 'Fuchs', `2012-01-0${i + 1}`, `10.0.0.${i + 1}`);
        expect(res.statusCode).toBe(404);
      }
      const res = await login(department.slug, 'Fuchs', '2012-04-01', '10.0.1.1');
      expect(res.statusCode).toBe(429);
    });

    it('zählt Treffer auf geschützte Konten als Fehlversuch (sonst ein Orakel fürs Geburtsdatum)', async () => {
      const department = await createDepartment(app);
      await createUser(app, {
        ceviDbId: 999,
        ceviName: 'Adler',
        birthDate: new Date('1990-05-05T00:00:00Z'),
        homeDepartmentId: department.id,
      });
      for (let i = 0; i < 8; i++) {
        const res = await login(department.slug, 'Adler', '1990-05-05', `10.0.2.${i + 1}`);
        expect(res.statusCode).toBe(403);
      }
      expect((await login(department.slug, 'Adler', '1990-05-05', '10.0.3.1')).statusCode).toBe(429);
    });
  });

  describe('Personen fremder Abteilungen', () => {
    async function setup() {
      const home = await createDepartment(app);
      const other = await createDepartment(app);
      const ok = await createUser(app, { ceviDbId: 1, homeDepartmentId: home.id });
      const event = await createEvent(app, home.id, { organizerId: ok.id });
      const shift = await createShift(app, event.id);
      const local = await createUser(app, { ceviDbId: 2, homeDepartmentId: home.id });
      const stranger = await createUser(app, { ceviDbId: 3, homeDepartmentId: other.id });
      return { home, ok, event, shift, local, stranger, cookie: authCookie(app, ok) };
    }

    it('lässt das OK keine fremden Personen einteilen', async () => {
      const { home, shift, local, stranger, cookie } = await setup();
      const denied = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: home.slug,
        cookie,
        payload: { userId: stranger.id },
      });
      expect(denied.statusCode).toBe(400);
      const allowed = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: home.slug,
        cookie,
        payload: { userId: local.id },
      });
      expect(allowed.statusCode).toBe(200);
    });

    it('lässt keine fremden Personen als Schicht- oder Tagesverantwortliche zu', async () => {
      const { home, event, shift, local, stranger, cookie } = await setup();
      const patch = (ids: string[]) =>
        inject(app, { method: 'PATCH', url: `/api/shifts/${shift.id}`, tenant: home.slug, cookie, payload: { responsibleUserIds: ids } });
      expect((await patch([stranger.id])).statusCode).toBe(400);
      expect((await patch([local.id])).statusCode).toBe(200);

      const day = await inject(app, {
        method: 'PUT',
        url: `/api/events/${event.slug}/days/2030-06-01/responsibles`,
        tenant: home.slug,
        cookie,
        payload: { userIds: [stranger.id] },
      });
      expect(day.statusCode).toBe(400);
    });

    it('lässt keine fremde Kontaktperson zu', async () => {
      const { home, event, stranger } = await setup();
      const admin = await createUser(app, { ceviDbId: 4, homeDepartmentId: home.id });
      await addMember(app, home.id, admin.id, 'ADMIN');
      const res = await inject(app, {
        method: 'PATCH',
        url: `/api/events/${event.slug}`,
        tenant: home.slug,
        cookie: authCookie(app, admin),
        payload: { contactUserId: stranger.id },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Entwürfe', () => {
    it('zeigt unveröffentlichte Anlässe nur dem OK', async () => {
      const department = await createDepartment(app);
      const ok = await createUser(app, { ceviDbId: 10 });
      const event = await createEvent(app, department.id, { organizerId: ok.id });
      await app.prisma.event.update({ where: { id: event.id }, data: { isPublished: false } });
      const shift = await createShift(app, event.id);
      const helper = await createUser(app);

      const get = (cookie?: string) =>
        inject(app, { method: 'GET', url: `/api/events/${event.slug}`, tenant: department.slug, cookie });
      expect((await get()).statusCode).toBe(404);
      expect((await get(authCookie(app, helper))).statusCode).toBe(404);
      expect((await get(authCookie(app, ok))).statusCode).toBe(200);

      const signup = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, helper),
        payload: {},
      });
      expect(signup.statusCode).toBe(404);
    });
  });

  describe('Abmelden', () => {
    it('widerruft das Token serverseitig', async () => {
      const user = await createUser(app);
      const token = app.signAuthToken({ id: user.id, email: user.email ?? 'x@x', isGlobalAdmin: false });
      const cookie = `token=${token}`;
      expect((await inject(app, { method: 'GET', url: '/api/auth/me', cookie })).statusCode).toBe(200);
      expect((await inject(app, { method: 'POST', url: '/api/auth/logout', cookie })).statusCode).toBe(200);
      // Wer das Cookie vorher kopiert hat, kommt damit nicht mehr rein
      expect((await inject(app, { method: 'GET', url: '/api/auth/me', cookie })).statusCode).toBe(401);
    });
  });

  describe('E-Mail-Enumeration', () => {
    it('antwortet bei bestehender E-Mail gleich wie bei einer neuen', async () => {
      await createUser(app, { email: 'da@example.com' });
      const register = (email: string) =>
        inject(app, {
          method: 'POST',
          url: '/api/auth/register-helper',
          payload: { email, password: 'geheim12345', firstName: 'Anna', lastName: 'Beispiel' },
        });
      const existing = await register('da@example.com');
      const fresh = await register('neu@example.com');
      expect(existing.statusCode).toBe(fresh.statusCode);
      expect(existing.json()).toEqual({ ...fresh.json(), email: 'da@example.com' });
    });

    it('verrät beim erneuten Bestätigungslink nicht, ob ein Konto bestätigt ist', async () => {
      await createUser(app, { email: 'ok@example.com', emailVerified: true });
      const resend = (email: string) =>
        inject(app, { method: 'POST', url: '/api/auth/resend-verification', payload: { email } });
      const verified = await resend('ok@example.com');
      const unknown = await resend('gibtsnicht@example.com');
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toEqual(unknown.json());
    });
  });
});
