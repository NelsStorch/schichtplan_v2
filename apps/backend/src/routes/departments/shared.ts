
import { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import { Prisma, PrismaClient } from '../../db.js';
import {
  DEPARTMENT_PERMISSIONS,
  type DepartmentCreationEligibilityDto,
  type DepartmentDto,
  type DepartmentPermission,
  type DepartmentStufeDto,
} from '@schichtplan/shared';
import { personLabel } from '../../services/profile.js';
import { canGrantPermissions, departmentAccess, type DepartmentAccess } from '../../services/permissions.js';
import { usableEmail } from '../eventMessages.js';

// Gemeinsame Bausteine der Abteilungs-Routen (routes/departments/*)

export const toStufeDto = (s: {
  id: string;
  departmentId: string;
  name: string;
  hitobitoGroupId?: number | null;
  ceviDbGroupId?: number | null;
  sortOrder: number;
}): DepartmentStufeDto => ({
  id: s.id,
  departmentId: s.departmentId,
  name: s.name,
  hitobitoGroupId: s.hitobitoGroupId ?? s.ceviDbGroupId ?? null,
  ceviDbGroupId: s.hitobitoGroupId ?? s.ceviDbGroupId ?? null,
  sortOrder: s.sortOrder,
});

/** Letztes Nachführen der Cevi.DB-Stufen pro Abteilung beim öffentlichen Abruf (im Speicher) */
export const lastStufenSync = new Map<string, number>();
export const STUFEN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Ist das Nachführen für diese Abteilung wieder fällig? Merkt sich den Zeitpunkt, wenn ja. */
export function stufenSyncDue(departmentId: string, now = Date.now()): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const last = lastStufenSync.get(departmentId);
  if (last !== undefined && now - last < STUFEN_SYNC_INTERVAL_MS) return false;
  if (lastStufenSync.size > 5000) lastStufenSync.clear();
  lastStufenSync.set(departmentId, now);
  return true;
}

/** Kontaktperson: Abteilungsleitung oder jemand mit «Personen und Rechte verwalten» */
export const contactCandidateWhere = (departmentId: string) => ({
  departmentId,
  OR: [{ role: 'ADMIN' }, { permissions: { has: 'PEOPLE_MANAGE' } }],
});

/** Name der Kontaktperson für alle, die E-Mail nur für Angemeldete (Schutz vor Scrapern) */
export async function loadContactPerson(
  prisma: PrismaClient,
  contactUserId: string | null,
  loggedIn: boolean
): Promise<DepartmentDto['contactPerson']> {
  if (!contactUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: contactUserId },
    select: { nickname: true, firstName: true, lastName: true, email: true, emailVerified: true },
  });
  if (!user) return null;
  return { displayName: personLabel(user), email: loggedIn ? usableEmail(user) : null };
}

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export const NOT_ELIGIBLE_MESSAGES = {
  NOT_CEVIDB: 'Um eine Abteilung anzulegen, melde dich bitte mit Cevi.DB an.',
  NOT_LEADER:
    'Einen neuen Schichtplan für eine Abteilung kann nur die Abteilungsleitung anlegen. Bitte wende dich an deine Abteilungsleitung: Sie kann den Schichtplan für eure Abteilung anlegen und dir danach unter «Personen» das Recht «Anlässe erstellen» geben – oder sie erstellt den Anlass direkt für dich.',
  NO_ORTSGRUPPE: 'In Cevi.DB ist für dich keine Ortsgruppe hinterlegt.',
  EXISTS: 'Für deine Abteilung gibt es bereits einen Schichtplan.',
  UNVERIFIED: 'Wir konnten deine Gruppe in Cevi.DB gerade nicht prüfen. Melde dich bitte nochmals mit Cevi.DB an.',
} as const;

/**
 * Darf die Person für ihre Gruppe eine Abteilung anlegen? Es zählt die Gruppe der Leitungsrolle, nicht das selbst
 * änderbare Feld `ortsgruppe_id`. Die Abteilung hängt an der Ortsgruppe, bei mehreren Jungscharen an der Jungschar.
 */
