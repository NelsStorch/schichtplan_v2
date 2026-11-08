import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteExpiredUnverifiedAccounts } from '../src/services/unverifiedAccounts.js';
import { addMember, createDepartment, createEvent, createShift, createTestApp, createUser, hasTestDb, resetDb } from './helpers.js';

const HOUR = 60 * 60 * 1000;

describe.skipIf(!hasTestDb)('deleteExpiredUnverifiedAccounts', () => {
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

  const unverified = (extra: Parameters<typeof createUser>[1] = {}) =>
    createUser(app, { passwordHash: 'hash', emailVerified: false, ...extra });
  const token = (userId: string, expiresAt: Date) =>
    app.prisma.emailVerificationToken.create({
      data: { userId, token: `t-${userId}-${expiresAt.getTime()}`, email: 'x@example.com', expiresAt },
    });
  const exists = async (id: string) => (await app.prisma.user.count({ where: { id } })) === 1;

  it('löscht erst, wenn kein gültiger Bestätigungslink mehr offen ist', async () => {
    const user = await unverified();
    await token(user.id, new Date(Date.now() + 24 * HOUR));

    // Noch innerhalb der 24 Stunden
    expect(await deleteExpiredUnverifiedAccounts(app.prisma, undefined, new Date(Date.now() + 23 * HOUR))).toBe(0);
    expect(await exists(user.id)).toBe(true);

    // Link abgelaufen
    expect(await deleteExpiredUnverifiedAccounts(app.prisma, undefined, new Date(Date.now() + 25 * HOUR))).toBe(1);
    expect(await exists(user.id)).toBe(false);
  });

  it('ein neu angeforderter Link verlängert die Frist', async () => {
    const user = await unverified();
    await token(user.id, new Date(Date.now() + 24 * HOUR));
    await token(user.id, new Date(Date.now() + 47 * HOUR));
    expect(await deleteExpiredUnverifiedAccounts(app.prisma, undefined, new Date(Date.now() + 30 * HOUR))).toBe(0);
    expect(await exists(user.id)).toBe(true);
  });

  it('lässt bestätigte, Cevi.DB-, Cevi-Name- und Admin-Konten stehen', async () => {
    const later = new Date(Date.now() + 48 * HOUR);
    const verified = await createUser(app, { passwordHash: 'hash', emailVerified: true });
    const ceviDb = await unverified({ ceviDbId: 4711 });
    const ceviName = await createUser(app, { passwordHash: null, emailVerified: false, ceviName: 'Flitz' });
    const admin = await unverified({ isGlobalAdmin: true });

    expect(await deleteExpiredUnverifiedAccounts(app.prisma, undefined, later)).toBe(0);
    for (const u of [verified, ceviDb, ceviName, admin]) expect(await exists(u.id)).toBe(true);
  });

  it('lässt Konten mit Schichten oder Rechten stehen, löscht solche mit blosser Mitgliedschaft', async () => {
    const later = new Date(Date.now() + 48 * HOUR);
    const department = await createDepartment(app);
    const event = await createEvent(app, department.id);
    const shift = await createShift(app, event.id);

    const withSignup = await unverified();
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: withSignup.id } });
    const withRights = await unverified();
    await addMember(app, department.id, withRights.id, 'HELPER', ['PEOPLE_VIEW']);
    const plainHelper = await unverified();
    await addMember(app, department.id, plainHelper.id, 'HELPER');

    expect(await deleteExpiredUnverifiedAccounts(app.prisma, undefined, later)).toBe(1);
    expect(await exists(withSignup.id)).toBe(true);
    expect(await exists(withRights.id)).toBe(true);
    expect(await exists(plainHelper.id)).toBe(false);
  });
});
