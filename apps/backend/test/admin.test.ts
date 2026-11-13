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

describe.skipIf(!hasTestDb)('Admin-Portal: Abteilungen, Anlässe, Rollen', () => {
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

  const admin = async () => {
    const user = await createUser(app, { isGlobalAdmin: true, ceviDbId: 1 });
    return { user, cookie: authCookie(app, user) };
  };

  it('lässt nur globale Admins zu', async () => {
    const user = await createUser(app, { passwordHash: 'x' });
    const cookie = authCookie(app, user);
    for (const url of ['/api/admin/departments', '/api/admin/events', '/api/admin/dashboard']) {
      const res = await inject(app, { method: 'GET', url, cookie });
      expect(res.statusCode).toBe(403);
    }
  });

  it('antwortet in allen Teilen ohne Zwischenspeicher (no-store)', async () => {
    const { cookie } = await admin();
    for (const url of ['/api/admin/session', '/api/admin/departments', '/api/admin/events', '/api/admin/audit']) {
      const res = await inject(app, { method: 'GET', url, cookie });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers['cache-control'], url).toBe('no-store');
    }
  });

  it('listet Abteilungen mit Kennzahlen und Abteilungsleitung', async () => {
    const { cookie } = await admin();
    const department = await createDepartment(app, { name: 'Cevi Test' });
    const leader = await createUser(app, { passwordHash: 'x', firstName: 'Lea', lastName: 'Leitung' });
    await addMember(app, department.id, leader.id, 'ADMIN');
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: leader.id } });

    const res = await inject(app, { method: 'GET', url: '/api/admin/departments', cookie });
    expect(res.statusCode).toBe(200);
    const [item] = res.json().items;
    expect(item).toMatchObject({ name: 'Cevi Test', memberCount: 1, eventCount: 1, upcomingEventCount: 1, signupCount: 1 });
    expect(item.leaders).toHaveLength(1);

    const detail = await inject(app, { method: 'GET', url: `/api/admin/departments/${department.id}`, cookie });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().events[0]).toMatchObject({ shiftCount: 1, slotCount: 3, signupCount: 1 });
    expect(detail.json().people[0]).toMatchObject({ userId: leader.id, role: 'ADMIN' });
  });

  it('legt eine Abteilung an und verhindert doppelte Subdomains', async () => {
    const { cookie, user } = await admin();
    const res = await inject(app, {
      method: 'POST',
      url: '/api/admin/departments',
      cookie,
      payload: { name: 'Cevi Neu', slug: 'neu-abt', leaderUserId: user.id },
    });
    expect(res.statusCode).toBe(201);
    const member = await app.prisma.departmentMember.findFirst({ where: { userId: user.id } });
    expect(member?.role).toBe('ADMIN');

    const dup = await inject(app, {
      method: 'POST',
      url: '/api/admin/departments',
      cookie,
      payload: { name: 'Nochmal', slug: 'neu-abt' },
    });
    expect(dup.statusCode).toBe(409);

    const reserved = await inject(app, {
      method: 'POST',
      url: '/api/admin/departments',
      cookie,
      payload: { name: 'Admin', slug: 'admin' },
    });
    expect(reserved.statusCode).toBe(400);
  });

  it('ordnet beim Verknüpfen mit einer Ortsgruppe angemeldete Personen zu', async () => {
    const { cookie } = await admin();
    const department = await createDepartment(app);
    const person = await createUser(app, { ceviDbId: 77 });
    await app.prisma.user.update({ where: { id: person.id }, data: { ortsgruppeId: 4242 } });

    const res = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/departments/${department.id}`,
      cookie,
      payload: { ceviDbGroupId: 4242, name: 'Umbenannt' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().attached).toBe(1);
    const updated = await app.prisma.user.findUniqueOrThrow({ where: { id: person.id } });
    expect(updated.homeDepartmentId).toBe(department.id);
  });

  it('löscht eine Abteilung nur mit korrekter Bestätigung', async () => {
    const { cookie } = await admin();
    const department = await createDepartment(app, { slug: 'weg-damit' });
    const home = await createUser(app, { homeDepartmentId: department.id });
    await createEvent(app, department.id);

    const wrong = await inject(app, {
      method: 'DELETE',
      url: `/api/admin/departments/${department.id}`,
      cookie,
      payload: { confirm: 'falsch' },
    });
    expect(wrong.statusCode).toBe(400);

    const ok = await inject(app, {
      method: 'DELETE',
      url: `/api/admin/departments/${department.id}`,
      cookie,
      payload: { confirm: 'weg-damit' },
    });
    expect(ok.statusCode).toBe(200);
    expect(await app.prisma.event.count()).toBe(0);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: home.id } });
    expect(user.homeDepartmentId).toBeNull();
    expect(user.departmentSetupAt).toBeNull();
  });

  it('vergibt Abteilungsrollen nicht an Cevi-Name-Profile', async () => {
    const { cookie } = await admin();
    const department = await createDepartment(app);
    const profile = await createUser(app, { email: null, ceviName: 'Fuchs' });
    const account = await createUser(app, { passwordHash: 'x' });

    const denied = await inject(app, {
      method: 'PUT',
      url: `/api/admin/departments/${department.id}/members/${profile.id}`,
      cookie,
      payload: { role: 'HELPER', permissions: ['EVENTS_CREATE'] },
    });
    expect(denied.statusCode).toBe(400);

    const granted = await inject(app, {
      method: 'PUT',
      url: `/api/admin/departments/${department.id}/members/${account.id}`,
      cookie,
      payload: { role: 'HELPER', permissions: ['EVENTS_CREATE'] },
    });
    expect(granted.statusCode).toBe(200);

    const removed = await inject(app, {
      method: 'DELETE',
      url: `/api/admin/departments/${department.id}/members/${account.id}`,
      cookie,
    });
    expect(removed.statusCode).toBe(200);
    expect(await app.prisma.departmentMember.count()).toBe(0);
  });

  it('schützt die globale Admin-Rolle', async () => {
    const { cookie, user } = await admin();
    const self = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/users/${user.id}`,
      cookie,
      payload: { isGlobalAdmin: false },
    });
    expect(self.statusCode).toBe(400);

    const passwordOnly = await createUser(app, { passwordHash: 'x' });
    const noCeviDb = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/users/${passwordOnly.id}`,
      cookie,
      payload: { isGlobalAdmin: true },
    });
    expect(noCeviDb.statusCode).toBe(400);

    const other = await createUser(app, { ceviDbId: 4711 });
    const promote = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/users/${other.id}`,
      cookie,
      payload: { isGlobalAdmin: true },
    });
    expect(promote.statusCode).toBe(200);
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: other.id } })).isGlobalAdmin).toBe(true);

    const profile = await createUser(app, { email: null, ceviName: 'Dachs' });
    const denied = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/users/${profile.id}`,
      cookie,
      payload: { isGlobalAdmin: true },
    });
    expect(denied.statusCode).toBe(400);
  });

  describe('Absicherung der Admin-Schnittstelle', () => {
    it('lehnt Anfragen von Abteilungsseiten und anderen Subdomains ab', async () => {
      const { cookie } = await admin();
      const fromDepartment = await inject(app, {
        method: 'GET',
        url: '/api/admin/departments',
        cookie,
        headers: { host: 'illnau.cevi-schichtplan.ch' },
      });
      expect(fromDepartment.statusCode).toBe(403);
      expect(fromDepartment.json().code).toBe('ADMIN_ORIGIN');

      const crossSite = await inject(app, {
        method: 'POST',
        url: '/api/admin/departments',
        cookie,
        headers: {
          host: 'admin.cevi-schichtplan.ch',
          origin: 'https://x.dev.cevi-schichtplan.ch',
          'sec-fetch-site': 'same-site',
        },
        payload: { name: 'Böse', slug: 'boese-abt' },
      });
      expect(crossSite.statusCode).toBe(403);
      expect(await app.prisma.department.count()).toBe(0);

      const ok = await inject(app, {
        method: 'GET',
        url: '/api/admin/departments',
        cookie,
        headers: {
          host: 'admin.cevi-schichtplan.ch',
          origin: 'https://admin.cevi-schichtplan.ch',
          'sec-fetch-site': 'same-origin',
        },
      });
      expect(ok.statusCode).toBe(200);
    });

    it('verlangt eine frische Anmeldung', async () => {
      const user = await createUser(app, { isGlobalAdmin: true, ceviDbId: 2 });
      const old = Math.floor(Date.now() / 1000) - 13 * 3600;
      const token = app.jwt.sign({ id: user.id, email: user.email ?? 'x@x', isGlobalAdmin: true, amr: 'cevidb', iat: old });
      const res = await inject(app, { method: 'GET', url: '/api/admin/session', cookie: `token=${token}` });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('REAUTH_REQUIRED');

      // Für normale Seiten gilt dieselbe Anmeldung weiter
      const me = await inject(app, { method: 'GET', url: '/api/auth/me', cookie: `token=${token}` });
      expect(me.statusCode).toBe(200);

      const fresh = await inject(app, { method: 'GET', url: '/api/admin/session', cookie: authCookie(app, user) });
      expect(fresh.statusCode).toBe(200);
      expect(fresh.json().expiresAt).toBeTruthy();
    });

    it('bremst viele Änderungen hintereinander', async () => {
      const { cookie } = await admin();
      const department = await createDepartment(app);
      const event = await createEvent(app, department.id);
      let last = 0;
      for (let i = 0; i < 61; i++) {
        const res = await inject(app, {
          method: 'PATCH',
          url: `/api/admin/events/${event.id}`,
          cookie,
          payload: { isPublished: i % 2 === 0 },
        });
        last = res.statusCode;
      }
      expect(last).toBe(429);
    });

    it('schreibt jede Änderung ins Protokoll', async () => {
      const { cookie, user } = await admin();
      const created = await inject(app, {
        method: 'POST',
        url: '/api/admin/departments',
        cookie,
        payload: { name: 'Cevi Protokoll', slug: 'protokoll-abt' },
      });
      const departmentId = created.json().department.id;
      await inject(app, {
        method: 'DELETE',
        url: `/api/admin/departments/${departmentId}`,
        cookie,
        payload: { confirm: 'protokoll-abt' },
      });

      const res = await inject(app, { method: 'GET', url: '/api/admin/audit', cookie });
      expect(res.statusCode).toBe(200);
      const actions = res.json().items.map((e: { action: string }) => e.action);
      expect(actions).toEqual(['DEPARTMENT_DELETE', 'DEPARTMENT_CREATE']);
      expect(res.json().items[0]).toMatchObject({ adminId: user.id, targetLabel: 'Cevi Protokoll (protokoll-abt)' });
    });
  });

  it('listet, schaltet und löscht Anlässe', async () => {
    const { cookie } = await admin();
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id, { slug: 'chilbi' });

    const list = await inject(app, { method: 'GET', url: '/api/admin/events?when=all&q=chilbi', cookie });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(1);

    const patch = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/events/${event.id}`,
      cookie,
      payload: { isPublished: false },
    });
    expect(patch.statusCode).toBe(200);
    expect((await app.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).isPublished).toBe(false);

    const del = await inject(app, {
      method: 'DELETE',
      url: `/api/admin/events/${event.id}`,
      cookie,
      payload: { confirm: 'chilbi' },
    });
    expect(del.statusCode).toBe(200);
    expect(await app.prisma.event.count()).toBe(0);
  });

  it('filtert Anlässe und Personen nach Verband', async () => {
    const { cookie } = await admin();
    const cevi = await createDepartment(app, { name: 'Cevi Ort', slug: 'cevi-ort' });
    const pfadi = await app.prisma.department.create({
      data: { slug: 'pfadi-ort', name: 'Pfadi Ort', organization: 'PFADI', membersOnly: false },
    });
    await createEvent(app, cevi.id, { slug: 'cevi-anlass' });
    await createEvent(app, pfadi.id, { slug: 'pfadi-anlass' });

    const pfadiMember = await createUser(app, { passwordHash: 'x', firstName: 'Mitglied' });
    await addMember(app, pfadi.id, pfadiMember.id, 'HELPER');
    const midataUser = await createUser(app, { provider: 'PFADI', providerId: '4711', firstName: 'MiData' });
    const ceviOnly = await createUser(app, { passwordHash: 'x', firstName: 'Cevi' });
    await addMember(app, cevi.id, ceviOnly.id, 'HELPER');

    const events = await inject(app, { method: 'GET', url: '/api/admin/events?when=all&organization=PFADI', cookie });
    expect(events.statusCode).toBe(200);
    expect(events.json().items.map((e: { slug: string }) => e.slug)).toEqual(['pfadi-anlass']);

    const users = await inject(app, { method: 'GET', url: '/api/admin/users?organization=PFADI', cookie });
    expect(users.statusCode).toBe(200);
    const ids = users.json().items.map((u: { id: string }) => u.id);
    expect(ids).toEqual(expect.arrayContaining([pfadiMember.id, midataUser.id]));
    expect(ids).not.toContain(ceviOnly.id);

    const invalid = await inject(app, { method: 'GET', url: '/api/admin/users?organization=SCOUT', cookie });
    expect(invalid.statusCode).toBe(400);
  });

  it('setzt Heimabteilung, filtert Personen nach Abteilung/Verwaist und führt doppelte Konten zusammen', async () => {
    const { cookie } = await admin();
    const department = await createDepartment(app, { name: 'Cevi Merge', slug: 'merge-abt' });
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);

    const guestOld = await createUser(app, { email: null, ceviName: 'AltFuchs', firstName: 'AltFuchs' });
    await app.prisma.user.update({
      where: { id: guestOld.id },
      data: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });

    // Verwaiste Cevi-Name-Profile (0 Eintragungen, >30 Tage alt) filtern
    const staleList = await inject(app, {
      method: 'GET',
      url: '/api/admin/users?method=stale_ceviname',
      cookie,
    });
    expect(staleList.statusCode).toBe(200);
    expect(staleList.json().items.map((u: { id: string }) => u.id)).toContain(guestOld.id);

    // Heimabteilung über Admin-API setzen
    const targetUser = await createUser(app, { ceviDbId: 9001, firstName: 'Nora', lastName: 'Ziel' });
    const setHome = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/users/${targetUser.id}`,
      cookie,
      payload: { homeDepartmentId: department.id },
    });
    expect(setHome.statusCode).toBe(200);

    const byDept = await inject(app, {
      method: 'GET',
      url: `/api/admin/users?departmentId=${department.id}`,
      cookie,
    });
    expect(byDept.statusCode).toBe(200);
    expect(byDept.json().items.map((u: { id: string }) => u.id)).toContain(targetUser.id);
    expect(byDept.json().items[0].homeDepartmentName).toBe('Cevi Merge');

    // Eintragung auf dem Gastprofil anlegen und dann in targetUser zusammenführen
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: guestOld.id } });

    const mergeRes = await inject(app, {
      method: 'POST',
      url: `/api/admin/users/${guestOld.id}/merge`,
      cookie,
      payload: { targetUserId: targetUser.id },
    });
    expect(mergeRes.statusCode).toBe(200);
    expect(await app.prisma.user.findUnique({ where: { id: guestOld.id } })).toBeNull();
    expect(await app.prisma.shiftSignup.count({ where: { userId: targetUser.id } })).toBe(1);

    // Protokoll-Suche nach USER_MERGE
    const auditSearch = await inject(app, {
      method: 'GET',
      url: '/api/admin/audit?q=USER_MERGE',
      cookie,
    });
    expect(auditSearch.statusCode).toBe(200);
    expect(auditSearch.json().items).toHaveLength(1);
    expect(auditSearch.json().items[0]).toMatchObject({
      action: 'USER_MERGE',
      targetId: targetUser.id,
    });
  });
});
