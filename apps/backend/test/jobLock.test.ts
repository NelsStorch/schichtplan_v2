import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runExclusive } from '../src/services/jobLock.js';
import { createTestApp, hasTestDb } from './helpers.js';

describe.skipIf(!hasTestDb)('Job-Sperre zwischen Backend-Prozessen', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('lässt einen Job nicht doppelt laufen, andere Jobs aber schon', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const first = runExclusive(app.prisma, 'test-job', async () => {
      await gate;
      return 'fertig';
    });
    await new Promise((r) => setTimeout(r, 300)); // erste Sperre sicher gesetzt

    const second = await runExclusive(app.prisma, 'test-job', async () => 'doppelt');
    const other = await runExclusive(app.prisma, 'anderer-job', async () => 'andere');
    expect(second).toEqual({ ran: false });
    expect(other).toEqual({ ran: true, value: 'andere' });

    release();
    expect(await first).toEqual({ ran: true, value: 'fertig' });
    // Danach ist die Sperre wieder frei
    expect(await runExclusive(app.prisma, 'test-job', async () => 'wieder')).toEqual({ ran: true, value: 'wieder' });
  });

  it('gibt die Sperre auch bei einem Fehler im Job frei', async () => {
    await expect(
      runExclusive(app.prisma, 'fehler-job', async () => {
        throw new Error('kaputt');
      })
    ).rejects.toThrow('kaputt');
    expect(await runExclusive(app.prisma, 'fehler-job', async () => 'ok')).toEqual({ ran: true, value: 'ok' });
  });
});
