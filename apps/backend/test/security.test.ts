import bcrypt from 'bcryptjs';
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

describe.skipIf(!hasTestDb)('Sicherheit der API', () => {
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

  describe('Anmeldung', () => {
    it('lehnt Tokens gelöschter Konten ab', async () => {
      const user = await createUser(app);
      const cookie = authCookie(app, user);
      await app.prisma.user.delete({ where: { id: user.id } });
      const res = await inject(app, { method: 'GET', url: '/api/auth/me', cookie });
      expect(res.statusCode).toBe(401);
    });

    it('nimmt globale Admin-Rechte aus der DB, nicht aus dem Token', async () => {
      const department = await createDepartment(app);
      const user = await createUser(app, { isGlobalAdmin: false });
      // Token behauptet Admin, die DB sagt nein
      const cookie = authCookie(app, { ...user, isGlobalAdmin: true });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/tasks',
        tenant: department.slug,
        cookie,
        payload: { title: 'Grill' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('signiert Tokens mit Ablaufdatum', async () => {
      const user = await createUser(app);
      const token = authCookie(app, user).slice('token='.length);
      const payload = app.jwt.decode<{ exp?: number }>(token);
      expect(payload?.exp).toBeTypeOf('number');
    });

    it('bremst das Durchprobieren von Passwörtern', async () => {
      const passwordHash = await bcrypt.hash('richtiges-passwort', 4);
      const user = await createUser(app, { passwordHash });
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await inject(app, {
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: user.email, password: `falsch-${i}` },
          remoteAddress: `10.0.0.${i}`,
        });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.at(-1)).toBe(429);

      // Auch das richtige Passwort wartet, bis die Sperre vorbei ist
      const blocked = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: 'richtiges-passwort' },
      });
      expect(blocked.statusCode).toBe(429);
    });

    it('liefert das Token nicht im JSON aus', async () => {
      const passwordHash = await bcrypt.hash('richtiges-passwort', 4);
      const user = await createUser(app, { passwordHash });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: 'richtiges-passwort' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().token).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('übernimmt bei der Registrierung kein bestehendes Konto ohne Passwort', async () => {
      const profile = await createUser(app, { email: 'opfer@example.com', emailVerified: false, ceviName: 'Opfer' });
      const res = await inject(app, {
        method: 'POST',
        url: '/api/auth/register-helper',
        payload: { email: 'opfer@example.com', password: 'geheim12345', firstName: 'Fremd', lastName: 'Person' },
      });
      // Gleiche Antwort wie bei einem neuen Konto (verrät nicht, dass es die E-Mail schon gibt)
      expect(res.statusCode).toBe(200);
      expect(res.json().requiresVerification).toBe(true);
      const after = await app.prisma.user.findUniqueOrThrow({ where: { id: profile.id } });
      expect(after.passwordHash).toBeNull();
      expect(after.firstName).toBe('Test');
    });

    it('markiert eine selbst eingetragene E-Mail als unbestätigt', async () => {
      const user = await createUser(app, { email: null, ceviDbId: 4711, emailVerified: true });
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/auth/me',
        cookie: authCookie(app, user),
        payload: { email: 'neu@example.com' },
      });
      expect(res.statusCode).toBe(200);
      const after = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.email).toBe('neu@example.com');
      expect(after.emailVerified).toBe(false);
    });

    it('lässt das Geburtsdatum aus Cevi.DB nicht überschreiben', async () => {
      const user = await createUser(app, { ceviDbId: 4712, birthDate: new Date('2010-01-01T00:00:00Z') });
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/auth/me',
        cookie: authCookie(app, user),
        payload: { birthDate: '1990-01-01' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('CORS', () => {
    it('erlaubt Cookies nur für die eigene Domain', async () => {
      const own = await inject(app, {
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://illnau.cevi-schichtplan.ch' },
      });
      expect(own.headers['access-control-allow-origin']).toBe('https://illnau.cevi-schichtplan.ch');

      const foreign = await inject(app, { method: 'GET', url: '/health', headers: { origin: 'https://evil.example' } });
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Datenschutz', () => {
    it('zeigt die Mitgliederliste (mit E-Mails) nur Planenden', async () => {
      const department = await createDepartment(app);
      const helper = await createUser(app);
      await addMember(app, department.id, helper.id, 'HELPER');
      const outsider = await createUser(app);

      for (const user of [helper, outsider]) {
        const res = await inject(app, {
          method: 'GET',
          url: '/api/departments/current/members',
          tenant: department.slug,
          cookie: authCookie(app, user),
        });
        expect(res.statusCode).toBe(403);
      }

      const okLead = await createUser(app);
      await createEvent(app, department.id, { organizerId: okLead.id });
      const ok = await inject(app, {
        method: 'GET',
        url: '/api/departments/current/members',
        tenant: department.slug,
        cookie: authCookie(app, okLead),
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().some((m: { userId: string }) => m.userId === helper.id)).toBe(true);
    });

    it('zeigt Vorlagen nur Planenden', async () => {
      const department = await createDepartment(app);
      const anonymous = await inject(app, { method: 'GET', url: '/api/event-templates', tenant: department.slug });
      expect(anonymous.statusCode).toBe(401);

      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const res = await inject(app, {
        method: 'GET',
        url: '/api/event-templates',
        tenant: department.slug,
        cookie: authCookie(app, admin),
      });
      expect(res.statusCode).toBe(200);
    });

    it('liefert beim Bearbeiten einer Schicht keine Passwort-Hashes aus', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const event = await createEvent(app, department.id);
      const shift = await createShift(app, event.id);
      const helper = await createUser(app, { passwordHash: await bcrypt.hash('x', 4) });
      await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: helper.id, taskId: shift.tasks[0].id } });

      const res = await inject(app, {
        method: 'PATCH',
        url: `/api/shifts/${shift.id}`,
        tenant: department.slug,
        cookie: authCookie(app, admin),
        payload: { title: 'Bar neu' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('passwordHash');
      expect(res.body).not.toContain(helper.email!);
    });
  });

  describe('Uploads', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');

    it('erlaubt Uploads nur Planenden', async () => {
      const helper = await createUser(app);
      const res = await inject(app, {
        method: 'POST',
        url: '/api/uploads',
        cookie: authCookie(app, helper),
        payload: { filename: 'x.svg', mimeType: 'image/svg+xml', base64: svg },
      });
      expect(res.statusCode).toBe(403);
    });

    it('liefert hochgeladene Bilder in einer Sandbox aus', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const upload = await inject(app, {
        method: 'POST',
        url: '/api/uploads',
        cookie: authCookie(app, admin),
        payload: { filename: 'x.svg', mimeType: 'image/svg+xml', base64: svg },
      });
      expect(upload.statusCode).toBe(200);

      const res = await inject(app, { method: 'GET', url: upload.json().url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Eintragen', () => {
    it('verlangt bei Mindestalter ein Geburtsdatum', async () => {
      const department = await createDepartment(app);
      const event = await createEvent(app, department.id);
      const shift = await createShift(app, event.id, { minAge: 18 });
      const user = await createUser(app, { birthDate: null });

      const res = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'MISSING_INFO', missingFields: ['BIRTH_DATE'] });

      await app.prisma.user.update({ where: { id: user.id }, data: { birthDate: new Date('2015-01-01T00:00:00Z') } });
      const tooYoung = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: {},
      });
      expect(tooYoung.statusCode).toBe(403);

      await app.prisma.user.update({ where: { id: user.id }, data: { birthDate: new Date('1990-01-01T00:00:00Z') } });
      const ok = await inject(app, {
        method: 'POST',
        url: `/api/shifts/${shift.id}/signup`,
        tenant: department.slug,
        cookie: authCookie(app, user),
        payload: {},
      });
      expect(ok.statusCode).toBe(200);
    });
  });

  describe('Eingaben', () => {
    it('lehnt gefährliche Bild-Adressen und Farben ab', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app);
      await addMember(app, department.id, admin.id, 'ADMIN');
      const cookie = authCookie(app, admin);

      for (const payload of [
        { logoUrl: 'javascript:alert(1)' },
        { logoUrl: '//evil.example/x.png' },
        { primaryColor: 'red;background:url(x)' },
      ]) {
        const res = await inject(app, { method: 'PATCH', url: '/api/departments/current', tenant: department.slug, cookie, payload });
        expect(res.statusCode).toBe(400);
      }

      const ok = await inject(app, {
        method: 'PATCH',
        url: '/api/departments/current',
        tenant: department.slug,
        cookie,
        payload: { logoUrl: '/api/uploads/abc', primaryColor: '#2563eb' },
      });
      expect(ok.statusCode).toBe(200);
    });

    it('lässt globale Admins die Abteilung bearbeiten, auch ohne Mitgliedschaft', async () => {
      const department = await createDepartment(app);
      const admin = await createUser(app, { isGlobalAdmin: true });
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/departments/current',
        tenant: department.slug,
        cookie: authCookie(app, admin),
        payload: { name: 'Neuer Name' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Helfer-Pool', () => {
    it('zeigt mit ?alle=1 nur die eigene Abteilung ohne Zugang, nie fremde Abteilungen', async () => {
      const host = await createDepartment(app);
      const other = await createDepartment(app);
      const ok = await createUser(app, { homeDepartmentId: host.id });
      const event = await createEvent(app, host.id, { accessType: 'WHITELIST_CEVIDB', organizerId: ok.id });
      await app.prisma.eventAllowedDepartment.create({ data: { eventId: event.id, departmentId: other.id } });

      // Eigene Abteilung ohne Cevi.DB: kein Zugang, darf aber eingeteilt werden
      const ownNoAccess = await createUser(app, { homeDepartmentId: host.id });
      // Fremde Abteilung ohne Cevi.DB: kein Zugang, darf nie erscheinen
      const otherNoAccess = await createUser(app, { homeDepartmentId: other.id });
      // Fremde Abteilung mit Cevi.DB: hat Zugang
      const otherAccess = await createUser(app, { homeDepartmentId: other.id, ceviDbId: 990001, homeDepartmentSource: 'CEVIDB' });
      // Ohne Bezug zur Abteilung
      const stranger = await createUser(app);

      const cookie = authCookie(app, ok);
      const ids = async (url: string) => {
        const res = await inject(app, { method: 'GET', url, tenant: host.slug, cookie });
        expect(res.statusCode).toBe(200);
        return new Map<string, boolean>(res.json().items.map((i: { userId: string; hasAccess: boolean }) => [i.userId, i.hasAccess]));
      };

      const normal = await ids(`/api/events/${event.slug}/roster`);
      expect(normal.has(ownNoAccess.id)).toBe(false);
      expect(normal.get(otherAccess.id)).toBe(true);

      const all = await ids(`/api/events/${event.slug}/roster?alle=1`);
      expect(all.get(ownNoAccess.id)).toBe(false);
      expect(all.get(otherAccess.id)).toBe(true);
      expect(all.has(otherNoAccess.id)).toBe(false);
      expect(all.has(stranger.id)).toBe(false);
    });

    it('verweigert den Pool ohne OK- oder Leitungsrolle', async () => {
      const host = await createDepartment(app);
      const event = await createEvent(app, host.id);
      const helper = await createUser(app, { homeDepartmentId: host.id });
      await addMember(app, host.id, helper.id, 'HELPER');
      const res = await inject(app, {
        method: 'GET',
        url: `/api/events/${event.slug}/roster?alle=1`,
        tenant: host.slug,
        cookie: authCookie(app, helper),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
