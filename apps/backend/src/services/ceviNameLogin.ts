import type { PrismaClient } from '../db.js';
import { createRateLimiter } from './rateLimit.js';

/**
 * Cevi-Name-Profile: Konten ohne Cevi.DB und ohne Passwort. Sie melden sich nur an einer Abteilung
 * mit Cevi-Name + Geburtsdatum an. Weil Geburtsdaten unter Bekannten kein Geheimnis sind, dürfen
 * solche Profile keine Rechte haben (nur Helfer*in), und nur sie lassen sich so anmelden.
 */
export function isCeviNameProfile(user: { passwordHash: string | null; ceviDbId: number | null }): boolean {
  return user.passwordHash === null && user.ceviDbId === null;
}

export const CEVINAME_ROLE_ERROR =
  'Diese Person hat nur ein Cevi-Name-Profil. Für Rollen im OK oder in der Abteilung braucht sie ein Konto mit Cevi.DB oder mit E-Mail und Passwort.';

/** Geburtsdatum JJJJ-MM-TT als Tagesbereich (UTC), damit auch anders gespeicherte Uhrzeiten passen */
function dayRange(birthDate: string) {
  const start = new Date(`${birthDate}T00:00:00Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

/**
 * Alle Konten der Abteilung (Heimabteilung oder Mitglied) mit diesem Cevi-Namen (ohne Gross/Klein)
 * und Geburtsdatum. Älteste zuerst, damit die Wahl bei Altlasten stabil bleibt.
 */
export async function findCeviNameMatches(
  prisma: Pick<PrismaClient, 'user'>,
  departmentId: string,
  ceviName: string,
  birthDate: string
) {
  return prisma.user.findMany({
    where: {
      ceviName: { equals: ceviName.trim(), mode: 'insensitive' },
      birthDate: dayRange(birthDate),
      OR: [{ homeDepartmentId: departmentId }, { memberships: { some: { departmentId } } }],
    },
    select: {
      id: true,
      passwordHash: true,
      ceviDbId: true,
      isGlobalAdmin: true,
      memberships: { select: { role: true } },
      organizedEvents: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });
}

type Match = Awaited<ReturnType<typeof findCeviNameMatches>>[number];

/** Hat das Konto irgendwo Rechte? Dann reicht Cevi-Name + Geburtsdatum nicht. */
export function hasRights(user: Match): boolean {
  return (
    user.isGlobalAdmin ||
    user.memberships.some((m) => m.role === 'ADMIN' || m.role === 'PLANNER') ||
    user.organizedEvents.length > 0
  );
}

/** Ergebnis der Suche: Profil zum Anmelden, oder womit sich die Person stattdessen anmelden muss. */
export function pickCeviNameMatch(
  matches: Match[]
): { kind: 'LOGIN'; userId: string } | { kind: 'USE_CEVIDB' } | { kind: 'USE_PASSWORD' } | { kind: 'NONE' } {
  const open = matches.find((m) => isCeviNameProfile(m) && !hasRights(m));
  if (open) return { kind: 'LOGIN', userId: open.id };
  if (matches.some((m) => m.ceviDbId !== null)) return { kind: 'USE_CEVIDB' };
  if (matches.some((m) => m.passwordHash !== null)) return { kind: 'USE_PASSWORD' };
  // Cevi-Name-Profil mit Rechten (aus der Zeit vor dieser Regel): nur noch über ein richtiges Konto
  if (matches.length > 0) return { kind: 'USE_PASSWORD' };
  return { kind: 'NONE' };
}

/* ------------------------------------------------------------------ OK ernennen */

/**
 * Person fürs OK finden (per ID, E-Mail oder Cevi-Name). Cevi-Namen sind nicht eindeutig: gesucht
 * wird nur unter Konten mit Cevi.DB oder Passwort, bei mehreren zuerst in der eigenen Abteilung.
 * Reine Cevi-Name-Profile bekommen keine OK-Rolle.
 */
export async function resolveOrganizerUser(
  prisma: Pick<PrismaClient, 'user'>,
  departmentId: string,
  who: { userId?: string; ceviName?: string; email?: string }
): Promise<{ user: { id: string } } | { error: string; status: number }> {
  let user: { id: string; passwordHash: string | null; ceviDbId: number | null } | null = null;
  const select = { id: true, passwordHash: true, ceviDbId: true } as const;

  if (who.userId) {
    user = await prisma.user.findUnique({ where: { id: who.userId }, select });
  } else if (who.email) {
    user = await prisma.user.findUnique({ where: { email: who.email.trim().toLowerCase() }, select });
  } else if (who.ceviName?.trim()) {
    const name = who.ceviName.trim();
    const candidates = await prisma.user.findMany({
      where: {
        ceviName: { equals: name, mode: 'insensitive' },
        OR: [{ passwordHash: { not: null } }, { ceviDbId: { not: null } }],
      },
      select: { ...select, homeDepartmentId: true, memberships: { select: { departmentId: true } } },
    });
    const local = candidates.filter(
      (c) => c.homeDepartmentId === departmentId || c.memberships.some((m) => m.departmentId === departmentId)
    );
    const pick = candidates.length === 1 ? candidates : local;
    if (pick.length === 1) {
      user = pick[0];
    } else if (candidates.length > 1) {
      return {
        error: `Mehrere Personen heissen «${name}». Gib die E-Mail an oder wähle die Person aus der Liste.`,
        status: 409,
      };
    } else {
      const onlyProfile = await prisma.user.count({ where: { ceviName: { equals: name, mode: 'insensitive' } } });
      if (onlyProfile > 0) return { error: CEVINAME_ROLE_ERROR, status: 400 };
    }
  }

  if (!user) return { error: 'Diese Person wurde nicht gefunden. Sie braucht bereits ein Konto.', status: 404 };
  if (isCeviNameProfile(user)) return { error: CEVINAME_ROLE_ERROR, status: 400 };
  return { user: { id: user.id } };
}

/* ------------------------------------------------------------------ Versuchsbremse */

/* Bremse im Speicher gegen das Durchprobieren von Geburtsdaten (siehe rateLimit.ts) */
const ipLimiter = createRateLimiter(10 * 60 * 1000, 30);
const missLimiter = createRateLimiter(15 * 60 * 1000, 8);

/** Alle Anfragen pro IP: 30 in 10 Minuten. true = zu viele */
export function tooManyRequests(ip: string): boolean {
  return ipLimiter.hit(ip);
}

/**
 * Fehlversuche pro Cevi-Name und Abteilung (unabhängig von der IP): 8 in 15 Minuten.
 * Zählt nur, wenn das Geburtsdatum nicht zu einem Profil passt.
 */
export function tooManyMisses(departmentId: string, ceviName: string): boolean {
  return missLimiter.hit(`${departmentId}:${ceviName.trim().toLowerCase()}`);
}

export const RATE_LIMIT_ERROR = 'Zu viele Versuche. Bitte warte ein paar Minuten und versuch es dann nochmals.';
