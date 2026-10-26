import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
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

describe.skipIf(!hasTestDb)('Ersatz gesucht', () => {
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

  /** Volle Schicht (1 Platz) mit Anna eingetragen */
  async function setup(eventData: Parameters<typeof createEvent>[2] = {}) {
    const department = await createDepartment(app);
    const lead = await createUser(app, { ceviName: 'Inferno', firstName: 'Nels' });
    const event = await createEvent(app, department.id, { organizerId: lead.id, ...eventData });
    const shift = await createShift(app, event.id, { requiredSlots: 1 });
    const anna = await createUser(app, { firstName: 'Anna', lastName: 'Muster' });
    const ben = await createUser(app, { firstName: 'Ben', lastName: 'Beispiel' });
    const signup = await app.prisma.shiftSignup.create({
      data: { shiftId: shift.id, userId: anna.id, taskId: shift.tasks[0].id },
    });
    return { department, lead, event, shift, anna, ben, signup };
  }

  function offer(signupId: string, cookie: string, payload: object = {}) {
    return inject(app, { method: 'PUT', url: `/api/signups/${signupId}/replacement`, cookie, payload });
  }

  function takeOver(tenant: string, shiftId: string, cookie: string, replacesSignupId: string) {
    return inject(app, {
      method: 'POST',
      url: `/api/shifts/${shiftId}/signup`,
      tenant,
      cookie,
      payload: { replacesSignupId },
    });
  }

  it('lässt die eigene Schicht anbieten und zurückziehen', async () => {
    const { anna, signup } = await setup();

    const res = await offer(signup.id, authCookie(app, anna), { note: 'Ferien' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ replacementNote: 'Ferien', replacementByName: null });
    expect(res.json().replacementWantedAt).toBeTruthy();

    const withdraw = await inject(app, {
      method: 'DELETE',
      url: `/api/signups/${signup.id}/replacement`,
      cookie: authCookie(app, anna),
    });
    expect(withdraw.statusCode).toBe(200);
    const after = await app.prisma.shiftSignup.findUniqueOrThrow({ where: { id: signup.id } });
    expect(after).toMatchObject({ replacementWantedAt: null, replacementNote: null });
  });

  it('lässt nur die Person selbst oder das OK Ersatz suchen', async () => {
    const { lead, ben, signup } = await setup();

    expect((await offer(signup.id, authCookie(app, ben))).statusCode).toBe(403);

    const byOk = await offer(signup.id, authCookie(app, lead));
    expect(byOk.statusCode).toBe(200);
    expect(byOk.json().replacementByName).toBe('Nels / Inferno (OK)');
  });

  it('übernimmt eine volle Schicht mit derselben Arbeit und protokolliert es', async () => {
    const { department, event, shift, anna, ben, signup } = await setup();
    await offer(signup.id, authCookie(app, anna));

    const res = await takeOver(department.slug, shift.id, authCookie(app, ben), signup.id);
    expect(res.statusCode).toBe(200);

    const signups = await app.prisma.shiftSignup.findMany({ where: { shiftId: shift.id } });
    expect(signups).toHaveLength(1);
    expect(signups[0]).toMatchObject({ userId: ben.id, taskId: shift.tasks[0].id, replacementWantedAt: null });

    const log = await app.prisma.shiftSignupLog.findFirstOrThrow({ where: { eventId: event.id } });
    expect(log).toMatchObject({ action: 'REPLACE', helperName: 'Ben Beispiel', performedByName: 'Anna Muster' });
  });

  it('übernimmt auch, wenn das Eintragen geschlossen ist, normales Eintragen aber nicht', async () => {
    const { department, shift, anna, ben, signup } = await setup({ allowPublicSignup: false });
    await offer(signup.id, authCookie(app, anna));
    const other = await createShift(app, shift.eventId, {
      title: 'Grill',
      startTime: new Date('2030-06-02T10:00:00Z'),
      endTime: new Date('2030-06-02T12:00:00Z'),
    });

    const normal = await inject(app, {
      method: 'POST',
      url: `/api/shifts/${other.id}/signup`,
      tenant: department.slug,
      cookie: authCookie(app, ben),
      payload: {},
    });
    expect(normal.statusCode).toBe(403);

    expect((await takeOver(department.slug, shift.id, authCookie(app, ben), signup.id)).statusCode).toBe(200);
  });

  it('lehnt nicht angebotene und eigene Eintragungen ab', async () => {
    const { department, shift, anna, ben, signup } = await setup();

    expect((await takeOver(department.slug, shift.id, authCookie(app, ben), signup.id)).statusCode).toBe(409);

    await offer(signup.id, authCookie(app, anna));
    expect((await takeOver(department.slug, shift.id, authCookie(app, anna), signup.id)).statusCode).toBe(400);
    expect(await app.prisma.shiftSignup.count({ where: { shiftId: shift.id, userId: anna.id } })).toBe(1);
  });

  it('lässt bei gleichzeitigem Übernehmen nur eine Person durch', async () => {
    const { department, shift, anna, signup } = await setup();
    await offer(signup.id, authCookie(app, anna));
    const users = await Promise.all(Array.from({ length: 4 }, () => createUser(app)));

    const results = await Promise.all(
      users.map((u) => takeOver(department.slug, shift.id, authCookie(app, u), signup.id))
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await app.prisma.shiftSignup.count({ where: { shiftId: shift.id } })).toBe(1);
  });

  it('beachtet Schalter und Frist des Anlasses', async () => {
    const { event, shift, anna, signup } = await setup();

    await app.prisma.event.update({ where: { id: event.id }, data: { allowReplacement: false } });
    expect((await offer(signup.id, authCookie(app, anna))).statusCode).toBe(400);

    // Schicht in 1 Stunde, Frist 2 Stunden vorher
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await app.prisma.event.update({ where: { id: event.id }, data: { allowReplacement: true, replacementCutoffHours: 2 } });
    await app.prisma.shift.update({
      where: { id: shift.id },
      data: { startTime: soon, endTime: new Date(soon.getTime() + 2 * 60 * 60 * 1000) },
    });
    expect((await offer(signup.id, authCookie(app, anna))).statusCode).toBe(400);

    await app.prisma.event.update({ where: { id: event.id }, data: { replacementCutoffHours: 0 } });
    expect((await offer(signup.id, authCookie(app, anna))).statusCode).toBe(200);
  });

  it('zeigt «Ersatz gesucht» allen, Grund nur mit Namen', async () => {
    const { department, event, anna, ben, signup } = await setup({ accessType: 'DEPARTMENT' });
    await offer(signup.id, authCookie(app, anna), { note: 'Ferien' });

    const outsider = await inject(app, {
      method: 'GET',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie: authCookie(app, ben),
    });
    expect(outsider.statusCode).toBe(200);
    const su = outsider.json().shifts[0].signups[0];
    expect(su.replacementWantedAt).toBeTruthy();
    expect(su.replacementNote).toBeNull();
    expect(outsider.json().viewer.canTakeOver).toBe(false);

    const own = await inject(app, {
      method: 'GET',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie: authCookie(app, anna),
    });
    expect(own.json().shifts[0].signups[0].replacementNote).toBe('Ferien');
  });
});