export async function departmentCreationEligibility(
  prisma: PrismaClient,
  userId: string
): Promise<DepartmentCreationEligibilityDto> {
  const denied = (
    reason: NonNullable<DepartmentCreationEligibilityDto['reason']>,
    extra: Partial<DepartmentCreationEligibilityDto> = {}
  ): DepartmentCreationEligibilityDto => ({
    eligible: false,
    reason,
    ortsgruppeId: null,
    ortsgruppeName: null,
    leaderGroupName: null,
    existingDepartment: null,
    ...extra,
  });

  // Die provider*-Spalten schreibt nur der Hitobito-Login
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      provider: true,
      providerId: true,
      departmentLeader: true,
      leaderGroupIds: true,
      leaderGroupName: true,
    },
  });
  if (!user || user.providerId === null) return denied('NOT_CEVIDB');
  const provider = user.provider;

  const leaderGroupName = user.leaderGroupName;
  if (!user.departmentLeader) return denied('NOT_LEADER');

  const leaderGroups = await prisma.hitobitoGroup.findMany({ where: { provider, id: { in: user.leaderGroupIds } } });
  if (leaderGroups.length === 0 || leaderGroups.length < user.leaderGroupIds.length) {
    return denied('UNVERIFIED', { leaderGroupName });
  }

  let firstExisting: DepartmentCreationEligibilityDto | null = null;
  for (const group of leaderGroups) {
    if (group.ortsgruppeId === null) continue;
    const ortsgruppe = await prisma.hitobitoGroup.findUnique({
      where: { provider_id: { provider, id: group.ortsgruppeId } },
    });
    if (!ortsgruppe || ortsgruppe.jungscharCount === null) return denied('UNVERIFIED', { leaderGroupName });

    const perJungschar = ortsgruppe.jungscharCount > 1 && group.jungscharId !== null;
    const groupId = perJungschar ? group.jungscharId! : ortsgruppe.id;
    // Vorschlag für den Namen: «JS Effretikon» wird zu «Effretikon» (dazu kommt «Cevi»)
    const name = perJungschar ? group.name.replace(/^JS\s+/i, '') : ortsgruppe.name;

    const existing = await prisma.department.findUnique({
      where: { organization_hitobitoGroupId: { organization: provider, hitobitoGroupId: groupId } },
      select: { name: true, slug: true },
    });
    if (!existing) {
      return { eligible: true, reason: null, ortsgruppeId: groupId, ortsgruppeName: name, leaderGroupName, existingDepartment: null };
    }
    firstExisting ??= denied('EXISTS', { ortsgruppeId: groupId, ortsgruppeName: name, leaderGroupName, existingDepartment: existing });
  }

  return firstExisting ?? denied('NO_ORTSGRUPPE', { leaderGroupName });
}

/** Recht in der Abteilung der Subdomain prüfen (Abteilungsleitung und globale Admins haben alle) */
export async function requireDepartmentPermission(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply, permission: DepartmentPermission) {
  if (!request.tenant) {
    reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
    return null;
  }
  const access = await departmentAccess(fastify.prisma, request.tenant.id, request.user.id);
  if (!access.permissions.has(permission)) {
    reply.status(403).send({ error: `Dafür braucht es das Recht «${DEPARTMENT_PERMISSIONS[permission].label}».` });
    return null;
  }
  return { tenant: request.tenant, access };
}

/**
 * Darf `actor` diese Person bearbeiten (Stufen, Rechte, entfernen)? Abteilungsleitung und globale Admins
 * alle; sonst nur mit «Personen und Rechte verwalten» und nur Personen ohne Abteilungsleitung, nicht sich selbst
 * und nur mit weniger Rechten als man selbst.
 */
export function canEditPerson(
  actor: DepartmentAccess,
  actorId: string,
  target: { userId: string; role: string | null; permissions: string[] }
) {
  if (!actor.permissions.has('PEOPLE_MANAGE')) return false;
  if (actor.hasFullAccess) return true;
  if (target.userId === actorId || target.role === 'ADMIN') return false;
  return canGrantPermissions(actor, target.permissions);
}

export const homeSource = (source: string | null): 'CEVIDB' | 'CONFIRMED' | 'SELF' =>
  source === 'CEVIDB' || source === 'CONFIRMED' ? source : 'SELF';

/**
 * Zugehörigkeit bestätigen: für Cevi.DB-Personen, die die Abteilung selbst gewählt haben, weil ihre Rollen zu keiner
 * Abteilung führen (z. B. nur im Vorstand einer Ortsgruppe mit mehreren Jungscharen). Nur die Abteilungsleitung,
 * nie für sich selbst, und nur innerhalb derselben Ortsgruppe.
 */
export function canConfirmHome(
  actor: DepartmentAccess,
  actorId: string,
  target: {
    id: string;
    providerId?: string | null;
    ceviDbId?: number | null;
    ortsgruppeId?: number | null;
    ceviDbOrtsgruppeId?: number | null;
    homeDepartmentId: string | null;
    homeDepartmentSource: string | null;
  },
  departmentId: string,
  ortsgruppeId: number | null
) {
  return (
    actor.hasFullAccess &&
    target.id !== actorId &&
    (target.providerId != null || target.ceviDbId != null) &&
    target.homeDepartmentId === departmentId &&
    target.homeDepartmentSource === 'SELF' &&
    ortsgruppeId !== null &&
    (target.ortsgruppeId ?? target.ceviDbOrtsgruppeId) === ortsgruppeId
  );
}
