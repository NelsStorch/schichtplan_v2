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

  it('meldet Fehler von Fastify selbst im selben Format und auf Deutsch', async () => {
    const department = await createDepartment(app);
    const invalidJson = await inject(app, {
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{kein json',
    });
    expect(invalidJson.statusCode).toBe(400);
    expect(invalidJson.json()).toMatchObject({ statusCode: 400, error: 'Die Anfrage enthält kein gültiges JSON.' });

    const unknown = await inject(app, { method: 'GET', url: '/api/gibt-es-nicht', tenant: department.slug });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', error: 'Nicht gefunden.' });
  });

  it('prüft auch Pfadparameter (z. B. Bon-ID muss eine UUID sein)', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const user = await createUser(app);
    const res = await inject(app, {
      method: 'POST',
      url: `/api/events/${event.slug}/catering-tokens/keine-uuid/redeem`,
      tenant: department.slug,
      headers: { cookie: authCookie(app, user) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('FST_ERR_VALIDATION');
    // Standardmeldung von Zod auf Deutsch (app.ts: z.config(z.locales.de()))
    expect(res.json().error).toBe('Ungültig: UUID');
  });

  it('dupliziert Schichten nur mit gültigen Zeiten', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const admin = await createUser(app, { isGlobalAdmin: true });
    const res = await inject(app, {
      method: 'POST',
      url: `/api/shifts/${shift.id}/duplicate`,
      tenant: department.slug,
      headers: { cookie: authCookie(app, admin) },
      payload: { title: { gar: 'kein Text' }, startTime: 'morgen' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('nimmt das Eintragen ohne shiftId im Body an (die Schicht steht in der URL)', async () => {
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);
    const res = await inject(app, { method: 'POST', url: `/api/shifts/${shift.id}/signup`, tenant: department.slug, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
