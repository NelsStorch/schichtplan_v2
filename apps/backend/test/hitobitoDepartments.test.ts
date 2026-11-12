/**
 * Cevi.DB-Login bis in die Datenbank: Abteilung und Leitung kommen aus Rollen und Gruppenstruktur.
 * Die Cevi.DB ist hier ein Stub von fetch mit Daten wie auf db.cevi.ch (Ortsgruppe 161 mit zwei Jungscharen).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
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
  163: groupJson(163, 'Verein Illnau-Effretikon', 'Verein', [...chain(161), [163, 'Verein']]),
  250: groupJson(250, 'Verein Weiningen-Geroldswil', 'Verein', [...chain(219), [250, 'Verein']]),
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
  let blockedGroups = new Set<number>();
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Cevi.DB-Callback mit gestubbter Cevi.DB */
  async function callback(profile: { id: number } & Record<string, unknown>) {
    fetchMock = vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'token', token_type: 'Bearer', scope: grantedScope }));
      }
      if (url.endsWith('/oauth/profile')) return new Response(JSON.stringify(profile));
      if (url.endsWith('/oauth/userinfo')) return new Response('{}', { status: 404 });
      const id = Number(/groups\/(\d+)\.json/.exec(url)?.[1]);
      if (groupsAvailable && !blockedGroups.has(id) && cevidbGroups[id]) {
        return new Response(JSON.stringify(cevidbGroups[id]));
      }
      return new Response('{}', { status: 403 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const state = Buffer.from(JSON.stringify({ token: 'x', returnTo: null, tenantSlug: null })).toString('base64url');
    const res = await inject(app, {
      method: 'GET',
      url: `/api/auth/cevidb/callback?code=abc&state=${state}`,
      cookie: `cevidb_oauth_state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    return res;
  }

  /** Vollständiger Login; gibt Konto, Weiterleitungsziel und Sitzungs-Cookie zurück */
  async function login(profile: { id: number } & Record<string, unknown>) {
    const res = await callback(profile);
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: 'CEVI', providerId: String(profile.id) } },
      include: { memberships: true },
    });
    const auth = res.cookies.find((c) => c.name === 'token');
    return { user, location: String(res.headers.location), cookie: `token=${auth?.value}` };
  }

  const role = (user: { memberships: { departmentId: string; role: string }[] }, departmentId: string) =>
    user.memberships.find((m) => m.departmentId === departmentId)?.role ?? null;

  const department = (slug: string, ceviDbGroupId: number) =>
    createDepartment(app, { slug }).then((d) =>
      app.prisma.department.update({ where: { id: d.id }, data: { hitobitoGroupId: ceviDbGroupId } })
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
    blockedGroups = new Set();
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
      ortsgruppeId: 161,
      leaderGroupIds: [295],
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

    await app.prisma.hitobitoGroup.deleteMany();
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

    await app.prisma.department.update({ where: { id: shared.id }, data: { hitobitoGroupId: 295 } });
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
    expect(stufen.map((s) => s.hitobitoGroupId)).toEqual([806]);
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
    const effretikon = await app.prisma.department.findUniqueOrThrow({
      where: { organization_slug: { organization: 'CEVI', slug: 'effretikon' } },
    });
    expect(effretikon.hitobitoGroupId).toBe(726);

    const member = await app.prisma.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: 'CEVI', providerId: '51' } },
      include: { memberships: true },
    });
    expect(member).toMatchObject({ homeDepartmentId: effretikon.id, homeDepartmentSource: 'CEVIDB' });
    const founder = await app.prisma.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: 'CEVI', providerId: '52' } },
      include: { memberships: true },
    });
    expect(role(founder, effretikon.id)).toBe('ADMIN');
    expect(role(founder, illnau.id)).toBeNull();
  });

  it('verschiebt beim Anlegen niemanden, der noch in einer anderen Jungschar Rollen hat', async () => {
    const illnau = await department('illnau', 295);
    const beide = person(12211, 161, 805, [
      leader(295),
      { role_class: 'Group::Jungschar::FreierMitarbeiter', group_id: 726 },
      stufe(805),
    ]);
    await login(beide);
    const nurEffi = await login(person(53, 161, 910, [stufe(910)]));
    expect(nurEffi.user.homeDepartmentId).toBeNull();

    const { cookie } = await login(person(50783, 161, 726, [leader(726)]));
    const created = await inject(app, {
      method: 'POST',
      url: '/api/departments/cevidb',
      cookie,
      payload: { departmentName: 'Cevi Effretikon', slug: 'effretikon' },
    });
    expect(created.statusCode).toBe(201);
    const effretikon = await app.prisma.department.findUniqueOrThrow({
      where: { organization_slug: { organization: 'CEVI', slug: 'effretikon' } },
    });

    const stayed = await app.prisma.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: 'CEVI', providerId: '12211' } },
      include: { memberships: true },
    });
    expect(stayed.homeDepartmentId).toBe(illnau.id);
    expect(role(stayed, illnau.id)).toBe('ADMIN');
    expect(role(stayed, effretikon.id)).toBe('HELPER');

    const moved = await app.prisma.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: 'CEVI', providerId: '53' } },
    });
    expect(moved.homeDepartmentId).toBe(effretikon.id);

    // Der nächste Login ändert daran nichts
    const again = await login(beide);
    expect(again.user.homeDepartmentId).toBe(illnau.id);
    expect(role(again.user, illnau.id)).toBe('ADMIN');
    expect(role(again.user, effretikon.id)).toBe('HELPER');
  });

  it('fragt Personen ohne Jungschar in einer geteilten Ortsgruppe nach ihrer Abteilung', async () => {
    const illnau = await department('illnau', 295);
    const verein = person(101, 161, 163, [{ role_class: 'Group::Verein::Mitglied', group_id: 163 }]);
    const first = await login(verein);
    expect(first.user).toMatchObject({ homeDepartmentId: null, homeDepartmentSource: null });
    expect(first.location).toContain('/abteilung');

    const chosen = await inject(app, {
      method: 'PUT',
      url: '/api/auth/me/department',
      cookie: first.cookie,
      payload: { departmentId: illnau.id, stufen: [] },
    });
    expect(chosen.statusCode).toBe(200);

    // Die eigene Wahl bleibt beim nächsten Login, gibt aber keine Rechte aus Cevi.DB
    const { user, location } = await login(verein);
    expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'SELF' });
    expect(role(user, illnau.id)).toBe('HELPER');
    expect(location).not.toContain('/abteilung');
  });

  it('ordnet Vereinsmitglieder einer normalen Ortsgruppe weiterhin zu', async () => {
    const weiningen = await department('weiningen', 219);
    const { user } = await login(person(102, 219, 250, [{ role_class: 'Group::Verein::Mitglied', group_id: 250 }]));
    expect(user).toMatchObject({ homeDepartmentId: weiningen.id, homeDepartmentSource: 'CEVIDB' });
  });

  it('nimmt Personen ohne Rollen nur die Leitung, nicht die Abteilung', async () => {
    const illnau = await department('illnau', 295);
    await login(person(103, 161, 295, [leader(295)]));
    await login(person(104, 161, 295, [leader(295)]));
    const { user } = await login(person(103, 161, null, []));
    expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'CEVIDB', departmentLeader: false });
    expect(role(user, illnau.id)).toBe('HELPER');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/groups/'))).toBe(false);
  });

  it('lässt die Heimabteilung, wenn eine Gruppe gerade nicht lesbar ist', async () => {
    const illnau = await department('illnau', 295);
    const profile = person(105, 161, 806, [stufe(806), { role_class: 'Group::Verein::Mitglied', group_id: 163 }]);
    expect((await login(profile)).user.homeDepartmentId).toBe(illnau.id);

    await app.prisma.hitobitoGroup.deleteMany({ where: { id: 806 } });
    blockedGroups = new Set([806]);
    const { user, location } = await login(profile);
    expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'CEVIDB', jungscharIds: [295] });
    expect(location).not.toContain('/abteilung');
  });

  it('ordnet auch beim Verknüpfen mit einem Passwort-Konto über die Rollen zu', async () => {
    const illnau = await department('illnau', 295);
    const account = await createUser(app, {
      email: 'p106@example.com',
      passwordHash: await bcrypt.hash('geheim-123', 4),
      emailVerified: true,
    });
    const res = await callback(person(106, 219, 295, [leader(295)]));
    expect(String(res.headers.location)).toContain('/konto-verknuepfen');
    const link = res.cookies.find((c) => c.name === 'cevidb_link');

    const confirmed = await inject(app, {
      method: 'POST',
      url: '/api/auth/cevidb/link',
      cookie: `cevidb_link=${link?.value}`,
      payload: { password: 'geheim-123' },
    });
    expect(confirmed.statusCode).toBe(200);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: account.id }, include: { memberships: true } });
    expect(user).toMatchObject({ providerId: '106', homeDepartmentId: illnau.id, homeDepartmentSource: 'CEVIDB', ortsgruppeId: 161 });
    expect(role(user, illnau.id)).toBe('ADMIN');
  });

  it('übernimmt ein Cevi-Name-Profil, ohne die Zuordnung zu ändern', async () => {
    const illnau = await department('illnau', 295);
    const guest = await createUser(app, {
      email: null,
      nickname: 'Name107',
      birthDate: new Date('2010-02-08T00:00:00Z'),
      phone: '+41 79 000 00 00',
      homeDepartmentId: illnau.id,
    });
    const { user } = await login({ ...person(107, 161, 806, [stufe(806)]), birthday: '2010-02-08' });
    expect(await app.prisma.user.findUnique({ where: { id: guest.id } })).toBeNull();
    expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'CEVIDB' });
    const merged = await app.prisma.user.findUniqueOrThrow({
      where: { provider_providerId: { provider: 'CEVI', providerId: '107' } },
    });
    expect(merged.phone).toBe('+41 79 000 00 00');
    expect(merged.homeDepartmentSource).toBe('CEVIDB');
  });

  describe('Zugehörigkeit bestätigen', () => {
    const verein = person(201, 161, 163, [{ role_class: 'Group::Verein::Mitglied', group_id: 163 }]);
    const confirmUrl = (id: string) => `/api/departments/current/people/${id}/confirm`;

    /** Illnau mit Leitung und einem Vereinsmitglied, das Illnau selbst gewählt hat */
    async function setup() {
      const illnau = await department('illnau', 295);
      const leitung = await login(person(200, 161, 295, [leader(295)]));
      const member = await login(verein);
      await inject(app, {
        method: 'PUT',
        url: '/api/auth/me/department',
        cookie: member.cookie,
        payload: { departmentId: illnau.id, stufen: [] },
      });
      return { illnau, leitung, member };
    }
    const confirmAs = (cookie: string, id: string, tenant = 'illnau') =>
      inject(app, { method: 'POST', url: confirmUrl(id), cookie, tenant, payload: {} });
    const source = async (id: string) =>
      (await app.prisma.user.findUniqueOrThrow({ where: { id } })).homeDepartmentSource;

    it('zeigt den Knopf nur der Abteilungsleitung und protokolliert die Bestätigung', async () => {
      const { illnau, leitung, member } = await setup();
      const list = await inject(app, { method: 'GET', url: '/api/departments/current/people', cookie: leitung.cookie, tenant: 'illnau' });
      const row = list.json().find((p: { userId: string }) => p.userId === member.user.id);
      expect(row).toMatchObject({ source: 'SELF', canConfirmHome: true });

      expect((await confirmAs(leitung.cookie, member.user.id)).statusCode).toBe(200);
      expect(await source(member.user.id)).toBe('CONFIRMED');
      const log = await app.prisma.departmentAuditLog.findFirstOrThrow({ where: { departmentId: illnau.id, action: 'MEMBER_CONFIRM' } });
      expect(log).toMatchObject({ targetUserId: member.user.id, actorId: leitung.user.id });

      const after = await inject(app, { method: 'GET', url: '/api/departments/current/people', cookie: leitung.cookie, tenant: 'illnau' });
      const confirmed = after.json().find((p: { userId: string }) => p.userId === member.user.id);
      expect(confirmed).toMatchObject({ source: 'CONFIRMED', canConfirmHome: false });
      expect(confirmed.confirmedBy).toContain('Name200');
      expect(confirmed.confirmedAt).toEqual(expect.any(String));
      const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } });
      expect(stored.homeDepartmentConfirmedById).toBe(leitung.user.id);
      expect(stored.homeDepartmentConfirmedAt).toBeInstanceOf(Date);
    });

    it('lässt das Recht «Personen verwalten» allein nicht bestätigen', async () => {
      const { illnau, member } = await setup();
      const helper = await login(person(202, 161, 806, [stufe(806)]));
      await app.prisma.departmentMember.update({
        where: { departmentId_userId: { departmentId: illnau.id, userId: helper.user.id } },
        data: { permissions: ['PEOPLE_VIEW', 'PEOPLE_MANAGE'] },
      });
      expect((await confirmAs(helper.cookie, member.user.id)).statusCode).toBe(403);
      expect(await source(member.user.id)).toBe('SELF');
    });

    it('bestätigt niemanden ausserhalb der eigenen Abteilung', async () => {
      const { member } = await setup();
      await department('effretikon', 726);
      const fremd = await login(person(203, 161, 726, [leader(726)]));
      const res = await confirmAs(fremd.cookie, member.user.id, 'effretikon');
      expect(res.statusCode).toBe(404);
      expect(await source(member.user.id)).toBe('SELF');
    });

    it('bestätigt weder die eigene Person noch andere Ortsgruppen oder Konten ohne Cevi.DB', async () => {
      const { illnau, leitung } = await setup();
      const fremd = await login(person(204, 219, 817, [stufe(817)]));
      await app.prisma.user.update({ where: { id: fremd.user.id }, data: { homeDepartmentId: illnau.id, homeDepartmentSource: 'SELF' } });
      expect((await confirmAs(leitung.cookie, fremd.user.id)).statusCode).toBe(400);

      const ohneCeviDb = await createUser(app, { homeDepartmentId: illnau.id, homeDepartmentSource: 'SELF' });
      expect((await confirmAs(leitung.cookie, ohneCeviDb.id)).statusCode).toBe(400);

      await app.prisma.user.update({ where: { id: leitung.user.id }, data: { homeDepartmentSource: 'SELF' } });
      expect((await confirmAs(leitung.cookie, leitung.user.id)).statusCode).toBe(400);
    });

    it('bleibt beim nächsten Login bestehen', async () => {
      const { illnau, leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      const { user } = await login(verein);
      expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'CONFIRMED' });
    });

    it('wird von einer Rolle in der Jungschar abgelöst', async () => {
      const { illnau, leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      const { user } = await login({ ...verein, primary_group_id: 806, roles: [...verein.roles, { role_class: 'Group::Stufe::Helfer', group_id: 806, group_name: 'Joschija', role_name: 'Helfer' }] });
      expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'CEVIDB', homeDepartmentConfirmedById: null, homeDepartmentConfirmedAt: null });
    });

    it('fällt weg, wenn die Rollen nicht mehr in der Ortsgruppe liegen', async () => {
      const { illnau, leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      const { user } = await login({ ...verein, primary_group_id: null, roles: [] });
      expect(user).toMatchObject({ homeDepartmentId: illnau.id, homeDepartmentSource: 'SELF', homeDepartmentConfirmedById: null });
    });

    it('bleibt bei einem Ausfall der Gruppen-API bestehen', async () => {
      const { leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      await app.prisma.hitobitoGroup.deleteMany({ where: { id: 163 } });
      groupsAvailable = false;
      const { user } = await login(verein);
      expect(user.homeDepartmentSource).toBe('CONFIRMED');
    });

    it('fällt weg, wenn die Person die Abteilung selbst wechselt', async () => {
      const { leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      const other = await department('effretikon', 726);
      await inject(app, {
        method: 'PUT',
        url: '/api/auth/me/department',
        cookie: member.cookie,
        payload: { departmentId: other.id, stufen: [] },
      });
      expect(await source(member.user.id)).toBe('SELF');
      const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } });
      expect(stored.homeDepartmentConfirmedById).toBeNull();
    });

    it('bleibt, wenn die Person nur ihre Angaben neu speichert', async () => {
      const { illnau, leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      await inject(app, {
        method: 'PUT',
        url: '/api/auth/me/department',
        cookie: member.cookie,
        payload: { departmentId: illnau.id, stufen: [] },
      });
      const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } });
      expect(stored).toMatchObject({ homeDepartmentSource: 'CONFIRMED', homeDepartmentConfirmedById: leitung.user.id });
    });

    it('behält die Bestätigung, wenn das bestätigende Konto gelöscht wird', async () => {
      const { leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      await app.prisma.departmentMember.deleteMany({ where: { userId: leitung.user.id } });
      await app.prisma.user.delete({ where: { id: leitung.user.id } });
      const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } });
      expect(stored).toMatchObject({ homeDepartmentSource: 'CONFIRMED', homeDepartmentConfirmedById: null });
      expect(stored.homeDepartmentConfirmedAt).toBeInstanceOf(Date);
    });

    it('lässt sich aufheben', async () => {
      const { leitung, member } = await setup();
      await confirmAs(leitung.cookie, member.user.id);
      const res = await inject(app, { method: 'DELETE', url: confirmUrl(member.user.id), cookie: leitung.cookie, tenant: 'illnau' });
      expect(res.statusCode).toBe(200);
      expect(await source(member.user.id)).toBe('SELF');
      const stored = await app.prisma.user.findUniqueOrThrow({ where: { id: member.user.id } });
      expect(stored).toMatchObject({ homeDepartmentConfirmedById: null, homeDepartmentConfirmedAt: null });
    });
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

    await app.prisma.hitobitoGroup.deleteMany();
    const unverified = await inject(app, { method: 'GET', url: '/api/departments/creation-eligibility', cookie });
    expect(unverified.json()).toMatchObject({ eligible: false, reason: 'UNVERIFIED' });
  });

  it('gibt beim Verknüpfen im Admin-Portal die Leitung nur über die eigene Rolle', async () => {
    const admin = await createUser(app, { isGlobalAdmin: true, ceviDbId: 1 });
    const token = app.jwt.sign({ id: admin.id, email: admin.email ?? 'a@b.ch', isGlobalAdmin: true, amr: 'cevidb' });
    const adminCookie = `token=${token}`;
    const leitungIllnau = await login(person(81, 161, 295, [leader(295)]));
    const leitungEffi = await login(person(82, 161, 726, [leader(726)]));
    const home = await department('effretikon', 726);
    const beide = await login(person(83, 161, 726, [stufe(910), { role_class: 'Group::Jungschar::FreierMitarbeiter', group_id: 295 }]));
    expect(beide.user.homeDepartmentId).toBe(home.id);

    const target = await createDepartment(app, { slug: 'illnau' });
    const res = await inject(app, {
      method: 'PATCH',
      url: `/api/admin/departments/${target.id}`,
      cookie: adminCookie,
      headers: { host: 'admin.localhost', 'sec-fetch-site': 'same-origin' },
      payload: { hitobitoGroupId: 295 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().attached).toBe(2);
    const stayed = await app.prisma.user.findUniqueOrThrow({ where: { id: beide.user.id }, include: { memberships: true } });
    expect(stayed.homeDepartmentId).toBe(home.id);
    expect(role(stayed, target.id)).toBe('HELPER');

    const first = await app.prisma.user.findUniqueOrThrow({ where: { id: leitungIllnau.user.id }, include: { memberships: true } });
    const second = await app.prisma.user.findUniqueOrThrow({ where: { id: leitungEffi.user.id }, include: { memberships: true } });
    expect(role(first, target.id)).toBe('ADMIN');
    expect(role(second, target.id)).toBeNull();
  });
});
