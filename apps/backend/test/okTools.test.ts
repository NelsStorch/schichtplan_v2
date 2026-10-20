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

describe.skipIf(!hasTestDb)('OK-Werkzeuge: Nachrichten und Massenbearbeitung', () => {
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

  async function setup() {
    const department = await createDepartment(app);
    const lead = await createUser(app, { ceviName: 'Inferno', firstName: 'Nels' });
    const event = await createEvent(app, department.id, { organizerId: lead.id });
    return { department, lead, event };
  }

  describe('Nachrichten', () => {
    it('zählt Empfänger mit bestätigter E-Mail und lässt Platzhalter und unbestätigte weg', async () => {
      const { department, lead, event } = await setup();
      const shift = await createShift(app, event.id);
      const ok = await createUser(app, { firstName: 'Anna', lastName: 'Muster' });
      const unverified = await createUser(app, { firstName: 'Ben', lastName: 'Neu', emailVerified: false });
      const placeholder = await createUser(app, { firstName: 'Cleo', lastName: 'Platz', email: 'cevidb_42@cevi-schichtplan.ch' });
      for (const u of [ok, unverified, placeholder]) {
        await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: u.id } });
      }

      const res = await inject(app, {
        method: 'POST',
        url: `/api/events/${event.slug}/messages`,
        tenant: department.slug,
        cookie: authCookie(app, lead),
        payload: { subject: 'Infos', body: 'Hallo zusammen', target: 'ALL', dryRun: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ recipientCount: 1, withoutEmail: ['Ben Neu', 'Cleo Platz'], sent: 0 });
      expect(await app.prisma.eventMessage.count()).toBe(0);
    });

    it('verschickt, speichert den Verlauf und verweigert Helfende', async () => {
      const { department, lead, event } = await setup();
      const shift = await createShift(app, event.id);
      const helper = await createUser(app, { firstName: 'Anna', lastName: 'Muster' });
      await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: helper.id } });
      const url = `/api/events/${event.slug}/messages`;
      const payload = { subject: 'Treffpunkt', body: 'Wir treffen uns beim Zelt.', target: 'SHIFTS', shiftIds: [shift.id] };

      const denied = await inject(app, { method: 'POST', url, tenant: department.slug, cookie: authCookie(app, helper), payload });
      expect(denied.statusCode).toBe(403);

      const res = await inject(app, { method: 'POST', url, tenant: department.slug, cookie: authCookie(app, lead), payload });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ recipientCount: 1, sent: 1 });

      const history = await inject(app, { method: 'GET', url, tenant: department.slug, cookie: authCookie(app, lead) });
      expect(history.json()).toHaveLength(1);
      expect(history.json()[0]).toMatchObject({ subject: 'Treffpunkt', targetLabel: 'Eingetragene in 1 Schicht', recipientCount: 1 });
    });

    it('schickt nicht an Personen ohne Bezug zum Anlass', async () => {
      const { department, lead, event } = await setup();
      const stranger = await createUser(app, { firstName: 'Fremd', lastName: 'Person' });
      const member = await createUser(app, { firstName: 'Mia', lastName: 'Mitglied', homeDepartmentId: department.id });
      const url = `/api/events/${event.slug}/messages`;

      const bad = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie: authCookie(app, lead),
        payload: { subject: 'Hallo', body: 'Test', target: 'PEOPLE', userIds: [stranger.id], dryRun: true },
      });
      expect(bad.statusCode).toBe(400);

      const good = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie: authCookie(app, lead),
        payload: { subject: 'Hallo', body: 'Test', target: 'PEOPLE', userIds: [member.id], dryRun: true },
      });
      expect(good.json().recipientCount).toBe(1);
    });
  });

  describe('Massenbearbeitung', () => {
    it('verschiebt Schichten und setzt Plätze nur, wo es geht', async () => {
      const { department, lead, event } = await setup();
      const a = await createShift(app, event.id, { title: 'Bar', requiredSlots: 3 });
      const b = await createShift(app, event.id, { title: 'Grill', requiredSlots: 3 });
      const helper = await createUser(app);
      for (const extra of [helper, await createUser(app)]) {
        await app.prisma.shiftSignup.create({ data: { shiftId: b.id, taskId: b.tasks[0].id, userId: extra.id } });
      }
      const url = `/api/events/${event.slug}/shifts/bulk`;
      const cookie = authCookie(app, lead);

      const move = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie,
        payload: { shiftIds: [a.id, b.id], action: { type: 'MOVE', minutes: 60 } },
      });
      expect(move.json()).toEqual({ updated: 2, skipped: [] });
      const moved = await app.prisma.shift.findUniqueOrThrow({ where: { id: a.id } });
      expect(moved.startTime.toISOString()).toBe('2030-06-01T19:00:00.000Z');
      expect(moved.endTime.toISOString()).toBe('2030-06-01T23:00:00.000Z');

      // Über die Zeitumstellung (letzter Sonntag im Oktober) bleibt die Uhrzeit gleich
      const autumn = await createShift(app, event.id, {
        title: 'Herbst',
        startTime: new Date('2030-10-25T16:00:00Z'), // 18:00 Sommerzeit
        endTime: new Date('2030-10-25T20:00:00Z'),
      });
      const week = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie,
        payload: { shiftIds: [autumn.id], action: { type: 'MOVE', days: 7 } },
      });
      expect(week.json().updated).toBe(1);
      const later = await app.prisma.shift.findUniqueOrThrow({ where: { id: autumn.id } });
      expect(later.startTime.toISOString()).toBe('2030-11-01T17:00:00.000Z'); // 18:00 Winterzeit

      const slots = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie,
        payload: { shiftIds: [a.id, b.id], action: { type: 'SET_SLOTS', requiredSlots: 1 } },
      });
      expect(slots.json().updated).toBe(1);
      expect(slots.json().skipped).toEqual([{ id: b.id, title: 'Grill', reason: 'Schon 2 Personen eingetragen' }]);
      const task = await app.prisma.shiftTask.findFirstOrThrow({ where: { shiftId: a.id } });
      expect(task.requiredSlots).toBe(1);
    });

    it('löscht nur Schichten des eigenen Anlasses und nur für das OK', async () => {
      const { department, lead, event } = await setup();
      const other = await createEvent(app, department.id);
      const own = await createShift(app, event.id);
      const foreign = await createShift(app, other.id);
      const helper = await createUser(app);
      await addMember(app, department.id, helper.id, 'HELPER');
      const url = `/api/events/${event.slug}/shifts/bulk`;

      const denied = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie: authCookie(app, helper),
        payload: { shiftIds: [own.id], action: { type: 'DELETE' } },
      });
      expect(denied.statusCode).toBe(403);

      const mixed = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie: authCookie(app, lead),
        payload: { shiftIds: [own.id, foreign.id], action: { type: 'DELETE' } },
      });
      expect(mixed.statusCode).toBe(400);
      expect(await app.prisma.shift.count()).toBe(2);

      const ok = await inject(app, {
        method: 'POST',
        url,
        tenant: department.slug,
        cookie: authCookie(app, lead),
        payload: { shiftIds: [own.id], action: { type: 'DELETE' } },
      });
      expect(ok.json().updated).toBe(1);
      expect(await app.prisma.shift.count()).toBe(1);
    });
  });
});
