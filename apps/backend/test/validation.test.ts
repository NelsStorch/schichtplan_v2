import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authCookie, createDepartment, createEvent, createShift, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

describe.skipIf(!hasTestDb)('Eingabeprüfung der Routen', () => {
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

  it('meldet ungültige Eingaben als lesbare Meldung in «error» (das Frontend zeigt sie direkt an)', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const user = await createUser(app);
    const res = await inject(app, {
      method: 'POST',
      url: `/api/shifts/${shift.id}/signup`,
      tenant: department.slug,
      headers: { cookie: authCookie(app, user) },
      payload: { guestName: 'x' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).not.toBe('Bad Request');
    expect(body.error).toBe('Bitte Cevi-Name oder Vorname angeben');
    expect(body.error).toBe(body.message);
  });

  it('nimmt das Eintragen ohne shiftId im Body an (die Schicht steht in der URL)', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const res = await inject(app, { method: 'POST', url: `/api/shifts/${shift.id}/signup`, tenant: department.slug, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
