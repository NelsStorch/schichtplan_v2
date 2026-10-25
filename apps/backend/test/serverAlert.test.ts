import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authCookie,
  createTestApp,
  createUser,
  hasTestDb,
  inject,
  resetDb,
} from './helpers.js';
import { buildApp } from '../src/app.js';
import { resetAlertCooldowns } from '../src/services/serverAlert.js';

describe.skipIf(!hasTestDb)('Server Alert & Webhook Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await resetDb(app);
    resetAlertCooldowns();
    vi.restoreAllMocks();
  });

  it('führt POST /api/admin/alert-test erfolgreich aus und sendet an Webhook', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    process.env.ADMIN_ALERT_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';

    const adminUser = await createUser(app, { isGlobalAdmin: true, ceviDbId: 1234 });
    const cookie = authCookie(app, adminUser);

    const res = await inject(app, {
      method: 'POST',
      url: '/api/admin/alert-test',
      cookie,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      result: {
        sent: true,
        webhookSent: true,
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://discord.com/api/webhooks/test');
    const body = JSON.parse(calledOpts.body);
    expect(body.category).toBe('TEST');
    expect(body.title).toContain('Server-Leitung Webhook-Test');
  });

  it('fängt unerwartete Serverfehler im ErrorHandler ab und alarmiert', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ok'),
    });
    vi.stubGlobal('fetch', mockFetch);

    process.env.ADMIN_ALERT_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';

    const freshApp = await buildApp();
    freshApp.get('/test/simulate-db-overload', async () => {
      const err: any = new Error('Connection pool exhausted');
      err.code = 'P2024';
      throw err;
    });

    const res = await freshApp.inject({
      method: 'GET',
      url: '/test/simulate-db-overload',
    });

    expect(res.statusCode).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.category).toBe('DB_OVERLOAD');
    expect(body.level).toBe('CRITICAL');
    expect(body.title).toContain('Datenbank kurzzeitig überlastet');

    await freshApp.close();
  });
});
