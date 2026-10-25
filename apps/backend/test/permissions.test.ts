import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEPARTMENT_PERMISSION_KEYS } from '@schichtplan/shared';
import { syncCeviDbLeadership } from '../src/services/departmentLeaders.js';
import {
  addMember,
  authCookie,
  createDepartment,
  createEvent,
  createTestApp,
  createUser,
  hasTestDb,
  inject,
  resetDb,
} from './helpers.js';

const ALL = [...DEPARTMENT_PERMISSION_KEYS];

describe.skipIf(!hasTestDb)('Rechte in der Abteilung', () => {
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
    const department = await createDepartment(app, { slug: 'rechte' });
    const person = (name: string) =>
      createUser(app, { passwordHash: 'x', firstName: name, homeDepartmentId: department.id });
    const leader = await person('Leitung');
    const admin = await person('Admin');
    const peer = await person('Peer');
    const target = await person('Ziel');
    await addMember(app, department.id, leader.id, 'ADMIN');
    await addMember(app, department.id, admin.id, 'HELPER', ALL);
    await addMember(app, department.id, peer.id, 'HELPER', ALL);
    return { department, leader, admin, peer, target };
  }

  const patchPerson = (department: { slug: string }, actor: { id: string; email: string | null }, userId: string, payload: object) =>
    inject(app, {
      method: 'PATCH',
      url: `/api/departments/current/people/${userId}`,
      tenant: department.slug,
      cookie: authCookie(app, actor),
      payload,
    });

  const permissionsOf = async (departmentId: string, userId: string) =>
    (await app.prisma.departmentMember.findUnique({ where: { departmentId_userId: { departmentId, userId } } }))
      ?.permissions ?? [];

  it('Administration vergibt weniger Rechte, aber nicht an Gleichgestellte, die Leitung oder sich selbst', async () => {
    const { department, leader, admin, peer, target } = await setup();

    const granted = await patchPerson(department, admin, target.id, { permissions: ['EVENTS_CREATE'] });
    expect(granted.statusCode).toBe(200);
    expect(await permissionsOf(department.id, target.id)).toEqual(['EVENTS_VIEW_ALL', 'EVENTS_CREATE']);
    const audit = await app.prisma.departmentAuditLog.findFirstOrThrow({ where: { targetUserId: target.id } });
    expect(audit).toMatchObject({ action: 'PERMISSIONS_SET', actorId: admin.id });

    expect((await patchPerson(department, admin, target.id, { permissions: ALL })).statusCode).toBe(403);
    expect((await patchPerson(department, admin, peer.id, { permissions: [] })).statusCode).toBe(403);
    expect((await patchPerson(department, admin, leader.id, { permissions: [] })).statusCode).toBe(403);
    expect((await patchPerson(department, admin, admin.id, { permissions: [] })).statusCode).toBe(403);

    // Die Abteilungsleitung darf alles, ausser die Abteilungsleitung selbst ändern
    expect((await patchPerson(department, leader, peer.id, { permissions: [] })).statusCode).toBe(200);
    expect(await permissionsOf(department.id, peer.id)).toEqual([]);
    expect((await patchPerson(department, leader, leader.id, { permissions: ['EVENTS_CREATE'] })).statusCode).toBe(400);
  });

  it('gibt Cevi-Name-Profilen keine Rechte', async () => {
    const { department, leader } = await setup();
    const profile = await createUser(app, { email: null, ceviName: 'Fuchs', homeDepartmentId: department.id });
    const res = await patchPerson(department, leader, profile.id, { permissions: ['EVENTS_CREATE'] });
    expect(res.statusCode).toBe(400);
  });

  it('zeigt Personen nur mit «Personen sehen», das Protokoll nur mit «Personen und Rechte verwalten»', async () => {
    const { department, target } = await setup();
    const viewer = await createUser(app, { passwordHash: 'x' });
    await addMember(app, department.id, viewer.id, 'HELPER', ['PEOPLE_VIEW']);
    const get = (actor: { id: string; email: string | null }, url: string) =>
      inject(app, { method: 'GET', url, tenant: department.slug, cookie: authCookie(app, actor) });

    const list = await get(viewer, '/api/departments/current/people');
    expect(list.statusCode).toBe(200);
    expect(list.json().every((p: { canEdit: boolean }) => !p.canEdit)).toBe(true);
    expect((await get(viewer, '/api/departments/current/audit')).statusCode).toBe(403);
    expect((await get(target, '/api/departments/current/people')).statusCode).toBe(403);
  });

  it('prüft Anlass-Rechte einzeln: bearbeiten, nur sehen, löschen', async () => {
    const { department } = await setup();
    const event = await createEvent(app, department.id, { slug: 'chilbi' });
    const editor = await createUser(app, { passwordHash: 'x' });
    const viewer = await createUser(app, { passwordHash: 'x' });
    const deleter = await createUser(app, { passwordHash: 'x' });
    await addMember(app, department.id, editor.id, 'HELPER', ['EVENTS_VIEW_ALL', 'EVENTS_EDIT_SETTINGS']);
    await addMember(app, department.id, viewer.id, 'HELPER', ['EVENTS_VIEW_ALL']);
    await addMember(app, department.id, deleter.id, 'HELPER', ['EVENTS_VIEW_ALL', 'EVENTS_DELETE']);

    const patch = (actor: { id: string; email: string | null }) =>
      inject(app, {
        method: 'PATCH',
        url: `/api/events/${event.slug}`,
        tenant: department.slug,
        cookie: authCookie(app, actor),
        payload: { title: 'Chilbi neu' },
      });
    expect((await patch(editor)).statusCode).toBe(200);
    expect((await patch(viewer)).statusCode).toBe(403);

    const detail = await inject(app, {
      method: 'GET',
      url: `/api/events/${event.slug}`,
      tenant: department.slug,
      cookie: authCookie(app, viewer),
    });
    expect(detail.json().viewer.access).toMatchObject({ isManager: true, capabilities: ['VIEW'] });

    const del = (actor: { id: string; email: string | null }) =>
      inject(app, {
        method: 'DELETE',
        url: `/api/events/${event.slug}`,
        tenant: department.slug,
        cookie: authCookie(app, actor),
        payload: { confirm: event.slug },
      });
    expect((await del(editor)).statusCode).toBe(403);
    expect((await del(deleter)).statusCode).toBe(200);
  });

  it('erlaubt Anlässe erstellen nur mit dem Recht', async () => {
    const { department, target } = await setup();
    const create = (actor: { id: string; email: string | null }) =>
      inject(app, {
        method: 'POST',
        url: '/api/events',
        tenant: department.slug,
        cookie: authCookie(app, actor),
        payload: { title: 'Sola', slug: 'sola', startDate: '2030-07-01T10:00:00.000Z', endDate: '2030-07-01T10:00:00.000Z' },
      });
    expect((await create(target)).statusCode).toBe(403);
    await app.prisma.departmentMember.create({
      data: { departmentId: department.id, userId: target.id, permissions: ['EVENTS_VIEW_ALL', 'EVENTS_CREATE'] },
    });
    expect((await create(target)).statusCode).toBe(200);
    // Wer erstellt, kommt nicht automatisch ins OK
    expect(await app.prisma.eventOrganizer.count()).toBe(0);
  });

  it('nimmt als Kontaktperson nur Abteilungsleitung oder «Personen und Rechte verwalten»', async () => {
    const { department, leader, admin, target } = await setup();
    const patch = (contactUserId: string) =>
      inject(app, {
        method: 'PATCH',
        url: '/api/departments/current',
        tenant: department.slug,
        cookie: authCookie(app, leader),
        payload: { contactUserId },
      });
    expect((await patch(target.id)).statusCode).toBe(400);
    expect((await patch(admin.id)).statusCode).toBe(200);

    const anonymous = await inject(app, { method: 'GET', url: '/api/departments/current', tenant: department.slug });
    expect(anonymous.json().contactPerson).toMatchObject({ email: null });
    expect(anonymous.json().contactPerson.displayName).toContain('Admin');
  });

  it('Cevi.DB entzieht die Abteilungsleitung, aber nie die letzte und nie eine von Hand gesetzte', async () => {
    const department = await createDepartment(app);
    const a = await createUser(app, { ceviDbId: 1, homeDepartmentId: department.id });
    const b = await createUser(app, { ceviDbId: 2, homeDepartmentId: department.id });
    const manual = await createUser(app, { passwordHash: 'x' });
    await app.prisma.departmentMember.createMany({
      data: [
        { departmentId: department.id, userId: a.id, role: 'ADMIN', leaderSource: 'CEVIDB' },
        { departmentId: department.id, userId: b.id, role: 'ADMIN', leaderSource: 'CEVIDB' },
      ],
    });
    const roleOf = async (userId: string) =>
      (await app.prisma.departmentMember.findFirstOrThrow({ where: { departmentId: department.id, userId } })).role;

    await syncCeviDbLeadership(app.prisma, app.log, a.id, department.id, false);
    expect(await roleOf(a.id)).toBe('HELPER');
    // b ist jetzt die letzte Abteilungsleitung und bleibt
    await syncCeviDbLeadership(app.prisma, app.log, b.id, department.id, false);
    expect(await roleOf(b.id)).toBe('ADMIN');

    // Mit einer von Hand gesetzten Leitung daneben fällt b weg, die von Hand gesetzte bleibt
    await app.prisma.departmentMember.create({
      data: { departmentId: department.id, userId: manual.id, role: 'ADMIN', leaderSource: 'MANUAL' },
    });
    await syncCeviDbLeadership(app.prisma, app.log, b.id, department.id, false);
    expect(await roleOf(b.id)).toBe('HELPER');
    expect(await roleOf(manual.id)).toBe('ADMIN');

    // Wieder Leitungsrolle in Cevi.DB: wird erneut Abteilungsleitung
    await syncCeviDbLeadership(app.prisma, app.log, a.id, department.id, true);
    expect(await roleOf(a.id)).toBe('ADMIN');
    expect(await app.prisma.departmentAuditLog.count({ where: { departmentId: department.id } })).toBe(3);
  });
});
