/**
 * Wer darf sich bei einem Anlass eintragen?
 *
 * Reihenfolge: wer den Anlass verwalten darf (Abteilungsleitung, OK, «Alle Anlässe sehen», globale Admins) darf immer. Sonst braucht es ein Konto;
 * danach zählt ein eingelöster Zugangs-Link, sonst die Regeln des Zugangs-Typs (EVENT_ACCESS_TYPES):
 * Cevi.DB-Pflicht, Abteilung (eigene plus Whitelist), Stufen-Filter und «nur Leitende».
 */
import type { PrismaClient } from '../db.js';
import {
  accessTypeConfig,
  formatZurichDateTime,
  isSignupTimeOpen,
  EVENT_CAPABILITIES,
  type EventAccessDto,
  type EventAccessReason,
  type EventCapability,
} from '@schichtplan/shared';
import { accessFrom, eventCapabilities } from './permissions.js';

/** Was die Prüfung vom Anlass braucht */
export interface AccessEvent {
  id: string;
  departmentId: string;
  accessType: string;
  leadersOnly: boolean;
  allowPublicSignup: boolean;
  signupOpensAt?: Date | null;
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
/**
 * Zählt die Heimabteilung bei Cevi.DB-Anlässen? Aus Cevi.DB oder von der Abteilungsleitung bestätigt
 * (Personen, deren Rollen keiner Abteilung zuzuordnen sind, z. B. nur im Vorstand).
 */
export function isVerifiedHomeSource(source: string | null): boolean {
  return source === 'CEVIDB' || source === 'CONFIRMED';
}

export interface AccessUser {
  id: string;
  isGlobalAdmin: boolean;
  providerId?: string | null;
  ceviDbId?: number | null;
  /** Abteilungsleitung laut Provider/Hitobito (beim Login gespeichert) */
  departmentLeader?: boolean;
  ceviDbDepartmentLeader?: boolean;
  /** Stufen-Rollen laut Provider, auch in Stufen, die keine Abteilung erfasst hat */
  hitobitoStufen?: { kind: string }[];
  ceviDbStufen?: { kind: string }[];
  homeDepartmentId: string | null;
  homeDepartmentSource: string | null;
  /** Beitrittsmodus der Heimabteilung: Bei INVITE_ONLY zählt eine unbestätigte Selbstzuordnung nicht */
  homeDepartment?: { joinMode?: string | null } | null;
  /**
   * Zusätzliche Mitgliedschaften (department_members). Zählen nur mit joinedAt; bei INVITE_ONLY bzw.
   * Cevi.DB-Anlässen nur bestätigt. Fehlt das Feld, zählt nur die Heimabteilung.
   */
  memberships?: {
    departmentId: string;
    joinedAt?: Date | null;
    confirmedAt?: Date | null;
    department?: { joinMode?: string | null } | null;
  }[];
  stufen: { stufeId: string; role: string; source: string }[];
}

/** Abteilungen, denen die Person zusätzlich zur Heimabteilung angehört (für Abteilungs-Regeln) */
export function joinedDepartmentIds(user: Pick<AccessUser, 'memberships'>, requireVerified = false): string[] {
  return (user.memberships ?? [])
    .filter(
      (m) =>
        Boolean(m.joinedAt) &&
        (Boolean(m.confirmedAt) || (!requireVerified && m.department?.joinMode !== 'INVITE_ONLY'))
    )
    .map((m) => m.departmentId);
}

/** Alle Abteilungen, die für Abteilungs-Regeln zählen: Heimabteilung und Beitritte */
export function personDepartmentIds(
  user: Pick<AccessUser, 'homeDepartmentId' | 'homeDepartmentSource' | 'homeDepartment' | 'memberships'>,
  requireVerified = false
): string[] {
  const home = effectiveHomeDepartmentId(user, requireVerified);
  return [...new Set([...(home ? [home] : []), ...joinedDepartmentIds(user, requireVerified)])];
}

/**
 * Heimabteilung, die für Abteilungs-Regeln zählt. Selbst angegeben (SELF) zählt nicht bei Cevi.DB-Anlässen
 * und nicht bei Abteilungen, die nur per Einladung aufnehmen (INVITE_ONLY).
 */
export function effectiveHomeDepartmentId(
  user: Pick<AccessUser, 'homeDepartmentId' | 'homeDepartmentSource' | 'homeDepartment'>,
  requireVerified = false
): string | null {
  if (!user.homeDepartmentId) return null;
  if (isVerifiedHomeSource(user.homeDepartmentSource)) return user.homeDepartmentId;
  if (requireVerified || user.homeDepartment?.joinMode === 'INVITE_ONLY') return null;
  return user.homeDepartmentId;
}

export const accessUserSelect = {
  id: true,
  isGlobalAdmin: true,
  providerId: true,
  departmentLeader: true,
  hitobitoStufen: { select: { kind: true } },
  homeDepartmentId: true,
  homeDepartmentSource: true,
  homeDepartment: { select: { joinMode: true } },
  memberships: {
    where: { joinedAt: { not: null } },
    select: { departmentId: true, joinedAt: true, confirmedAt: true, department: { select: { joinMode: true } } },
  },
  stufen: { select: { stufeId: true, role: true, source: true } },
} as const;

export interface ManagerFlags {
  /** Darf den OK-Bereich sehen (Kontaktangaben, Entwürfe): irgendeine Fähigkeit im Anlass */
  isManager: boolean;
  /** Abteilungsleitung oder globaler Admin */
  isDeptAdmin: boolean;
  isOkLead: boolean;
  /** Einzelne Fähigkeiten im Anlass (aus OK-Rolle und Abteilungsrechten) */
  can: Record<EventCapability, boolean>;
}

const noCapabilities = () =>
  Object.fromEntries(EVENT_CAPABILITIES.map((c) => [c, false])) as Record<EventCapability, boolean>;

/** Rechte der Person für diesen Anlass (Mitgliedschaft wird aus der DB gelesen) */
export async function managerFlags(
  prisma: Pick<PrismaClient, 'departmentMember'>,
  event: Pick<AccessEvent, 'departmentId' | 'organizers'>,
  user: { id: string; isGlobalAdmin: boolean } | null
): Promise<ManagerFlags> {
  if (!user) return { isManager: false, isDeptAdmin: false, isOkLead: false, can: noCapabilities() };
  const member = await prisma.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId: event.departmentId, userId: user.id } },
    select: { role: true, permissions: true },
  });
  const access = accessFrom(member, user.isGlobalAdmin);
  const organizer = event.organizers.find((o) => o.userId === user.id);
  const caps = eventCapabilities(access, organizer?.role);
  const can = noCapabilities();
  for (const c of caps) can[c] = true;
  return {
    isManager: can.VIEW,
    isDeptAdmin: access.hasFullAccess,
    isOkLead: organizer?.role === 'OK_LEAD',
    can,
  };
}

