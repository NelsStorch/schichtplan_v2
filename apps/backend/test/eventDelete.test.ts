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

describe.skipIf(!hasTestDb)('Anlass löschen durch die Abteilungsleitung', () => {
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
    const department = await createDepartment(app, { slug: 'loeschtest' });
    const okLead = await createUser(app, { passwordHash: 'x' });
    const event = await createEvent(app, department.id, { slug: 'chilbi', organizerId: okLead.id });
    const shift = await createShift(app, event.id);
    await app.prisma.shiftSignup.create({ data: { shiftId: shift.id, userId: okLead.id } });
    return { department, okLead, event };
  }

  const del = (cookie: string, confirm?: string) =>
    inject(app, {
      method: 'DELETE',
      url: '/api/events/chilbi',
      tenant: 'loeschtest',
      cookie,
      payload: confirm === undefined ? undefined : { confirm },
    });

  it('lässt OK-Leitung und Planung nicht löschen', async () => {
    const { department, okLead } = await setup();
    expect((await del(authCookie(app, okLead), 'chilbi')).statusCode).toBe(403);

    const planner = await createUser(app, { passwordHash: 'x' });
    await addMember(app, department.id, planner.id, 'PLANNER');
    expect((await del(authCookie(app, planner), 'chilbi')).statusCode).toBe(403);
    expect(await app.prisma.event.count()).toBe(1);
  });

  it('verlangt das Kürzel als Bestätigung', async () => {
    const { department } = await setup();
    const leader = await createUser(app, { passwordHash: 'x' });
    await addMember(app, department.id, leader.id, 'ADMIN');
    expect((await del(authCookie(app, leader))).statusCode).toBe(400);
    expect((await del(authCookie(app, leader), 'falsch')).statusCode).toBe(400);
    expect(await app.prisma.event.count()).toBe(1);
  });

  it('löscht den Anlass mit Schichten und Eintragungen', async () => {
    const { department } = await setup();
    const leader = await createUser(app, { passwordHash: 'x' });
    await addMember(app, department.id, leader.id, 'ADMIN');
    const res = await del(authCookie(app, leader), 'chilbi');
    expect(res.statusCode).toBe(200);
    expect(await app.prisma.event.count()).toBe(0);
    expect(await app.prisma.shift.count()).toBe(0);
    expect(await app.prisma.shiftSignup.count()).toBe(0);
  });

  it('löscht keine Anlässe anderer Abteilungen', async () => {
    await setup();
    const other = await createDepartment(app, { slug: 'andere' });
    const leader = await createUser(app, { passwordHash: 'x' });
    await addMember(app, other.id, leader.id, 'ADMIN');
    const res = await inject(app, {
      method: 'DELETE',
      url: '/api/events/chilbi',
      tenant: 'andere',
      cookie: authCookie(app, leader),
      payload: { confirm: 'chilbi' },
    });
    expect(res.statusCode).toBe(404);
    // Auch über die Subdomain der fremden Abteilung nicht
    expect((await del(authCookie(app, leader), 'chilbi')).statusCode).toBe(403);
    expect(await app.prisma.event.count()).toBe(1);
  });
});
