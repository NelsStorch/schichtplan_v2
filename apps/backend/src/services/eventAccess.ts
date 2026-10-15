/**
 * Wer darf sich bei einem Anlass eintragen?
 *
 * Reihenfolge: Abteilungsleitung/Planer*in/Event-OK/globale Admins dürfen immer. Sonst braucht es ein Konto;
 * danach zählt ein eingelöster Zugangs-Link, sonst die Regeln des Zugangs-Typs (EVENT_ACCESS_TYPES):
 * Cevi.DB-Pflicht, Abteilung (eigene plus Whitelist), Stufen-Filter und «nur Leitende».
 */
import type { PrismaClient } from '@prisma/client';
import {
  accessTypeConfig,
  type EventAccessDto,
  type EventAccessReason,
} from '@schichtplan/shared';
import { ceviDbLeadership, ceviDbStufen } from './cevidb.js';

/** Was die Prüfung vom Anlass braucht */
export interface AccessEvent {
  id: string;
  departmentId: string;
  accessType: string;
  leadersOnly: boolean;
  allowPublicSignup: boolean;
  organizers: { userId: string; role: string }[];
  allowedDepartments: { departmentId: string; department: { name: string } }[];
  allowedStufen: { stufeId: string; stufe: { departmentId: string; name: string } }[];
}

export const accessEventInclude = {
  organizers: { select: { userId: true, role: true } },
  allowedDepartments: { include: { department: { select: { name: true } } } },
  allowedStufen: { include: { stufe: { select: { departmentId: true, name: true } } } },
} as const;

/** Was die Prüfung von der Person braucht */
export interface AccessUser {
  id: string;
  isGlobalAdmin: boolean;
  ceviDbId: number | null;
  ceviDbData: unknown;
  homeDepartmentId: string | null;
  homeDepartmentSource: string | null;
  stufen: { stufeId: string; role: string; source: string }[];
}

export const accessUserSelect = {
  id: true,
  isGlobalAdmin: true,
  ceviDbId: true,
  ceviDbData: true,
  homeDepartmentId: true,
  homeDepartmentSource: true,
  stufen: { select: { stufeId: true, role: true, source: true } },
} as const;

export interface ManagerFlags {
  /** Abteilungsleitung, Planer*in, Event-OK oder globaler Admin */
  isManager: boolean;
  /** Abteilungsleitung oder globaler Admin */
  isDeptAdmin: boolean;
  isOkLead: boolean;
}

/** Rollen der Person für diesen Anlass (Mitgliedschaft wird aus der DB gelesen) */
export async function managerFlags(
  prisma: Pick<PrismaClient, 'departmentMember'>,
  event: Pick<AccessEvent, 'departmentId' | 'organizers'>,
  user: { id: string; isGlobalAdmin: boolean } | null
): Promise<ManagerFlags> {
  if (!user) return { isManager: false, isDeptAdmin: false, isOkLead: false };
  const member = await prisma.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId: event.departmentId, userId: user.id } },
    select: { role: true },
  });
  const isDeptAdmin = user.isGlobalAdmin || member?.role === 'ADMIN';
  const isPlanner = member?.role === 'PLANNER';
  const organizer = event.organizers.find((o) => o.userId === user.id);
  return {
    isManager: isDeptAdmin || isPlanner || Boolean(organizer),
    isDeptAdmin,
    isOkLead: organizer?.role === 'OK_LEAD',
  };
}

/** Kurzbeschreibung, wer sich eintragen darf, z. B. «Cevi Illnau (Hiskia), nur Leitende» */
export function audienceLabel(event: AccessEvent, departmentName: string): string {
  const cfg = accessTypeConfig(event.accessType);
  const parts: string[] = [];
  if (cfg.scope === 'ANY') {
    parts.push(cfg.ceviDb ? 'alle mit Cevi.DB-Login' : 'alle mit Konto');
  } else {
    const departments = [
      { id: event.departmentId, name: departmentName },
      ...(cfg.whitelist
        ? event.allowedDepartments.map((a) => ({ id: a.departmentId, name: a.department.name }))
        : []),
    ];
    parts.push(
      departments
        .map((d) => {
          const stufen = event.allowedStufen.filter((s) => s.stufe.departmentId === d.id).map((s) => s.stufe.name);
          return stufen.length ? `${d.name} (${stufen.join(', ')})` : d.name;
        })
        .join(', ')
    );
    if (cfg.ceviDb) parts.push('mit Cevi.DB-Login');
  }
  if (event.leadersOnly) parts.push('nur Leitende');
  return parts.join(', ');
}

type RuleResult = { ok: true } | { ok: false; reason: EventAccessReason; message: string };

