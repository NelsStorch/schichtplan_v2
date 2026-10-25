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

describe.skipIf(!hasTestDb)('Calendar Webcal Feed', () => {
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

  it('erzeugt und liefert Kalender-Token für angemeldeten Benutzer', async () => {
    const user = await createUser(app, { firstName: 'Robin', ceviName: 'Falk' });

    const res = await inject(app, {
      method: 'GET',
      url: '/api/calendar/token',
      cookie: authCookie(app, user),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.token).toHaveLength(48);
    expect(data.webcalUrl).toContain(`webcal://`);
    expect(data.webcalUrl).toContain(`/api/calendar/${data.token}.ics`);
    expect(data.httpsUrl).toContain(`/api/calendar/${data.token}.ics`);

    // Bleibt beim erneuten Abruf gleich (lazy generated)
    const res2 = await inject(app, {
      method: 'GET',
      url: '/api/calendar/token',
      cookie: authCookie(app, user),
    });
    expect(res2.json().token).toBe(data.token);
  });

  it('kann Kalender-Token zurücksetzen', async () => {
    const user = await createUser(app, { firstName: 'Robin' });

    const first = await inject(app, {
      method: 'GET',
      url: '/api/calendar/token',
      cookie: authCookie(app, user),
    });
    const token1 = first.json().token;

    const resetRes = await inject(app, {
      method: 'POST',
      url: '/api/calendar/token/reset',
      cookie: authCookie(app, user),
    });
    expect(resetRes.statusCode).toBe(200);
    const token2 = resetRes.json().token;
    expect(token2).toHaveLength(48);
    expect(token2).not.toBe(token1);

    // Altes Token liefert 404
    const oldFeed = await inject(app, {
      method: 'GET',
      url: `/api/calendar/${token1}.ics`,
    });
    expect(oldFeed.statusCode).toBe(404);

    // Neues Token liefert 200
    const newFeed = await inject(app, {
      method: 'GET',
      url: `/api/calendar/${token2}.ics`,
    });
    expect(newFeed.statusCode).toBe(200);
  });

  it('liefert ics-Feed mit Schichten des Benutzers', async () => {
    const department = await createDepartment(app, { slug: 'illnau', name: 'Cevi Illnau-Effretikon' });
    const user = await createUser(app, { firstName: 'Tim', ceviName: 'Puma' });
    const event = await createEvent(app, department.id, { slug: 'chilbi-2026', title: 'Chilbi 2026' });

    const startTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const endTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000);

    const shift = await createShift(app, event.id, {
      title: 'Kuchenverkauf',
      startTime,
      endTime,
    });

    await app.prisma.shiftSignup.create({
      data: {
        userId: user.id,
        shiftId: shift.id,
      },
    });

    const tokenRes = await inject(app, {
      method: 'GET',
      url: '/api/calendar/token',
      cookie: authCookie(app, user),
    });
    const token = tokenRes.json().token;

    const feedRes = await inject(app, {
      method: 'GET',
      url: `/api/calendar/${token}.ics`,
    });

    expect(feedRes.statusCode).toBe(200);
    expect(feedRes.headers['content-type']).toContain('text/calendar');
    expect(feedRes.payload).toContain('BEGIN:VCALENDAR');
    expect(feedRes.payload).toContain('X-WR-CALNAME:Cevi Schichtplan (Puma)');
    expect(feedRes.payload).toContain('SUMMARY:Kuchenverkauf · Chilbi');
    expect(feedRes.payload).toContain('LOCATION:Cevi Illnau-Effretikon');
    expect(feedRes.payload).toContain('END:VCALENDAR');
  });
});
