import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { zurichDayKey } from '@schichtplan/shared';
import { flushUsageStats, resetUsageBuffer } from '../src/services/usageStats.js';
import { ensureDailySnapshot, rollUpRequestStats } from '../src/services/statsMaintenance.js';
import { authCookie, createDepartment, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

describe.skipIf(!hasTestDb)('Nutzungsstatistik', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    resetUsageBuffer();
    await resetDb(app);
  });

  const counter = async (metric: string, dim = '') => {
    await flushUsageStats(app.prisma);
    const rows = await app.prisma.usageCounter.findMany({ where: { metric, dim } });
    return rows.reduce((a, r) => a + r.count, 0);
  };

  it('nimmt Meldungen aus dem Browser nur aus der festen Liste an', async () => {
    const department = await createDepartment(app, { slug: 'statsabt' });
    const res = await inject(app, {
      method: 'POST',
      url: '/api/stats/ui',
      tenant: 'statsabt',
      payload: {
        events: [
          { name: 'UI_PDF', dim: 'plan_print' },
          { name: 'UI_PDF', dim: 'erfunden' },
          { name: 'LOGIN', dim: 'cevidb' }, // Backend-Kennzahl: nicht aus dem Browser
          { name: 'GIBTS_NICHT' },
        ],
      },
    });
    expect(res.statusCode).toBe(204);
    await flushUsageStats(app.prisma);
    const rows = await app.prisma.usageCounter.findMany();
    expect(rows).toEqual([
      expect.objectContaining({ metric: 'UI_PDF', dim: 'plan_print', departmentId: department.id, count: 1 }),
    ]);
  });

  it('nimmt sendBeacon-Text an und zählt nichts bei «nicht verfolgen»', async () => {
    const beacon = await inject(app, {
      method: 'POST',
      url: '/api/stats/ui',
      headers: { 'content-type': 'text/plain' },
      payload: JSON.stringify({ events: [{ name: 'HELP_PAGE', dim: '/ok/fragen/' }] }),
    });
    expect(beacon.statusCode).toBe(204);
    expect(await counter('HELP_PAGE', 'ok/fragen')).toBe(1);

    const gpc = await inject(app, {
      method: 'POST',
      url: '/api/stats/ui',
      headers: { 'sec-gpc': '1' },
      payload: { events: [{ name: 'HELP_SEARCH_EMPTY' }] },
    });
    expect(gpc.statusCode).toBe(204);
    expect(await counter('HELP_SEARCH_EMPTY')).toBe(0);

    const tooMany = await inject(app, {
      method: 'POST',
      url: '/api/stats/ui',
      payload: { events: Array.from({ length: 26 }, () => ({ name: 'HELP_SEARCH_EMPTY' })) },
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it('setzt last_seen_on einmal pro Tag und zählt die Person als aktiv', async () => {
    const department = await createDepartment(app);
    const user = await createUser(app, { passwordHash: 'x', homeDepartmentId: department.id });
    const cookie = authCookie(app, user);
    for (let i = 0; i < 3; i++) {
      const res = await inject(app, { method: 'GET', url: '/api/auth/me', cookie });
      expect(res.statusCode).toBe(200);
    }
    // Das UPDATE läuft neben der Anfrage: kurz warten, bis es durch ist
    await new Promise((r) => setTimeout(r, 100));
    const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.lastSeenOn?.toISOString().slice(0, 10)).toBe(zurichDayKey(new Date()));
    await flushUsageStats(app.prisma);
    const active = await app.prisma.usageCounter.findMany({ where: { metric: 'ACTIVE_USER' } });
    expect(active).toEqual([expect.objectContaining({ departmentId: department.id, count: 1 })]);
  });

  it('zählt Logins mit Art und Fehlversuche mit Grund', async () => {
    await createUser(app, {
      email: 'stats@example.com',
      passwordHash: await bcrypt.hash('richtig-richtig', 4),
    });
    const wrong = await inject(app, {
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'stats@example.com', password: 'falsch-falsch' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(await counter('LOGIN_FAILED', 'PASSWORD_WRONG')).toBe(1);
  });

  it('hält Anfragen nur als Route-Muster fest, nie die echte URL', async () => {
    await inject(app, { method: 'GET', url: '/api/events/geheimer-anlass?zugang=TOKEN123' });
    await inject(app, { method: 'GET', url: '/health' });
    await flushUsageStats(app.prisma);
    const rows = await app.prisma.requestStat.findMany();
    expect(rows.map((r) => r.route)).toContain('/api/events/:slug');
    expect(JSON.stringify(rows)).not.toContain('geheimer-anlass');
    expect(JSON.stringify(rows)).not.toContain('TOKEN123');
    expect(rows.some((r) => r.route === '/health')).toBe(false);
  });

  it('fasst alte Stundenwerte zu Tageswerten zusammen und schreibt die Momentaufnahme nur einmal', async () => {
    const old = new Date(Date.now() - 100 * 86_400_000);
    const hour = (h: number) => new Date(Date.UTC(old.getUTCFullYear(), old.getUTCMonth(), old.getUTCDate(), h));
    for (const h of [3, 4]) {
      await app.prisma.requestStat.create({
        data: {
          granularity: 'HOUR',
          period: hour(h),
          route: '/api/events',
          method: 'GET',
          statusClass: '2xx',
          count: 2,
          totalMs: 20,
          maxMs: 15,
          buckets: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        },
      });
    }
    expect(await rollUpRequestStats(app.prisma)).toBe(2);
    const rows = await app.prisma.requestStat.findMany();
    expect(rows).toEqual([
      expect.objectContaining({ granularity: 'DAY', count: 4, totalMs: 40, maxMs: 15, buckets: [4, 0, 0, 0, 0, 0, 0, 0, 0] }),
    ]);

    await createUser(app);
    expect(await ensureDailySnapshot(app.prisma)).toBe(true);
    expect(await ensureDailySnapshot(app.prisma)).toBe(false);
    const total = await app.prisma.statsSnapshot.findFirst({ where: { key: 'users.total' } });
    expect(total?.value).toBe(1);
  });

  it('zeigt die Auswertung nur globalen Admins', async () => {
    const user = await createUser(app, { passwordHash: 'x' });
    for (const url of ['/api/admin/stats/usage', '/api/admin/stats/features', '/api/admin/stats/system']) {
      const res = await inject(app, { method: 'GET', url, cookie: authCookie(app, user) });
      expect(res.statusCode).toBe(403);
    }

    const admin = await createUser(app, { isGlobalAdmin: true, ceviDbId: 1 });
    const cookie = authCookie(app, admin);
    const usage = await inject(app, { method: 'GET', url: '/api/admin/stats/usage?days=7', cookie });
    expect(usage.statusCode).toBe(200);
    expect(usage.json().days).toHaveLength(7);
    expect(usage.headers['cache-control']).toBe('no-store');

    const features = await inject(app, { method: 'GET', url: '/api/admin/stats/features?days=30', cookie });
    expect(features.statusCode).toBe(200);
    const system = await inject(app, { method: 'GET', url: '/api/admin/stats/system?days=30', cookie });
    expect(system.statusCode).toBe(200);
    expect(system.json().database.bytes).toBeGreaterThan(0);

    const bad = await inject(app, { method: 'GET', url: '/api/admin/stats/usage?days=12', cookie });
    expect(bad.statusCode).toBe(400);
  });
});
