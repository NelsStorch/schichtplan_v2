import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEPARTMENT_PERMISSION_KEYS } from '@schichtplan/shared';
import {
  addMember,
  authCookie,
  createDepartment,
  createTestApp,
  createUser,
  hasTestDb,
  inject,
  resetDb,
} from './helpers.js';

const ALL = [...DEPARTMENT_PERMISSION_KEYS];

describe.skipIf(!hasTestDb)('Vereins-Schichtplan: Erstellung und Verwaltung von Vereinsleitungen', () => {
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

  it('erlaubt das Anlegen eines Vereins mit E-Mail/Passwort ohne Hitobito-Gruppe', async () => {
    const user = await createUser(app, {
      email: 'leiter@turnverein.ch',
      passwordHash: '$2a$10$hashed',
      emailVerified: true,
      provider: 'OTHER',
      firstName: 'Max',
      lastName: 'Muster',
    });

    const res = await inject(app, {
      method: 'POST',
      url: '/api/departments/cevidb',
      headers: { host: 'vereins-schichtplan.ch' },
      cookie: authCookie(app, user),
      payload: {
        departmentName: 'Turnverein Muster',
        slug: 'tv-muster',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.department).toMatchObject({
      name: 'Turnverein Muster',
      slug: 'tv-muster',
    });

    const created = await app.prisma.department.findUniqueOrThrow({
      where: { organization_slug: { organization: 'OTHER', slug: 'tv-muster' } },
      include: { members: true },
    });
    expect(created.hitobitoGroupId).toBeNull();
    expect(created.organization).toBe('OTHER');
    expect(created.members).toHaveLength(1);
    expect(created.members[0]).toMatchObject({
      userId: user.id,
      role: 'ADMIN',
      leaderSource: 'MANUAL',
    });
  });

  it('erlaubt Vereinsleitung das Ernennen und Entziehen von weiteren Vereinsleitungen', async () => {
    const department = await app.prisma.department.create({
      data: {
        slug: 'sportverein',
        name: 'Sportverein',
        organization: 'OTHER',
      },
    });

    const leader = await createUser(app, {
      email: 'praesident@sportverein.ch',
      passwordHash: 'hash',
      emailVerified: true,
      firstName: 'Präsident',
      homeDepartmentId: department.id,
    });
    const helper = await createUser(app, {
      email: 'vorstand@sportverein.ch',
      passwordHash: 'hash',
      emailVerified: true,
      firstName: 'Vorstand',
      homeDepartmentId: department.id,
    });

    await addMember(app, department.id, leader.id, 'ADMIN');
    await addMember(app, department.id, helper.id, 'HELPER');

    // 1. Helfer zur Vereinsleitung ernennen
    const promoteRes = await inject(app, {
      method: 'PATCH',
      url: `/api/departments/current/people/${helper.id}`,
      tenant: department.slug,
      headers: { host: `sportverein.vereins-schichtplan.ch` },
      cookie: authCookie(app, leader),
      payload: { role: 'ADMIN' },
    });
    expect(promoteRes.statusCode).toBe(200);

    const helperMember = await app.prisma.departmentMember.findUniqueOrThrow({
      where: { departmentId_userId: { departmentId: department.id, userId: helper.id } },
    });
    expect(helperMember.role).toBe('ADMIN');
    expect(helperMember.leaderSource).toBe('MANUAL');

    // 2. Leitungsstatus wieder entziehen
    const demoteRes = await inject(app, {
      method: 'PATCH',
      url: `/api/departments/current/people/${helper.id}`,
      tenant: department.slug,
      headers: { host: `sportverein.vereins-schichtplan.ch` },
      cookie: authCookie(app, leader),
      payload: { role: 'HELPER', permissions: ['EVENTS_CREATE'] },
    });
    expect(demoteRes.statusCode).toBe(200);

    const demotedMember = await app.prisma.departmentMember.findUniqueOrThrow({
      where: { departmentId_userId: { departmentId: department.id, userId: helper.id } },
    });
    expect(demotedMember.role).toBe('HELPER');
    expect(demotedMember.leaderSource).toBeNull();
    expect(demotedMember.permissions).toContain('EVENTS_CREATE');

    // 3. Letzte Leitung darf sich nicht selbst den Status entziehen
    const demoteLastRes = await inject(app, {
      method: 'PATCH',
      url: `/api/departments/current/people/${leader.id}`,
      tenant: department.slug,
      headers: { host: `sportverein.vereins-schichtplan.ch` },
      cookie: authCookie(app, leader),
      payload: { role: 'HELPER' },
    });
    expect(demoteLastRes.statusCode).toBe(400);
    expect(demoteLastRes.json().error).toContain('Mindestens eine Vereinsleitung muss in der Abteilung verbleiben');
  });

  it('verbietet Rollenänderungen über diesen Endpunkt für Cevi-Abteilungen', async () => {
    const department = await createDepartment(app, { slug: 'cevi-abt' });
    const leader = await createUser(app, { firstName: 'Leiter', homeDepartmentId: department.id });
    const member = await createUser(app, { firstName: 'Mitglied', homeDepartmentId: department.id });

    await addMember(app, department.id, leader.id, 'ADMIN');
    await addMember(app, department.id, member.id, 'HELPER');

    const res = await inject(app, {
      method: 'PATCH',
      url: `/api/departments/current/people/${member.id}`,
      tenant: department.slug,
      headers: { host: `cevi-abt.cevi-schichtplan.ch` },
      cookie: authCookie(app, leader),
      payload: { role: 'ADMIN' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Die Abteilungsleitung hat alle Rechte');
  });
});
