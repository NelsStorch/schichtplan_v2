/**
 * Auswertung des Cevi.DB-Profils (`/oauth/profile` mit Scope `with_roles`).
 * Wird nur beim Cevi.DB-Login auf die frische Antwort angewendet (`deriveCeviDbFields`), nie auf `users.ceviDbData`.
 * Welche Rollen was bedeuten, steht in `config/cevidb.ts`.
 */
import type { CeviDbStufeDto } from '@schichtplan/shared';
import { cevidbConfig } from '../config/cevidb.js';

export interface CeviDbLeadership {
  /** Hat eine Rolle aus `departmentLeaderRoleClasses` */
  isLeader: boolean;
  /** Gruppen-ID der Ortsgruppe der Person (Feld `ortsgruppeField`) */
  ortsgruppeId: number | null;
  /** Gruppe, in der die Leitungsrolle liegt (z. B. "JS Illnau") */
  leaderGroupName: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Gültige Cevi.DB-Gruppen-ID oder null (die Zahl kann als Zahl oder Text ankommen). */
export function parseCeviDbGroupId(value: unknown): number | null {
  const id = typeof value === 'string' ? Number(value.trim() || NaN) : Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/** Gruppen-ID der Ortsgruppe aus dem Profil (konfiguriertes Feld, Standard `ortsgruppe_id`). */
export function ortsgruppeIdFromProfile(profile: unknown): number | null {
  return isRecord(profile) ? parseCeviDbGroupId(profile[cevidbConfig().ortsgruppeField]) : null;
}

function profileRoles(profile: unknown): Record<string, unknown>[] {
  return isRecord(profile) && Array.isArray(profile.roles) ? profile.roles.filter(isRecord) : [];
}

function roleClassOf(role: Record<string, unknown>): string | null {
  const roleClass = typeof role.role_class === 'string' ? role.role_class : role.role;
  return typeof roleClass === 'string' ? roleClass : null;
}

export function ceviDbLeadership(profile: unknown): CeviDbLeadership {
  const { departmentLeaderRoleClasses } = cevidbConfig();
  const leaderRole = profileRoles(profile).find((role) => {
    const roleClass = roleClassOf(role);
    return roleClass !== null && departmentLeaderRoleClasses.includes(roleClass);
  });

  return {
    isLeader: Boolean(leaderRole),
    ortsgruppeId: ortsgruppeIdFromProfile(profile),
    leaderGroupName: leaderRole && typeof leaderRole.group_name === 'string' ? leaderRole.group_name : null,
  };
}

const kindRank: Record<CeviDbStufeDto['kind'], number> = { LEITUNG: 0, TEILNEHMER: 1, ANDERE: 2 };

/**
 * Stufen der Person: alle Gruppen, in denen sie eine Rolle mit dem konfigurierten Präfix
 * (Standard `Group::Stufe::`) hat. Pro Stufe zählt die stärkste Rolle (Leitung vor Teilnehmer*in).
 * Die Haupt-Stufe (`primary_group_id` des Profils) steht zuerst.
 */
export function ceviDbStufen(profile: unknown): CeviDbStufeDto[] {
  const { stufeRoleClassPrefix, stufeLeaderRoles, stufeParticipantRoles } = cevidbConfig();
  const primaryGroupId = isRecord(profile) ? parseCeviDbGroupId(profile.primary_group_id) : null;
  const byGroup = new Map<number, CeviDbStufeDto>();

  for (const role of profileRoles(profile)) {
    const roleClass = roleClassOf(role);
    const groupId = parseCeviDbGroupId(role.group_id);
    if (roleClass === null || groupId === null || !roleClass.startsWith(stufeRoleClassPrefix)) continue;

    const roleKey = roleClass.slice(roleClass.lastIndexOf('::') + 2);
    const kind: CeviDbStufeDto['kind'] = stufeLeaderRoles.includes(roleKey)
      ? 'LEITUNG'
      : stufeParticipantRoles.includes(roleKey)
        ? 'TEILNEHMER'
        : 'ANDERE';
    const roleName = typeof role.role_name === 'string' ? role.role_name : roleKey;

    const existing = byGroup.get(groupId);
    if (!existing) {
      byGroup.set(groupId, {
        groupId,
        groupName: typeof role.group_name === 'string' ? role.group_name : `Gruppe ${groupId}`,
        kind,
        roleNames: [roleName],
        isPrimary: groupId === primaryGroupId,
      });
    } else {
      if (!existing.roleNames.includes(roleName)) existing.roleNames.push(roleName);
      if (kindRank[kind] < kindRank[existing.kind]) existing.kind = kind;
    }
  }

  return [...byGroup.values()].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      kindRank[a.kind] - kindRank[b.kind] ||
      a.groupName.localeCompare(b.groupName, 'de')
  );
}

/** Name der Ortsgruppe: Gruppe einer Rolle mit der ID der Ortsgruppe (z. B. «Illnau-Effretikon») */
function ortsgruppeNameFromProfile(profile: unknown, ortsgruppeId: number | null): string | null {
  if (ortsgruppeId === null) return null;
  const role = profileRoles(profile).find((r) => parseCeviDbGroupId(r.group_id) === ortsgruppeId);
  return role && typeof role.group_name === 'string' ? role.group_name : null;
}

export interface CeviDbDerived {
  ortsgruppeId: number | null;
  ortsgruppeName: string | null;
  isDepartmentLeader: boolean;
  leaderGroupName: string | null;
  stufen: CeviDbStufeDto[];
}

/**
 * Alles, was der Schichtplan aus dem Cevi.DB-Profil braucht. Wird nur direkt beim Login auf die frische
 * OAuth-Antwort angewendet und in eigene Spalten/Tabellen geschrieben (users.ceviDbData wird nie gelesen).
 */
export function deriveCeviDbFields(profile: unknown): CeviDbDerived {
  const leadership = ceviDbLeadership(profile);
  return {
    ortsgruppeId: leadership.ortsgruppeId,
    ortsgruppeName: ortsgruppeNameFromProfile(profile, leadership.ortsgruppeId),
    isDepartmentLeader: leadership.isLeader,
    leaderGroupName: leadership.leaderGroupName,
    stufen: ceviDbStufen(profile),
  };
}