/** Fähigkeiten als Liste für das Frontend */
export const capabilityList = (flags: ManagerFlags): EventCapability[] =>
  EVENT_CAPABILITIES.filter((c) => flags.can[c]);

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

export type RuleResult = { ok: true } | { ok: false; reason: EventAccessReason; message: string };

export function checkRules(event: AccessEvent, user: AccessUser, departmentName: string): RuleResult {
  const cfg = accessTypeConfig(event.accessType);
  const audience = audienceLabel(event, departmentName);
  const deny = (reason: EventAccessReason, message: string): RuleResult => ({ ok: false, reason, message });

  const hasProviderId = user.providerId !== null && user.providerId !== undefined ? Boolean(user.providerId) : user.ceviDbId !== null && user.ceviDbId !== undefined;
  if (cfg.ceviDb && !hasProviderId) {
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
    const personDepartments = personDepartmentIds(user, cfg.ceviDb);

    if (personDepartments.length === 0) {
      const hasUnconfirmed = Boolean(user.homeDepartmentId) || (user.memberships ?? []).some((m) => m.joinedAt);
      if (!cfg.ceviDb && hasUnconfirmed) {
        return deny(
          'WRONG_DEPARTMENT',
          `Deine Zugehörigkeit zur Abteilung ist noch nicht bestätigt. Eintragen dürfen: ${audience}.`
        );
      }
      return cfg.ceviDb
        ? deny('WRONG_DEPARTMENT', `Laut Cevi.DB gehörst du nicht dazu. Eintragen dürfen: ${audience}.`)
        : deny('NO_DEPARTMENT', `Gib zuerst an, zu welcher Abteilung du gehörst. Eintragen dürfen: ${audience}.`);
    }
    const matching = personDepartments.filter((id) => allowedDepartmentIds.has(id));
    if (matching.length === 0) {
      return deny('WRONG_DEPARTMENT', `Dieser Anlass ist nur für ${audience}.`);
    }

    // Stufen-Filter gilt pro Abteilung: hat eine Abteilung der Person ausgewählte Stufen, muss sie in einer davon
    // sein. Bei mehreren Abteilungen reicht eine, die passt.
    let unfiltered = false;
    const filtered = new Map<string, (typeof stufen)[number]>();
    for (const departmentId of matching) {
      const filter = event.allowedStufen.filter((s) => s.stufe.departmentId === departmentId);
      if (filter.length === 0) {
        unfiltered = true;
        continue;
      }
      const filterIds = new Set(filter.map((s) => s.stufeId));
      for (const s of stufen) if (filterIds.has(s.stufeId)) filtered.set(s.stufeId, s);
    }
    if (!unfiltered) {
      relevantStufen = [...filtered.values()];
      if (relevantStufen.length === 0) {
        return deny('WRONG_STUFE', `Dieser Anlass ist nur für ${audience}. Deine Stufe ist nicht dabei.`);
      }
    }
  }

  if (event.leadersOnly) {
    const leadsStufe = relevantStufen.some((s) => s.role === 'LEITUNG');
    // Abteilungsleitung laut Provider/Hitobito zählt immer, bei «alle Abteilungen» auch jede Stufenleitung
    const isDeptLeader = user.departmentLeader ?? user.ceviDbDepartmentLeader ?? false;
    const hitobitoStufen = user.hitobitoStufen ?? user.ceviDbStufen ?? [];
    const ceviDbLeader =
      hasProviderId &&
      (isDeptLeader ||
        (cfg.scope === 'ANY' && hitobitoStufen.some((s) => s.kind === 'LEITUNG')));
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
  ): EventAccessDto => ({
    canSignup,
    via,
    reason,
    message,
    canSeeNames,
    isManager: flags.isManager,
    capabilities: capabilityList(flags),
  });

  if (flags.isManager) return result(true, 'MANAGER', null, null, true);

  const rules = user ? (hasGrant ? ({ ok: true } as const) : checkRules(event, user, departmentName)) : null;
  const canSeeNames = rules ? rules.ok || isPublicAudience : isPublicAudience;

  if (!event.allowPublicSignup) {
    return result(false, null, 'SIGNUP_CLOSED', 'Eintragen ist geschlossen. Melde dich beim OK.', canSeeNames);
  }

  if (event.signupOpensAt && !isSignupTimeOpen(event.signupOpensAt)) {
    const formatted = formatZurichDateTime(event.signupOpensAt);
    return result(
      false,
      null,
      'SIGNUP_NOT_YET_OPEN',
      `Das Eintragen öffnet am ${formatted}.`,
      canSeeNames
    );
  }

  if (!user) {
    return result(
      false,
      null,
      'LOGIN_REQUIRED',
      'Zum Eintragen brauchst du ein Konto. Ein Cevi-Name ohne Passwort reicht.',
      isPublicAudience
    );
  }

  if (!rules?.ok) return result(false, null, rules?.reason ?? null, rules?.message ?? null, canSeeNames);
  return result(true, hasGrant ? 'LINK' : 'RULES', null, null, true);
}

/**
 * Hat die Person einen gültigen Zugangs-Link für den Anlass eingelöst?
 * Hinweis: expiresAt des Links ist eine reine Einlösefrist. Ein bereits eingelöster
 * Grant bleibt gültig, bis das OK den Link löscht.
 */
export async function hasValidGrant(
  prisma: Pick<PrismaClient, 'eventAccessGrant'>,
  eventId: string,
  userId: string
): Promise<boolean> {
  const grant = await prisma.eventAccessGrant.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });
  return Boolean(grant);
}
