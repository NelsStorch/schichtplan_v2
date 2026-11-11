import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { parseCeviDbGroup, refreshCeviDbGroups } from './cevidbGroups.js';

// Gekürzte echte Antworten von db.cevi.ch (Oktober 2026), Personendaten ersetzt
const joschija = {
  groups: [
    {
      id: '806',
      group_type: 'Stufe',
      layer: false,
      name: 'Joschija',
      links: { contact: '6396', parent: '295', layer_group: '295', hierarchies: ['1', '2', '72', '161', '295', '806'] },
    },
  ],
  linked: {
    people: [{ id: '6396', first_name: 'Vorname', last_name: 'Nachname', address: 'Musterweg 1', town: 'Illnau' }],
    groups: [
      { id: '295', name: 'JS Illnau', group_type: 'Gruppe' },
      { id: '295', name: 'JS Illnau', group_type: 'Jungschar' },
      { id: '1', name: 'Cevi Schweiz', group_type: 'Dachverband' },
      { id: '2', name: 'Cevi Region Zürich', group_type: 'Mitgliederorganisation' },
      { id: '72', name: 'Sektion Oberland', group_type: 'Sektion' },
      { id: '161', name: 'Illnau-Effretikon', group_type: 'Ortsgruppe' },
      { id: '806', name: 'Joschija', group_type: 'Stufe' },
    ],
  },
};
const jsIllnau = {
  groups: [
    {
      id: '295',
      group_type: 'Jungschar',
      layer: true,
      name: 'JS Illnau',
      links: {
        parent: '161',
        layer_group: '295',
        hierarchies: ['1', '2', '72', '161', '295'],
        children: ['807', '3791', '296', '803', '802', '805', '806', '804'],
      },
    },
  ],
  linked: {
    groups: [
      { id: '161', name: 'Illnau-Effretikon', group_type: 'Gruppe' },
      { id: '295', name: 'JS Illnau', group_type: 'Jungschar' },
      { id: '161', name: 'Illnau-Effretikon', group_type: 'Ortsgruppe' },
      { id: '296', name: 'Fröschli Illnau', group_type: 'Fröschli' },
    ],
  },
};
const ortsgruppe = {
  groups: [
    {
      id: '161',
      group_type: 'Ortsgruppe',
      layer: true,
      name: 'Illnau-Effretikon',
      links: { parent: '72', layer_group: '161', hierarchies: ['1', '2', '72', '161'], children: ['178', '2386', '726', '295', '163'] },
    },
  ],
  linked: {
    groups: [
      { id: '72', name: 'Sektion Oberland', group_type: 'Gruppe' },
      { id: '161', name: 'Illnau-Effretikon', group_type: 'Ortsgruppe' },
      { id: '178', name: 'Cevi-E Illnau-Effretikon', group_type: 'Weiteres Arbeitsgebiet' },
      { id: '726', name: 'JS Effretikon', group_type: 'Jungschar' },
      { id: '295', name: 'JS Illnau', group_type: 'Jungschar' },
      { id: '163', name: 'Verein Illnau-Effretikon', group_type: 'Verein' },
    ],
  },
};

describe('parseCeviDbGroup', () => {
  it('ordnet eine Stufe ihrer Jungschar und Ortsgruppe zu', () => {
    expect(parseCeviDbGroup(joschija, 806)).toEqual({
      id: 806,
      name: 'Joschija',
      jungscharId: 295,
      ortsgruppeId: 161,
      jungscharCount: null,
      groupType: 'Stufe',
    });
  });

  it('erkennt eine Jungschar als ihre eigene Ebene', () => {
    expect(parseCeviDbGroup(jsIllnau, 295)).toMatchObject({ jungscharId: 295, ortsgruppeId: 161, jungscharCount: null });
  });

  it('zählt die Jungscharen einer Ortsgruppe', () => {
    expect(parseCeviDbGroup(ortsgruppe, 161)).toMatchObject({ jungscharId: null, ortsgruppeId: 161, jungscharCount: 2 });
  });

  it('lässt Mitgliederorganisation und Sektion selbst eine Abteilung bilden', () => {
    const sektion = {
      groups: [{ id: '72', name: 'Sektion Oberland', group_type: 'Sektion', links: { hierarchies: ['1', '2', '72'], children: ['161'] } }],
      linked: { groups: ortsgruppe.linked.groups },
    };
    expect(parseCeviDbGroup(sektion, 72)).toMatchObject({ ortsgruppeId: 72, jungscharId: null, jungscharCount: 0 });
    const vorstand = {
      groups: [{ id: '3', name: 'Vorstand', group_type: 'Vorstand', links: { hierarchies: ['1', '2', '3'] } }],
      linked: { groups: [{ id: '2', name: 'Cevi Region Zürich', group_type: 'Mitgliederorganisation' }] },
    };
    expect(parseCeviDbGroup(vorstand, 3)).toMatchObject({ ortsgruppeId: 2, jungscharCount: null });
  });

  it('nimmt keine Personendaten mit', () => {
    expect(JSON.stringify(parseCeviDbGroup(joschija, 806))).not.toMatch(/Musterweg|Vorname|6396/);
  });

  it('verwirft fremde oder unbrauchbare Antworten', () => {
    expect(parseCeviDbGroup(joschija, 805)).toBeNull();
    expect(parseCeviDbGroup({ groups: [{ id: '806', name: 'X', links: {} }] }, 806)).toBeNull();
    expect(parseCeviDbGroup({ error: 'nope' }, 806)).toBeNull();
    expect(parseCeviDbGroup(null, 806)).toBeNull();
  });
});