function checkRules(event: AccessEvent, user: AccessUser, departmentName: string): RuleResult {
  const cfg = accessTypeConfig(event.accessType);
  const audience = audienceLabel(event, departmentName);
  const deny = (reason: EventAccessReason, message: string): RuleResult => ({ ok: false, reason, message });

  if (cfg.ceviDb && user.ceviDbId === null) {
    return deny('CEVIDB_REQUIRED', 'Für diesen Anlass brauchst du einen Cevi.DB-Login. Melde dich bitte mit Cevi.DB an.');
  }

  // Bei Cevi.DB-Typen zählen nur Abteilung und Stufen aus Cevi.DB, sonst auch selbst angegebene
  const stufen = cfg.ceviDb ? user.stufen.filter((s) => s.source === 'CEVIDB') : user.stufen;
  let relevantStufen = stufen;

  if (cfg.scope === 'DEPARTMENT') {
    const allowedDepartmentIds = new Set([
      event.departmentId,
      ...(cfg.whitelist ? event.allowedDepartments.map((a) => a.departmentId) : []),
    ]);
    const personDepartmentId =
      cfg.ceviDb && user.homeDepartmentSource !== 'CEVIDB' ? null : user.homeDepartmentId;

    if (!personDepartmentId) {
      return cfg.ceviDb
        ? deny('WRONG_DEPARTMENT', `Laut Cevi.DB gehörst du nicht dazu. Eintragen dürfen: ${audience}.`)
        : deny('NO_DEPARTMENT', `Gib zuerst an, zu welcher Abteilung du gehörst. Eintragen dürfen: ${audience}.`);
    }
    if (!allowedDepartmentIds.has(personDepartmentId)) {
      return deny('WRONG_DEPARTMENT', `Dieser Anlass ist nur für ${audience}.`);
    }

    // Stufen-Filter gilt pro Abteilung: hat die Abteilung der Person ausgewählte Stufen, muss sie in einer davon sein
    const filter = event.allowedStufen.filter((s) => s.stufe.departmentId === personDepartmentId);
    if (filter.length > 0) {
      const filterIds = new Set(filter.map((s) => s.stufeId));
      relevantStufen = stufen.filter((s) => filterIds.has(s.stufeId));
      if (relevantStufen.length === 0) {
        return deny('WRONG_STUFE', `Dieser Anlass ist nur für ${audience}. Deine Stufe ist nicht dabei.`);
      }
    }
  }

  if (event.leadersOnly) {
    const leadsStufe = relevantStufen.some((s) => s.role === 'LEITUNG');
    // Abteilungsleitung laut Cevi.DB zählt immer, bei «alle Abteilungen» auch jede Stufenleitung aus Cevi.DB
    const ceviDbLeader =
      user.ceviDbId !== null &&
      (ceviDbLeadership(user.ceviDbData).isLeader ||
        (cfg.scope === 'ANY' && ceviDbStufen(user.ceviDbData).some((s) => s.kind === 'LEITUNG')));
    if (!leadsStufe && !ceviDbLeader) {
      return deny('LEADERS_ONLY', 'Dieser Anlass ist nur für Leitende.');
    }
  }

  return { ok: true };
}

/**
 * Darf die Person sich eintragen? `user` null = nicht angemeldet.
 * `hasGrant` = hat einen gültigen Zugangs-Link eingelöst.
 */
export function evaluateEventAccess(
  event: AccessEvent,
  departmentName: string,
  user: AccessUser | null,
  flags: ManagerFlags,
  hasGrant: boolean
): EventAccessDto {
  const isPublicAudience = accessTypeConfig(event.accessType).scope === 'ANY';
  const result = (
    canSignup: boolean,
    via: EventAccessDto['via'],
    reason: EventAccessReason | null,
    message: string | null,
    canSeeNames: boolean
  ): EventAccessDto => ({ canSignup, via, reason, message, canSeeNames, isManager: flags.isManager });

  if (flags.isManager) return result(true, 'MANAGER', null, null, true);

  if (!user) {
    return result(
      false,
      null,
      'LOGIN_REQUIRED',
      'Zum Eintragen brauchst du ein Konto. Ein Cevi-Name ohne Passwort reicht.',
      isPublicAudience
    );
  }

  const rules = hasGrant ? ({ ok: true } as const) : checkRules(event, user, departmentName);
  const canSeeNames = rules.ok || isPublicAudience;

  if (!event.allowPublicSignup) {
    return result(false, null, 'SIGNUP_CLOSED', 'Eintragen ist geschlossen. Melde dich beim OK.', canSeeNames);
  }
  if (!rules.ok) return result(false, null, rules.reason, rules.message, canSeeNames);
  return result(true, hasGrant ? 'LINK' : 'RULES', null, null, true);
}

/** Hat die Person einen gültigen Zugangs-Link für den Anlass eingelöst? */
export async function hasValidGrant(
  prisma: Pick<PrismaClient, 'eventAccessGrant'>,
  eventId: string,
  userId: string
): Promise<boolean> {
  const grant = await prisma.eventAccessGrant.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { link: { select: { expiresAt: true } } },
  });
  return Boolean(grant && (!grant.link.expiresAt || grant.link.expiresAt > new Date()));
}
