/**
 * Cevi.DB-Login bis in die Datenbank: Abteilung und Leitung kommen aus Rollen und Gruppenstruktur.
 * Die Cevi.DB ist hier ein Stub von fetch mit Daten wie auf db.cevi.ch (Ortsgruppe 161 mit zwei Jungscharen).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDepartment, createTestApp, createUser, hasTestDb, inject, resetDb } from './helpers.js';

const groupJson = (id: number, name: string, type: string, hierarchy: [number, string][], children: [number, string][] = []) => ({
  groups: [
    {
      id: String(id),
      group_type: type,
      name,
      links: { hierarchies: hierarchy.map(([g]) => String(g)), children: children.map(([g]) => String(g)) },
    },
  ],
  linked: {
    groups: [...hierarchy, ...children].map(([g, t]) => ({ id: String(g), name: `Gruppe ${g}`, group_type: t })),
  },
});

const chain = (ortsgruppe: number, jungschar?: number): [number, string][] => [
  [1, 'Dachverband'],
  [ortsgruppe, 'Ortsgruppe'],
  ...(jungschar ? ([[jungschar, 'Jungschar']] as [number, string][]) : []),
];

const cevidbGroups: Record<number, unknown> = {
  161: groupJson(161, 'Illnau-Effretikon', 'Ortsgruppe', chain(161), [
    [295, 'Jungschar'],
    [726, 'Jungschar'],
    [163, 'Verein'],
  ]),
  295: groupJson(295, 'JS Illnau', 'Jungschar', chain(161, 295)),
  726: groupJson(726, 'JS Effretikon', 'Jungschar', chain(161, 726)),
  805: groupJson(805, 'Hiskia', 'Stufe', [...chain(161, 295), [805, 'Stufe']]),
  806: groupJson(806, 'Joschija', 'Stufe', [...chain(161, 295), [806, 'Stufe']]),
  910: groupJson(910, 'Effi-Stufe', 'Stufe', [...chain(161, 726), [910, 'Stufe']]),
  219: groupJson(219, 'Weiningen-Geroldswil', 'Ortsgruppe', chain(219), [[800, 'Jungschar']]),
  800: groupJson(800, 'JS Weiningen', 'Jungschar', chain(219, 800)),
  817: groupJson(817, 'Sirius', 'Stufe', [...chain(219, 800), [817, 'Stufe']]),
  3000: groupJson(3000, 'Neu', 'Ortsgruppe', chain(3000), [[3001, 'Jungschar']]),
  3001: groupJson(3001, 'JS Neu', 'Jungschar', chain(3000, 3001)),
};

type Role = { role_class: string; group_id: number; group_name?: string; role_name?: string };
const person = (id: number, ortsgruppeId: number | null, primaryGroupId: number | null, roles: Role[]) => ({
  id,
  email: `p${id}@example.com`,
  first_name: 'Test',
  last_name: `Person${id}`,
  nickname: `Name${id}`,
  ortsgruppe_id: ortsgruppeId,
  primary_group_id: primaryGroupId,
  roles: roles.map((r) => ({ group_name: `Gruppe ${r.group_id}`, role_name: 'Rolle', ...r })),
});

const leader = (group_id: number): Role => ({ role_class: 'Group::Jungschar::Abteilungsleiter', group_id });
const stufe = (group_id: number): Role => ({ role_class: 'Group::Stufe::Gruppenleiter', group_id });

describe.skipIf(!hasTestDb)('Cevi.DB: Abteilung aus Rollen und Gruppenstruktur', () => {
  let app: FastifyInstance;
  let groupsAvailable = true;
  let grantedScope = 'email name with_roles groups';

  /** Vollständiger Login über den Callback; gibt das Weiterleitungsziel zurück */
  async function login(profile: ReturnType<typeof person>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.endsWith('/oauth/token')) {
          return new Response(JSON.stringify({ access_token: 'token', token_type: 'Bearer', scope: grantedScope }));
        }
        if (url.endsWith('/oauth/profile')) return new Response(JSON.stringify(profile));
        if (url.endsWith('/oauth/userinfo')) return new Response('{}', { status: 404 });
        const id = Number(/groups\/(\d+)\.json/.exec(url)?.[1]);
        if (groupsAvailable && cevidbGroups[id]) return new Response(JSON.stringify(cevidbGroups[id]));
        return new Response('{}', { status: 403 });
      })
    );
    const state = Buffer.from(JSON.stringify({ token: 'x', returnTo: null, tenantSlug: null })).toString('base64url');
    const res = await inject(app, {
      method: 'GET',
      url: `/api/auth/cevidb/callback?code=abc&state=${state}`,
      cookie: `cevidb_oauth_state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { ceviDbId: profile.id },
      include: { memberships: true },
    });
    const auth = res.cookies.find((c) => c.name === 'token');
    return { user, location: String(res.headers.location), cookie: `token=${auth?.value}` };
  }

  const role = (user: { memberships: { departmentId: string; role: string }[] }, departmentId: string) =>
    user.memberships.find((m) => m.departmentId === departmentId)?.role ?? null;

  const department = (slug: string, ceviDbGroupId: number) =>
    createDepartment(app, { slug }).then((d) =>
      app.prisma.department.update({ where: { id: d.id }, data: { ceviDbGroupId } })
    );

  beforeAll(async () => {
    process.env.CEVIDB_CLIENT_ID = 'test-client';
    process.env.CEVIDB_CLIENT_SECRET = 'test-secret';
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
    groupsAvailable = true;
    grantedScope = 'email name with_roles groups';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('verlangt beim Login den Scope groups', async () => {
    const res = await inject(app, { method: 'GET', url: '/api/auth/cevidb/login' });
    expect(new URL(String(res.headers.location)).searchParams.get('scope')).toBe('email name with_roles groups');
  });

  it('ordnet Personen ihrer Jungschar zu, Leitung nur dort', async () => {
    const illnau = await department('illnau', 295);
    const effretikon = await department('effretikon', 726);

    const inferno = await login(
      person(12211, 161, 805, [
        { role_class: 'Group::Ortsgruppe::AdministratorCeviDB', group_id: 161 },
        leader(295),
        { role_class: 'Group::Jungschar::FreierMitarbeiter', group_id: 726 },
        stufe(805),
      ])
    );
    expect(inferno.user).toMatchObject({
      homeDepartmentId: illnau.id,
      homeDepartmentSource: 'CEVIDB',
      ceviDbOrtsgruppeId: 161,
      ceviDbLeaderGroupIds: [295],
    });
    expect(role(inferno.user, illnau.id)).toBe('ADMIN');
    expect(role(inferno.user, effretikon.id)).toBe('HELPER');

    const leiterin = await login(person(16206, 161, 806, [stufe(806)]));
    expect(leiterin.user.homeDepartmentId).toBe(illnau.id);
    expect(role(leiterin.user, illnau.id)).toBe('HELPER');
    expect(role(leiterin.user, effretikon.id)).toBeNull();

    const effi = await login(person(5, 161, 726, [leader(726)]));
    expect(effi.user.homeDepartmentId).toBe(effretikon.id);
    expect(role(effi.user, effretikon.id)).toBe('ADMIN');
    expect(role(effi.user, illnau.id)).toBeNull();
  });

  it('lässt eine Abteilung auf Ebene der Ortsgruppe wie bisher arbeiten', async () => {
    const weiningen = await department('weiningen', 219);
    const leitung = await login(person(7, 219, 800, [leader(800)]));
    expect(leitung.user).toMatchObject({ homeDepartmentId: weiningen.id, homeDepartmentSource: 'CEVIDB' });
    expect(role(leitung.user, weiningen.id)).toBe('ADMIN');
    const leiterin = await login(person(8, 219, 817, [stufe(817)]));
    expect(leiterin.user.homeDepartmentId).toBe(weiningen.id);
    expect(role(leiterin.user, weiningen.id)).toBe('HELPER');
  });

  it('gibt für eine selbst geänderte ortsgruppe_id keine Leitung', async () => {
    const weiningen = await department('weiningen', 219);
    const { user } = await login(person(9, 219, 295, [leader(295)]));
    expect(user.homeDepartmentId).toBeNull();
    expect(role(user, weiningen.id)).toBeNull();
  });

  it('zählt ohne Scope groups die ortsgruppe_id nur als eigene Angabe', async () => {
    grantedScope = 'email name with_roles';
    const weiningen = await department('weiningen', 219);
    const { user } = await login(person(9, 219, 295, [leader(295)]));
    expect(user).toMatchObject({ homeDepartmentId: weiningen.id, homeDepartmentSource: 'SELF' });
    expect(role(user, weiningen.id)).toBe('HELPER');
  });

  it('lässt bei einem Ausfall der Gruppen-API Abteilung und Leitung unangetastet', async () => {
    const illnau = await department('illnau', 295);
    const profile = person(11, 161, 295, [leader(295)]);
    await login(profile);

    await app.prisma.ceviDbGroup.deleteMany();
    groupsAvailable = false;
    const { user } = await login(profile);
    expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'CEVIDB' });
    expect(role(user, illnau.id)).toBe('ADMIN');
  });

  it('entzieht die Leitung, wenn die Rolle in eine andere Jungschar wechselt', async () => {
    const illnau = await department('illnau', 295);
    const effretikon = await department('effretikon', 726);
    await login(person(21, 161, 295, [leader(295)]));
    // Eine zweite Leitung, damit es nicht die letzte ist
    await login(person(22, 161, 295, [leader(295)]));
    const { user } = await login(person(21, 161, 726, [leader(726)]));
    expect(user.homeDepartmentId).toBe(effretikon.id);
    expect(role(user, effretikon.id)).toBe('ADMIN');
    expect(role(user, illnau.id)).toBe('HELPER');
  });

  it('fragt nach einem Wechsel in eine Jungschar ohne Abteilung gleich neu nach', async () => {
    const shared = await department('gemeinsam', 161);
    const profile = person(31, 161, 910, [stufe(910)]);
    expect((await login(profile)).user.homeDepartmentId).toBe(shared.id);

    await app.prisma.department.update({ where: { id: shared.id }, data: { ceviDbGroupId: 295 } });
    const { user, location } = await login(profile);
    expect(user).toMatchObject({ homeDepartmentId: null, homeDepartmentSource: null, departmentSetupAt: null });
    expect(location).toContain('/abteilung');
  });

  it('legt nur Stufen der eigenen Jungschar an', async () => {
    const illnau = await department('illnau', 295);
    await login(person(41, 161, 806, [stufe(806)]));
    // Effretikon-Person, die in Illnau Mitglied ist: Ihre Stufe gehört nicht nach Illnau
    const effi = await login(person(42, 161, 910, [stufe(910)]));
    await app.prisma.departmentMember.create({ data: { departmentId: illnau.id, userId: effi.user.id, role: 'HELPER' } });
    await login(person(41, 161, 806, [stufe(806)]));
    const stufen = await app.prisma.departmentStufe.findMany({ where: { departmentId: illnau.id } });
    expect(stufen.map((s) => s.ceviDbGroupId)).toEqual([806]);
  });

  it('bindet eine neue Abteilung bei mehreren Jungscharen an die Jungschar', async () => {
    const illnau = await department('illnau', 295);
    await login(person(51, 161, 910, [stufe(910)]));
    const { cookie, location } = await login(person(52, 161, 726, [leader(726)]));
    expect(location).toContain('/abteilung-erstellen');

    const eligibility = await inject(app, { method: 'GET', url: '/api/departments/creation-eligibility', cookie });
    expect(eligibility.json()).toMatchObject({ eligible: true, ortsgruppeId: 726, ortsgruppeName: 'Effretikon' });

    const created = await inject(app, {
      method: 'POST',
      url: '/api/departments/cevidb',
      cookie,
      payload: { departmentName: 'Cevi Effretikon', slug: 'effretikon' },
    });
    expect(created.statusCode).toBe(201);
    const effretikon = await app.prisma.department.findUniqueOrThrow({ where: { slug: 'effretikon' } });
    expect(effretikon.ceviDbGroupId).toBe(726);

    const member = await app.prisma.user.findUniqueOrThrow({ where: { ceviDbId: 51 }, include: { memberships: true } });
    expect(member).toMatchObject({ homeDepartmentId: effretikon.id, homeDepartmentSource: 'CEVIDB' });
    const founder = await app.prisma.user.findUniqueOrThrow({ where: { ceviDbId: 52 }, include: { memberships: true } });
    expect(role(founder, effretikon.id)).toBe('ADMIN');
    expect(role(founder, illnau.id)).toBeNull();
  });

  it('bindet eine neue Abteilung sonst an die Ortsgruppe', async () => {
    const { cookie } = await login(person(61, 3000, 3001, [leader(3001)]));
    const eligibility = await inject(app, { method: 'GET', url: '/api/departments/creation-eligibility', cookie });
    expect(eligibility.json()).toMatchObject({ eligible: true, ortsgruppeId: 3000, ortsgruppeName: 'Neu' });
  });

  it('meldet bestehende Abteilungen und fehlende Prüfung', async () => {
    await department('weiningen', 219);
    const { cookie } = await login(person(71, 219, 800, [leader(800)]));
    const exists = await inject(app, { method: 'GET', url: '/api/departments/creation-eligibility', cookie });
    expect(exists.json()).toMatchObject({ eligible: false, reason: 'EXISTS' });

    await app.prisma.ceviDbGroup.deleteMany();
    const unverified = await inject(app, { method: 'GET', url: '/api/departments/creation-eligibility', cookie });
    expect(unverified.json()).toMatchObject({ eligible: false, reason: 'UNVERIFIED' });
  });

  it('gibt beim Verknüpfen im Admin-Portal die Leitung nur über die eigene Rolle', async () => {
    const admin = await createUser(app, { isGlobalAdmin: true, ceviDbId: 1 });
    const token = app.jwt.sign({ id: admin.id, email: admin.email ?? 'a@b.ch', isGlobalAdmin: true, amr: 'cevidb' });
    const adminCookie = `token=${token}`;
    const leitungIllnau = await login(person(81, 161, 295, [leader(295)]));
    const leitungEffi = await login(person(82, 161, 726, [leader(726)]));

    const target = await createDepartment(app, { slug: 'illnau' });
    const res = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/departments/${target.id}`,
      cookie: adminCookie,
      headers: { host: 'admin.localhost', 'sec-fetch-site': 'same-origin' },
      payload: { ceviDbGroupId: 295 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().attached).toBe(1);

    const first = await app.prisma.user.findUniqueOrThrow({ where: { id: leitungIllnau.user.id }, include: { memberships: true } });
    const second = await app.prisma.user.findUniqueOrThrow({ where: { id: leitungEffi.user.id }, include: { memberships: true } });
    expect(role(first, target.id)).toBe('ADMIN');
    expect(role(second, target.id)).toBeNull();
  });
});