// Struktur wie auf pbs.puzzle.ch (November 2026): Bund → Kantonalverband → Region → Abteilung → Wölfe
const pbsLinked = [
  { id: '1', name: 'Pfadibewegung Schweiz', group_type: 'Bund' },
  { id: '234', name: 'AS Genevois', group_type: 'Kantonalverband' },
  { id: '906', name: 'RG-coachland', group_type: 'Region' },
  { id: '906', name: 'RG-coachland', group_type: 'Gruppe' },
  { id: '1045', name: 'Benoît de Pontverre', group_type: 'Abteilung' },
  { id: '1047', name: 'Meute', group_type: 'Wölfe' },
  { id: '1046', name: 'Troupe', group_type: 'Pfadi' },
];
const pbsGroup = (id: string, name: string, type: string, hierarchies: string[], children: string[] = []) => ({
  groups: [{ id, name, group_type: type, layer: true, links: { hierarchies, children } }],
  linked: { groups: pbsLinked },
});

describe('parseCeviDbGroup für Pfadi (MiData)', () => {
  it('ordnet eine Einheit ihrer Abteilung zu', () => {
    const meute = pbsGroup('1047', 'Meute', 'Wölfe', ['1113', '1', '234', '906', '1045', '1047']);
    expect(parseCeviDbGroup(meute, 1047, 'PFADI')).toEqual({
      id: 1047,
      name: 'Meute',
      jungscharId: null,
      ortsgruppeId: 1045,
      jungscharCount: null,
      groupType: 'Wölfe',
    });
  });

  it('nimmt die Abteilung als eigene Ebene, ohne Jungscharen', () => {
    const abteilung = pbsGroup('1045', 'Benoît de Pontverre', 'Abteilung', ['1113', '1', '234', '906', '1045'], ['1047', '1046']);
    expect(parseCeviDbGroup(abteilung, 1045, 'PFADI')).toMatchObject({ jungscharId: null, ortsgruppeId: 1045, jungscharCount: 0 });
  });

  it('lässt Regionen und Kantonalverbände selbst eine Abteilung bilden', () => {
    const region = pbsGroup('906', 'RG-coachland', 'Region', ['1113', '1', '234', '906'], ['1045']);
    expect(parseCeviDbGroup(region, 906, 'PFADI')).toMatchObject({ ortsgruppeId: 906, jungscharCount: 0 });
    const kantonalverband = pbsGroup('234', 'AS Genevois', 'Kantonalverband', ['1113', '1', '234'], ['906']);
    expect(parseCeviDbGroup(kantonalverband, 234, 'PFADI')).toMatchObject({ ortsgruppeId: 234, jungscharCount: 0 });
  });

  it('wertet Pfadi-Gruppen nicht mit den Cevi-Typen aus', () => {
    const abteilung = pbsGroup('1045', 'Benoît de Pontverre', 'Abteilung', ['1113', '1', '234', '906', '1045']);
    expect(parseCeviDbGroup(abteilung, 1045, 'CEVI')).toMatchObject({ ortsgruppeId: null });
  });
});

