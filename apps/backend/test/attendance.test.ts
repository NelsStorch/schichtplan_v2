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

describe.skipIf(!hasTestDb)('Anwesenheitsliste', () => {
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

  async function setup(attendanceMode: string, checkinToken: string | null = null) {
    const department = await createDepartment(app);
    const lead = await createUser(app, { ceviName: 'Inferno', firstName: 'Nels' });
    const event = await createEvent(app, department.id, { organizerId: lead.id });
    await app.prisma.event.update({ where: { id: event.id }, data: { attendanceMode, checkinToken } });
    const helper = await createUser(app, { firstName: 'Anna', lastName: 'Muster' });
    return { department, lead, event, helper };
  }

  async function signupFor(userId: string, shiftId: string) {
    return app.prisma.shiftSignup.create({ data: { shiftId, userId } });
  }

  it('lässt das OK abhaken und protokolliert es', async () => {
    const { department, lead, event, helper } = await setup('OK_ONLY');
    const shift = await createShift(app, event.id);
    const signup = await signupFor(helper.id, shift.id);

    const res = await inject(app, {
      method: 'PUT',
      url: `/api/events/${event.slug}/signups/${signup.id}/attendance`,
      tenant: department.slug,
      cookie: authCookie(app, lead),
      payload: { status: 'EXCUSED' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ attendance: 'EXCUSED', attendanceSource: 'OK', attendanceByName: 'Nels / Inferno (OK)' });

    const log = await app.prisma.shiftSignupLog.findFirstOrThrow({ where: { eventId: event.id } });
    expect(log).toMatchObject({ action: 'ATTENDANCE', attendance: 'EXCUSED', helperName: 'Anna Muster' });

    const reset = await inject(app, {
      method: 'PUT',
      url: `/api/events/${event.slug}/signups/${signup.id}/attendance`,
      tenant: department.slug,
      cookie: authCookie(app, lead),
      payload: { status: null },
    });
    expect(reset.json().attendance).toBeNull();
  });

  it('verweigert Helfer:innen das Abhaken und sperrt bei ausgeschalteter Liste', async () => {
    const { department, lead, event, helper } = await setup('OFF');
    const shift = await createShift(app, event.id);
    const signup = await signupFor(helper.id, shift.id);
    const url = `/api/events/${event.slug}/signups/${signup.id}/attendance`;

    const off = await inject(app, { method: 'PUT', url, tenant: department.slug, cookie: authCookie(app, lead), payload: { status: 'PRESENT' } });
    expect(off.statusCode).toBe(400);

    await app.prisma.event.update({ where: { id: event.id }, data: { attendanceMode: 'OK_ONLY' } });
    const helperRes = await inject(app, { method: 'PUT', url, tenant: department.slug, cookie: authCookie(app, helper), payload: { status: 'PRESENT' } });
    expect(helperRes.statusCode).toBe(403);
  });

  it('findet Eintragungen anderer Anlässe nicht', async () => {
    const { department, lead, event, helper } = await setup('OK_ONLY');
    const other = await createEvent(app, department.id);
    const otherShift = await createShift(app, other.id);
    const signup = await signupFor(helper.id, otherShift.id);

    const res = await inject(app, {
      method: 'PUT',
      url: `/api/events/${event.slug}/signups/${signup.id}/attendance`,
      tenant: department.slug,
      cookie: authCookie(app, lead),
      payload: { status: 'PRESENT' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('checkt per QR-Code nur laufende eigene Schichten ein', async () => {
    const token = 'geheimer-code-1234567890';
    const { department, event, helper } = await setup('OK_AND_QR', token);
    const now = Date.now();
    const running = await createShift(app, event.id, {
      title: 'Grill',
      startTime: new Date(now - 60 * 60_000),
      endTime: new Date(now + 60 * 60_000),
    });
    const later = await createShift(app, event.id, {
      title: 'Abbau',
      startTime: new Date(now + 5 * 60 * 60_000),
      endTime: new Date(now + 7 * 60 * 60_000),
    });
    const runningSignup = await signupFor(helper.id, running.id);
    const laterSignup = await signupFor(helper.id, later.id);
    const cookie = authCookie(app, helper);

    const wrong = await inject(app, { method: 'POST', url: `/api/events/${event.slug}/checkin`, tenant: department.slug, cookie, payload: { code: 'falscher-code-123456' } });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().code).toBe('INVALID_CODE');

    const res = await inject(app, { method: 'POST', url: `/api/events/${event.slug}/checkin`, tenant: department.slug, cookie, payload: { code: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().checkedIn).toEqual([expect.objectContaining({ signupId: runningSignup.id, alreadyPresent: false })]);

    expect((await app.prisma.shiftSignup.findUniqueOrThrow({ where: { id: runningSignup.id } })).attendance).toBe('PRESENT');
    expect((await app.prisma.shiftSignup.findUniqueOrThrow({ where: { id: laterSignup.id } })).attendance).toBeNull();

    const again = await inject(app, { method: 'POST', url: `/api/events/${event.slug}/checkin`, tenant: department.slug, cookie, payload: { code: token } });
    expect(again.json().checkedIn[0].alreadyPresent).toBe(true);
  });

  it('nennt die nächste Schicht, wenn noch keine läuft', async () => {
    const token = 'geheimer-code-1234567890';
    const { department, event, helper } = await setup('OK_AND_QR', token);
    const shift = await createShift(app, event.id, {
      startTime: new Date(Date.now() + 3 * 60 * 60_000),
      endTime: new Date(Date.now() + 5 * 60 * 60_000),
    });
    await signupFor(helper.id, shift.id);

    const res = await inject(app, { method: 'POST', url: `/api/events/${event.slug}/checkin`, tenant: department.slug, cookie: authCookie(app, helper), payload: { code: token } });
    expect(res.json()).toMatchObject({ checkedIn: [], nextShift: { shiftTitle: 'Bar' } });
  });

  it('lehnt den Check-in ab, wenn nur das OK abhakt', async () => {
    const { department, event, helper } = await setup('OK_ONLY', 'geheimer-code-1234567890');
    const res = await inject(app, {
      method: 'POST',
      url: `/api/events/${event.slug}/checkin`,
      tenant: department.slug,
      cookie: authCookie(app, helper),
      payload: { code: 'geheimer-code-1234567890' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('CHECKIN_DISABLED');
  });

  it('erzeugt beim Einschalten einen Code, das OK kann ihn erneuern, Helfer:innen sehen ihn nie', async () => {
    const { department, lead, event, helper } = await setup('OFF');
    const planner = await createUser(app);
    await addMember(app, department.id, planner.id, 'HELPER', COORDINATION);

    const patch = await inject(app, {
      method: 'PATCH',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie: authCookie(app, lead),
      payload: { attendanceMode: 'OK_AND_QR' },
    });
    expect(patch.statusCode).toBe(200);
    const first = (await app.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).checkinToken;
    expect(first).toBeTruthy();

    const asLead = await inject(app, { method: 'GET', url: `/api/events/${event.slug}`, tenant: department.slug, cookie: authCookie(app, lead) });
    expect(asLead.json().checkinToken).toBe(first);
    const asHelper = await inject(app, { method: 'GET', url: `/api/events/${event.slug}`, tenant: department.slug, cookie: authCookie(app, helper) });
    expect(asHelper.json().checkinToken).toBeNull();

    // Planung (ohne OK-Leitung) darf abhaken, aber den Code nicht erneuern
    const plannerRotate = await inject(app, { method: 'POST', url: `/api/events/${event.slug}/checkin-token`, tenant: department.slug, cookie: authCookie(app, planner) });
    expect(plannerRotate.statusCode).toBe(403);

    const rotate = await inject(app, { method: 'POST', url: `/api/events/${event.slug}/checkin-token`, tenant: department.slug, cookie: authCookie(app, lead) });
    expect(rotate.statusCode).toBe(200);
    expect(rotate.json().checkinToken).not.toBe(first);
  });
});
