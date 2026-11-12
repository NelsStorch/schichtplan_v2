import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COORDINATION,
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

describe.skipIf(!hasTestDb)('Eintragen in Schichten', () => {
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

  async function signup(tenant: string, shiftId: string, cookie: string, payload: object = {}) {
    return inject(app, { method: 'POST', url: `/api/shifts/${shiftId}/signup`, tenant, cookie, payload });
  }

  it('überbucht den letzten Platz auch bei gleichzeitigen Eintragungen nicht', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id, { requiredSlots: 1 });
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser(app)));

    const results = await Promise.all(users.map((u) => signup(department.slug, shift.id, authCookie(app, u))));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(5);
    expect(await app.prisma.shiftSignup.count({ where: { shiftId: shift.id } })).toBe(1);
  });

  it('trägt bei einem Doppelklick nur einmal ein', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id, { requiredSlots: 5 });
    const user = await createUser(app);
    const cookie = authCookie(app, user);

    await Promise.all([signup(department.slug, shift.id, cookie), signup(department.slug, shift.id, cookie)]);
    expect(await app.prisma.shiftSignup.count({ where: { shiftId: shift.id, userId: user.id } })).toBe(1);
  });

  it('verlangt ein Konto', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const res = await inject(app, { method: 'POST', url: `/api/shifts/${shift.id}/signup`, tenant: department.slug, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('lässt bei «nur Abteilung» Aussenstehende nicht eintragen', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id, { accessType: 'DEPARTMENT' });
    const shift = await createShift(app, event.id);
    const outsider = await createUser(app);
    const member = await createUser(app, { homeDepartmentId: department.id });

    const denied = await signup(department.slug, shift.id, authCookie(app, outsider));
    expect(denied.statusCode).toBe(403);
    expect(denied.json().reason).toBe('NO_DEPARTMENT');

    const ok = await signup(department.slug, shift.id, authCookie(app, member));
    expect(ok.statusCode).toBe(200);
  });

  it('findet Schichten anderer Abteilungen nicht', async () => {
    const department = await createDepartment(app);
    const other = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const user = await createUser(app);
    const res = await signup(other.slug, shift.id, authCookie(app, user));
    expect(res.statusCode).toBe(404);
  });

  it('lässt das OK Gäste eintragen, Helfer*innen aber nicht', async () => {
    const department = await createDepartment(app);
    const okLead = await createUser(app);
    const event = await createEvent(app, department.id, { organizerId: okLead.id });
    const shift = await createShift(app, event.id);

    const byOk = await signup(department.slug, shift.id, authCookie(app, okLead), { guestName: 'Gast Eins' });
    expect(byOk.statusCode).toBe(200);
    const guest = await app.prisma.shiftSignup.findFirstOrThrow({ where: { shiftId: shift.id, guestName: 'Gast Eins' } });
    expect(guest.userId).toBeNull();

    // Ohne OK-Rechte wird guestName ignoriert: die Person trägt sich selbst ein
    const helper = await createUser(app);
    const self = await signup(department.slug, shift.id, authCookie(app, helper), { guestName: 'Fremder Name' });
    expect(self.statusCode).toBe(200);
    expect(await app.prisma.shiftSignup.count({ where: { guestName: 'Fremder Name' } })).toBe(0);
    expect(await app.prisma.shiftSignup.count({ where: { userId: helper.id } })).toBe(1);
  });

  it('lässt nur die eigene Eintragung oder das OK austragen', async () => {
    const department = await createDepartment(app);
    const planner = await createUser(app);
    await addMember(app, department.id, planner.id, 'HELPER', COORDINATION);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const owner = await createUser(app);
    const stranger = await createUser(app);
    await signup(department.slug, shift.id, authCookie(app, owner));
    const entry = await app.prisma.shiftSignup.findFirstOrThrow({ where: { userId: owner.id } });

    const url = `/api/shifts/${shift.id}/signup?signupId=${entry.id}`;
    const denied = await inject(app, { method: 'DELETE', url, tenant: department.slug, cookie: authCookie(app, stranger) });
    expect(denied.statusCode).toBe(403);

    const anonymous = await inject(app, { method: 'DELETE', url, tenant: department.slug });
    expect(anonymous.statusCode).toBe(401);

    const byPlanner = await inject(app, { method: 'DELETE', url, tenant: department.slug, cookie: authCookie(app, planner) });
    expect(byPlanner.statusCode).toBe(200);
  });

  it('blockiert Helfer*innen bei zeitlich überlappenden Schichten', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift1 = await createShift(app, event.id, {
      title: 'Grill',
      startTime: new Date('2030-06-01T10:00:00Z'),
      endTime: new Date('2030-06-01T14:00:00Z'),
    });
    const shift2 = await createShift(app, event.id, {
      title: 'Kasse',
      startTime: new Date('2030-06-01T12:00:00Z'),
      endTime: new Date('2030-06-01T16:00:00Z'),
    });
    const helper = await createUser(app);
    const cookie = authCookie(app, helper);

    // Erste Schicht eintragen -> OK
    const first = await signup(department.slug, shift1.id, cookie);
    expect(first.statusCode).toBe(200);

    // Zweite überlappende Schicht eintragen -> 409 TIME_COLLISION
    const second = await signup(department.slug, shift2.id, cookie);
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('TIME_COLLISION');
  });

  it('warnt das OK bei Zeitkollision und erlaubt Einteilen mit confirmCollision', async () => {
    const department = await createDepartment(app);
    const okLead = await createUser(app);
    const event = await createEvent(app, department.id, { organizerId: okLead.id });
    const shift1 = await createShift(app, event.id, {
      title: 'Küche',
      startTime: new Date('2030-06-01T10:00:00Z'),
      endTime: new Date('2030-06-01T14:00:00Z'),
    });
    const shift2 = await createShift(app, event.id, {
      title: 'Abwasch',
      startTime: new Date('2030-06-01T12:00:00Z'),
      endTime: new Date('2030-06-01T16:00:00Z'),
    });
    // Einteilen geht nur für Personen der Abteilung oder des Anlasses
    const helper = await createUser(app, { homeDepartmentId: department.id });
    const okCookie = authCookie(app, okLead);

    // OK teilt Helfer für Schicht 1 ein -> OK
    const first = await signup(department.slug, shift1.id, okCookie, { userId: helper.id });
    expect(first.statusCode).toBe(200);

    // OK teilt Helfer für überlappende Schicht 2 ein OHNE Bestätigung -> 409 mit Warnung
    const secondWithoutConfirm = await signup(department.slug, shift2.id, okCookie, { userId: helper.id });
    expect(secondWithoutConfirm.statusCode).toBe(409);
    expect(secondWithoutConfirm.json().code).toBe('TIME_COLLISION');

    // OK teilt Helfer für überlappende Schicht 2 ein MIT confirmCollision: true -> 200 Erfolgreich
    const secondWithConfirm = await signup(department.slug, shift2.id, okCookie, {
      userId: helper.id,
      confirmCollision: true,
    });
    expect(secondWithConfirm.statusCode).toBe(200);
    expect(await app.prisma.shiftSignup.count({ where: { shiftId: shift2.id, userId: helper.id } })).toBe(1);
  });

  it('liefert in /api/shifts/my Einsatz-Briefing-Felder (Mithelfende, Verantwortliche, Belegung) ohne Platzhalter-Mails', async () => {
    const department = await createDepartment(app);
    const okLead = await createUser(app, {
      firstName: 'Klara',
      lastName: 'Kontakt',
      ceviName: 'Luchs',
      phone: '079 111 22 33',
      email: 'cevidb_999@cevi-schichtplan.ch',
    });
    const event = await createEvent(app, department.id, {
      organizerId: okLead.id,
      contactVisibility: 'BOTH',
    });
    await app.prisma.event.update({
      where: { id: event.id },
      data: { contactUserId: okLead.id },
    });
    const shift = await createShift(app, event.id, { title: 'Zeltbau', requiredSlots: 3 });

    const helper1 = await createUser(app, { firstName: 'Anna', lastName: 'Eins', ceviName: 'Adler' });
    const helper2 = await createUser(app, { firstName: 'Beni', lastName: 'Zwei', ceviName: 'Bär' });

    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: helper1.id } });
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: helper2.id } });
    await app.prisma.shiftResponsible.create({ data: { shiftId: shift.id, userId: okLead.id } });

    const res = await inject(app, {
      method: 'GET',
      url: '/api/shifts/my',
      tenant: department.slug,
      cookie: authCookie(app, helper1),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      shiftId: shift.id,
      coHelpers: ['Bär'],
      filledSlots: 2,
      requiredSlots: 3,
      dayCutoffTime: '04:00',
    });
    // Platzhalter-E-Mail (cevidb_*@cevi-schichtplan.ch) wird bei Verantwortlichen & Kontakt ausgeblendet
    expect(items[0].responsibles[0]).toMatchObject({
      id: okLead.id,
      phone: '079 111 22 33',
      email: null,
    });
    expect(items[0].contactUser).toMatchObject({
      id: okLead.id,
      phone: '079 111 22 33',
      email: null,
    });
  });
});
