import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { departmentPageUrl, eventUrl, formatShiftTime, sendDueShiftReminders } from '../src/services/shiftReminders.js';
import { authCookie, createDepartment, createEvent, createShift, createTestApp, createUser, hasTestDb, resetDb } from './helpers.js';

describe('formatShiftTime / eventUrl', () => {
  it('formatiert in Schweizer Zeit', () => {
    expect(formatShiftTime(new Date('2030-06-01T16:00:00Z'), new Date('2030-06-01T20:00:00Z'))).toBe(
      'Sa., 01.06.2030, 18:00–22:00'
    );
    expect(formatShiftTime(new Date('2030-06-01T20:00:00Z'), new Date('2030-06-02T01:00:00Z'))).toContain('So.');
  });

  it('verlinkt den Anlass auf der Abteilung', () => {
    expect(eventUrl('illnau', 'chilbi', { NODE_ENV: 'production', DOMAIN: 'cevi-schichtplan.ch' })).toBe(
      'https://illnau.cevi-schichtplan.ch/events/chilbi'
    );
  });

  it('verlinkt Seiten der Abteilungs-App (z. B. Bons unter «Meine Schichten»)', () => {
    const prod = { NODE_ENV: 'production', DOMAIN: 'cevi-schichtplan.ch' };
    expect(departmentPageUrl('illnau', '/meine-schichten', 'CEVI', prod)).toBe(
      'https://illnau.cevi-schichtplan.ch/meine-schichten'
    );
    expect(departmentPageUrl('wald', 'meine-schichten', 'PFADI', prod)).toBe(
      'https://wald.pfadi-schichtplan.ch/meine-schichten'
    );
    expect(departmentPageUrl('illnau', '/meine-schichten', 'CEVI', { NODE_ENV: 'production', DOMAIN: 'dev.cevi-schichtplan.ch' })).toBe(
      'https://illnau.dev.cevi-schichtplan.ch/meine-schichten'
    );
    expect(departmentPageUrl('illnau', '/meine-schichten', 'CEVI', { NODE_ENV: 'development' })).toBe(
      'http://illnau.localhost:3000/meine-schichten'
    );
  });
});

describe.skipIf(!hasTestDb)('sendDueShiftReminders', () => {
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

  it('erinnert einmal an Schichten in den nächsten 24 Stunden', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id); // Start 2030-06-01T18:00Z
    const verified = await createUser(app, { email: 'ja@example.com' });
    const unverified = await createUser(app, { email: 'nein@example.com', emailVerified: false });
    const placeholder = await createUser(app, { email: 'cevidb_5@cevi-schichtplan.ch' });
    for (const u of [verified, unverified, placeholder]) {
      await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: u.id } });
    }

    const send = vi.fn(async () => true);
    // Zwei Tage vorher: noch nicht fällig
    expect(await sendDueShiftReminders(app.prisma, new Date('2030-05-30T18:00:00Z'), send)).toBe(0);

    const now = new Date('2030-06-01T08:00:00Z');
    expect(await sendDueShiftReminders(app.prisma, now, send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject([{ to: 'ja@example.com', shiftTitle: 'Bar' }]);

    // Nicht doppelt, auch bei zwei gleichzeitigen Läufen
    const again = await Promise.all([
      sendDueShiftReminders(app.prisma, now, send),
      sendDueShiftReminders(app.prisma, now, send),
    ]);
    expect(again).toEqual([0, 0]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('lässt sich im Profil abschalten', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const user = await createUser(app, { email: 'aus@example.com' });
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: user.id } });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: { cookie: authCookie(app, user) },
      payload: { shiftReminders: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().shiftReminders).toBe(false);

    const send = vi.fn(async () => true);
    expect(await sendDueShiftReminders(app.prisma, new Date('2030-06-01T08:00:00Z'), send)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('rollt den Claim zurück, wenn der E-Mail-Versand fehlschlägt', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const user = await createUser(app, { email: 'fehler@example.com' });
    const signup = await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: user.id } });

    const sendFail = vi.fn(async () => false);
    const now = new Date('2030-06-01T08:00:00Z');
    expect(await sendDueShiftReminders(app.prisma, now, sendFail)).toBe(0);
    expect(sendFail).toHaveBeenCalledTimes(1);

    const afterFail = await app.prisma.shiftSignup.findUnique({ where: { id: signup.id } });
    expect(afterFail?.sentEmailReminders).toEqual([]);

    const sendOk = vi.fn(async () => true);
    expect(await sendDueShiftReminders(app.prisma, now, sendOk)).toBe(1);
    expect(sendOk).toHaveBeenCalledTimes(1);

    const afterOk = await app.prisma.shiftSignup.findUnique({ where: { id: signup.id } });
    expect(afterOk?.sentEmailReminders).toContain(1440);
  });

  it('erinnert Gast-Helfer ohne Benutzerkonto per E-Mail', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const guestSignup = await app.prisma.shiftSignup.create({
      data: {
        shiftId: shift.id,
        guestName: 'Gast Helfer',
        guestEmail: 'gast@example.com',
      },
    });

    const send = vi.fn(async () => true);
    const now = new Date('2030-06-01T08:00:00Z');
    expect(await sendDueShiftReminders(app.prisma, now, send)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toMatchObject([{
      to: 'gast@example.com',
      name: 'Gast Helfer',
      shiftTitle: 'Bar',
    }]);

    const updated = await app.prisma.shiftSignup.findUnique({ where: { id: guestSignup.id } });
    expect(updated?.sentEmailReminders).toContain(1440);
  });
});
