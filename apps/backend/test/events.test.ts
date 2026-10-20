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

describe.skipIf(!hasTestDb)('Rechte bei Anlässen', () => {
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

  it('lässt nur Abteilungsleitung und OK-Leitung die Einstellungen ändern', async () => {
    const department = await createDepartment(app);
    const lead = await createUser(app);
    const event = await createEvent(app, department.id, { organizerId: lead.id });
    const member = await createUser(app);
    await app.prisma.eventOrganizer.create({ data: { eventId: event.id, userId: member.id, role: 'OK_MEMBER' } });
    const admin = await createUser(app);
    await addMember(app, department.id, admin.id, 'ADMIN');

    const patch = (cookie: string) =>
      inject(app, {
        method: 'PATCH',
        url: `/api/events/${event.slug}`,
        tenant: department.slug,
        cookie,
        payload: { accessType: 'DEPARTMENT' },
      });

    expect((await patch(authCookie(app, member))).statusCode).toBe(403);
    expect((await patch(authCookie(app, lead))).statusCode).toBe(200);
    expect((await patch(authCookie(app, admin))).statusCode).toBe(200);
  });

  it('lässt OK-Mitglieder Schichten planen', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const member = await createUser(app);
    await app.prisma.eventOrganizer.create({ data: { eventId: event.id, userId: member.id, role: 'OK_MEMBER' } });
    const res = await inject(app, {
      method: 'POST',
      url: '/api/shifts',
      tenant: department.slug,
      cookie: authCookie(app, member),
      payload: {
        eventId: event.id,
        title: 'Grill',
        startTime: '2030-06-01T10:00:00.000Z',
        endTime: '2030-06-01T12:00:00.000Z',
        requiredSlots: 2,
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('lässt Helfer*innen keine Schichten anderer Anlässe ändern', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const helper = await createUser(app);
    await addMember(app, department.id, helper.id, 'HELPER');
    const cookie = authCookie(app, helper);

    expect(
      (await inject(app, { method: 'PATCH', url: `/api/shifts/${shift.id}`, tenant: department.slug, cookie, payload: { title: 'Neu' } }))
        .statusCode
    ).toBe(403);
    expect(
      (await inject(app, { method: 'DELETE', url: `/api/shifts/${shift.id}`, tenant: department.slug, cookie })).statusCode
    ).toBe(403);
  });

  it('zeigt bei «nur Mitglieder» Aussenstehenden keine Anlässe', async () => {
    const department = await createDepartment(app, { membersOnly: true });
    const event = await createEvent(app, department.id, { accessType: 'DEPARTMENT' });
    const outsider = await createUser(app);
    const insider = await createUser(app, { homeDepartmentId: department.id });

    const list = await inject(app, { method: 'GET', url: '/api/events', tenant: department.slug, cookie: authCookie(app, outsider) });
    expect(list.statusCode).toBe(403);
    const detail = await inject(app, {
      method: 'GET',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie: authCookie(app, outsider),
    });
    expect(detail.statusCode).toBe(404);

    const own = await inject(app, { method: 'GET', url: '/api/events', tenant: department.slug, cookie: authCookie(app, insider) });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toHaveLength(1);
  });

  it('verbirgt Namen bei internen Anlässen vor Nicht-Berechtigten', async () => {
    const department = await createDepartment(app, { membersOnly: false });
    const event = await createEvent(app, department.id, { accessType: 'DEPARTMENT' });
    const shift = await createShift(app, event.id);
    const helper = await createUser(app, { ceviName: 'Geheimname', homeDepartmentId: department.id });
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: helper.id } });

    const anonymous = await inject(app, { method: 'GET', url: `/api/events/${event.slug}`, tenant: department.slug });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.body).not.toContain('Geheimname');

    const insider = await createUser(app, { homeDepartmentId: department.id });
    const visible = await inject(app, {
      method: 'GET',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie: authCookie(app, insider),
    });
    expect(visible.body).toContain('Geheimname');
  });

  it('lehnt Schichten und Anlässe ab, die vor dem Beginn enden', async () => {
    const department = await createDepartment(app);
    const admin = await createUser(app);
    await addMember(app, department.id, admin.id, 'ADMIN');
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const cookie = authCookie(app, admin);

    const created = await inject(app, {
      method: 'POST',
      url: '/api/shifts',
      tenant: department.slug,
      cookie,
      payload: { eventId: event.id, title: 'Grill', startTime: '2030-06-01T12:00:00.000Z', endTime: '2030-06-01T10:00:00.000Z' },
    });
    expect(created.statusCode).toBe(400);

    // Nur das Ende geändert: verglichen wird mit dem bestehenden Beginn (18:00)
    const patched = await inject(app, {
      method: 'PATCH',
      url: `/api/shifts/${shift.id}`,
      tenant: department.slug,
      cookie,
      payload: { endTime: '2030-06-01T17:00:00.000Z' },
    });
    expect(patched.statusCode).toBe(400);

    const eventPatch = await inject(app, {
      method: 'PATCH',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie,
      payload: { endDate: '2030-05-01T00:00:00.000Z' },
    });
    expect(eventPatch.statusCode).toBe(400);
  });
});