describe('parseCeviDbGroup für Jubla', () => {
  const linked = [
    { id: '1', name: 'Jubla Schweiz', group_type: 'Bund' },
    { id: '10', name: 'Jubla Zürich', group_type: 'Kanton' },
    { id: '20', name: 'Region Oberland', group_type: 'Region' },
    { id: '21', name: 'Regionalleitung', group_type: 'Regionalleitung' },
    { id: '30', name: 'Jubla Uster', group_type: 'Schar' },
    { id: '31', name: 'Blauring 3. Klasse', group_type: 'Kindergruppe' },
  ];
  const jubla = (id: string, type: string, hierarchies: string[]) => ({
    groups: [{ id, name: `Gruppe ${id}`, group_type: type, links: { hierarchies } }],
    linked: { groups: linked },
  });

  it('ordnet eine Kindergruppe ihrer Schar zu', () => {
    expect(parseCeviDbGroup(jubla('31', 'Kindergruppe', ['1', '10', '20', '30', '31']), 31, 'JUBLA')).toMatchObject({
      ortsgruppeId: 30,
      jungscharId: null,
    });
  });

  it('ordnet die Regionalleitung ihrer Region zu', () => {
    expect(parseCeviDbGroup(jubla('21', 'Regionalleitung', ['1', '10', '20', '21']), 21, 'JUBLA')).toMatchObject({
      ortsgruppeId: 20,
      jungscharCount: null,
    });
    expect(parseCeviDbGroup(jubla('20', 'Region', ['1', '10', '20']), 20, 'JUBLA')).toMatchObject({
      ortsgruppeId: 20,
      jungscharCount: 0,
    });
  });
});

describe('refreshCeviDbGroups', () => {
  const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;

  function fakeDb(initial: { id: number; fetchedAt: Date; jungscharId?: number | null; ortsgruppeId?: number | null }[] = []) {
    const rows = new Map<number, any>(initial.map((r) => [r.id, { jungscharId: null, ortsgruppeId: null, ...r }]));
    return {
      rows,
      hitobitoGroup: {
        findMany: async ({ where }: any) => where.id.in.flatMap((id: number) => rows.get(id) ?? []),
        upsert: async ({ where, create }: any) => void rows.set(where.provider_id?.id ?? where.id, create),
      },
    };
  }
  const answers: Record<string, unknown> = { '806': joschija, '295': jsIllnau, '161': ortsgruppe };
  function stubFetch() {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const id = /groups\/(\d+)\.json/.exec(url)![1];
      return answers[id]
        ? new Response(JSON.stringify(answers[id]), { status: 200 })
        : new Response('{}', { status: 403 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }
  const options = { baseUrl: 'https://db.test', accessToken: 'geheim', grantedScopes: 'email name with_roles groups', groupIds: [806] };

  afterEach(() => vi.unstubAllGlobals());

  it('holt die Gruppe samt Jungschar und Ortsgruppe', async () => {
    const fetchMock = stubFetch();
    const db = fakeDb();
    await refreshCeviDbGroups(db as any, log, options);
    expect([...db.rows.keys()].sort()).toEqual([161, 295, 806]);
    expect(db.rows.get(161).jungscharCount).toBe(2);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer geheim' });
  });

  it('fragt aktuelle Einträge nicht nochmals ab', async () => {
    const fetchMock = stubFetch();
    const db = fakeDb([{ id: 806, fetchedAt: new Date(), jungscharId: 295, ortsgruppeId: 161 }]);
    await refreshCeviDbGroups(db as any, log, options);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://db.test/groups/295.json', 'https://db.test/groups/161.json']);
  });

  it('frischt alte Einträge auf', async () => {
    const fetchMock = stubFetch();
    const db = fakeDb([{ id: 806, fetchedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) }]);
    await refreshCeviDbGroups(db as any, log, options);
    expect(fetchMock.mock.calls[0][0]).toBe('https://db.test/groups/806.json');
    expect(db.rows.get(806).ortsgruppeId).toBe(161);
  });

  it('ruft ohne Scope groups nichts ab', async () => {
    const fetchMock = stubFetch();
    await refreshCeviDbGroups(fakeDb() as any, log, { ...options, grantedScopes: 'email name with_roles' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('speichert trotz eines Fehlers bei einer Gruppe, was gelesen ist', async () => {
    const fetchMock = stubFetch();
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/805.json')) throw new Error('Netzwerk');
      return answer(url, init);
    });
    const db = fakeDb();
    await refreshCeviDbGroups(db as any, log, { ...options, groupIds: [805, 806] });
    expect(db.rows.has(805)).toBe(false);
    expect(db.rows.get(806).ortsgruppeId).toBe(161);
    expect(db.rows.get(161).jungscharCount).toBe(2);
  });

  it('lässt den Login bei einem Fehler nicht scheitern und behält den alten Stand', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Netzwerk')));
    const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    const db = fakeDb([{ id: 806, fetchedAt: old, jungscharId: 295, ortsgruppeId: 161 }]);
    await expect(refreshCeviDbGroups(db as any, log, options)).resolves.toBeUndefined();
    expect(db.rows.get(806).fetchedAt).toBe(old);
  });
});
