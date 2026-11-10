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
    });
  });

  it('erkennt eine Jungschar als ihre eigene Ebene', () => {
    expect(parseCeviDbGroup(jsIllnau, 295)).toMatchObject({ jungscharId: 295, ortsgruppeId: 161, jungscharCount: null });
  });

  it('zählt die Jungscharen einer Ortsgruppe', () => {
    expect(parseCeviDbGroup(ortsgruppe, 161)).toMatchObject({ jungscharId: null, ortsgruppeId: 161, jungscharCount: 2 });
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
