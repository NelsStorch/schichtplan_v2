/**
 * Gruppenstruktur aus der Cevi.DB: Das OAuth-Profil nennt pro Rolle nur die Gruppe, nicht deren Jungschar oder
 * Ortsgruppe. Die stehen in der Gruppen-API (`/groups/{id}.json`, Scope `groups`). Beim Login werden die Gruppen
 * der Rollen mit dem Token der Person gelesen und in `cevidb_groups` zwischengespeichert. Das Token wird nicht
 * gespeichert, und aus der Antwort (sie enthält z. B. die Kontaktperson der Gruppe) bleiben nur Gruppenangaben.
 * Schlägt etwas fehl, läuft der Login mit dem Zwischenspeicher weiter (siehe placeCeviDbPerson).
 */
import type { FastifyBaseLogger } from 'fastify';
import type { OrganizationType, PrismaClient } from '../db.js';
import { parseCeviDbGroupId, type CeviDbGroupInfo } from './cevidb.js';

/** Solange gilt ein Eintrag als aktuell (die Gruppenstruktur ändert sich selten) */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Obergrenze für alle Aufrufe eines Logins: Eine langsame Cevi.DB darf den Login nicht aufhalten */
const TIME_BUDGET_MS = 6_000;
const CONCURRENCY = 4;
const MAX_GROUPS = 40;

// Gruppentypen laut Cevi.DB. Die Bezeichnungen sind übersetzt, die Cevi.DB läuft nur auf Deutsch.
const JUNGSCHAR_TYPE = 'Jungschar';
const ORTSGRUPPE_TYPE = 'Ortsgruppe';

type Db = Pick<PrismaClient, 'hitobitoGroup'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseCeviDbGroupId).filter((id): id is number => id !== null);
}

/**
 * Antwort von `/groups/{id}.json` auslesen, ohne Personendaten. In `linked.groups` kommen Eltern-Gruppen doppelt
 * vor, einmal mit dem allgemeinen Typ «Gruppe»: Jede ID zählt darum mit allen ihren Typen.
 */
export function parseCeviDbGroup(body: unknown, expectedId: number): CeviDbGroupInfo | null {
  if (!isRecord(body) || !Array.isArray(body.groups) || !isRecord(body.groups[0])) return null;
  const group = body.groups[0];
  if (parseCeviDbGroupId(group.id) !== expectedId || typeof group.name !== 'string' || !isRecord(group.links)) {
    return null;
  }
  const hierarchy = idList(group.links.hierarchies);
  // Ohne Hierarchie liesse sich die Gruppe nicht einordnen
  if (hierarchy.length === 0) return null;

  const typesById = new Map<number, Set<string>>();
  const addType = (id: number | null, type: unknown) => {
    if (id === null || typeof type !== 'string') return;
    typesById.set(id, (typesById.get(id) ?? new Set()).add(type));
  };
  addType(expectedId, group.group_type);
  const linked = isRecord(body.linked) && Array.isArray(body.linked.groups) ? body.linked.groups : [];
  for (const entry of linked) {
    if (isRecord(entry)) addType(parseCeviDbGroupId(entry.id), entry.group_type);
  }
  const hasType = (id: number, type: string) => typesById.get(id)?.has(type) ?? false;
  // Die Hierarchie geht von oben nach unten: Die letzte Treffer-Gruppe liegt der Gruppe am nächsten
  const nearest = (type: string) => hierarchy.filter((id) => hasType(id, type)).at(-1) ?? null;

  return {
    id: expectedId,
    name: group.name.slice(0, 200),
    jungscharId: nearest(JUNGSCHAR_TYPE),
    ortsgruppeId: nearest(ORTSGRUPPE_TYPE),
    jungscharCount: hasType(expectedId, ORTSGRUPPE_TYPE)
      ? idList(group.links.children).filter((id) => hasType(id, JUNGSCHAR_TYPE)).length
      : null,
  };
}

async function fetchGroup(
  baseUrl: string,
  accessToken: string,
  id: number,
  signal: AbortSignal,
  log: FastifyBaseLogger
): Promise<CeviDbGroupInfo | null> {
  const res = await fetch(`${baseUrl}/groups/${id}.json`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    log.warn({ groupId: id, status: res.status }, 'Cevi.DB: Gruppe nicht lesbar');
    return null;
  }
  const info = parseCeviDbGroup(await res.json(), id);
  if (!info) log.warn({ groupId: id }, 'Cevi.DB: Gruppen-Antwort unbrauchbar');
  return info;
}

/** Gruppen auffrischen, die fehlen oder zu alt sind. Gibt alle gefragten Gruppen zurück, die es danach gibt. */
async function refreshGroups(
  prisma: Db,
  log: FastifyBaseLogger,
  baseUrl: string,
  accessToken: string,
  ids: number[],
  signal: AbortSignal,
  provider: OrganizationType = 'CEVI'
) {
  const cached = await prisma.hitobitoGroup.findMany({ where: { provider, id: { in: ids } } });
  const now = Date.now();
  const fresh = new Set(cached.filter((g) => now - g.fetchedAt.getTime() < MAX_AGE_MS).map((g) => g.id));
  const queue = ids.filter((id) => !fresh.has(id));

  const results: CeviDbGroupInfo[] = [];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      // Ein Fehler betrifft nur diese Gruppe: Was schon gelesen ist, wird trotzdem gespeichert
      try {
        const info = await fetchGroup(baseUrl, accessToken, id, signal, log);
        if (info) results.push(info);
      } catch (err) {
        log.warn({ groupId: id, reason: err instanceof Error ? err.message : 'unbekannt' }, 'Cevi.DB: Gruppe nicht erreichbar');
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const fetchedAt = new Date();
  for (const info of results) {
    await prisma.hitobitoGroup.upsert({
      where: { provider_id: { provider, id: info.id } },
      update: { ...info, fetchedAt },
      create: { provider, ...info, fetchedAt },
    });
  }
  return prisma.hitobitoGroup.findMany({ where: { provider, id: { in: ids } } });
}

/**
 * Gruppen der Rollen samt ihren Jungscharen und Ortsgruppen auffrischen (für placeCeviDbPerson). Wirft nie:
 * Ein Fehler hier darf den Login nicht verhindern. Stimmen Rollen und Struktur nicht, gibt es nur weniger Automatik.
 */
export async function refreshCeviDbGroups(
  prisma: Db,
  log: FastifyBaseLogger,
  options: { baseUrl: string; accessToken: string; grantedScopes: string; groupIds: number[]; provider?: OrganizationType }
): Promise<void> {
  const { baseUrl, accessToken, grantedScopes, groupIds, provider = 'CEVI' } = options;
  if (groupIds.length === 0) return;
  if (!grantedScopes.split(/\s+/).includes('groups')) {
    log.warn('Cevi.DB: Token ohne Scope groups, Gruppenstruktur nicht aktualisiert');
    return;
  }
  try {
    const signal = AbortSignal.timeout(TIME_BUDGET_MS);
    const ids = [...new Set(groupIds)].slice(0, MAX_GROUPS);
    const groups = await refreshGroups(prisma, log, baseUrl, accessToken, ids, signal, provider);
    const parents = [...new Set(groups.flatMap((g) => [g.jungscharId, g.ortsgruppeId]))].filter(
      (id): id is number => id !== null && !ids.includes(id)
    );
    if (parents.length) await refreshGroups(prisma, log, baseUrl, accessToken, parents, signal, provider);
  } catch (err) {
    log.warn({ reason: err instanceof Error ? err.message : 'unbekannt' }, 'Cevi.DB: Gruppenstruktur nicht aktualisiert');
  }
}
