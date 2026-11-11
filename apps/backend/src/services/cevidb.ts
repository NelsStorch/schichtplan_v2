/**
 * Auswertung des Cevi.DB-Profils (`/oauth/profile` mit Scope `with_roles`).
 * Wird nur beim Cevi.DB-Login auf die frische Antwort angewendet (`deriveCeviDbFields`), das Rohprofil wird nicht gespeichert.
 * Welche Rollen was bedeuten, steht in `config/cevidb.ts`.
 *
 * Vertrauen: `roles` vergibt die Leitung in der Cevi.DB, `primary_group_id` lässt sich nur aus den eigenen Rollen
 * wählen. `ortsgruppe_id` dagegen kann jede Person im eigenen Profil frei ändern, und es wird nach der ersten Rolle
 * nie nachgeführt. Rechte und die Abteilung aus Cevi.DB hängen deshalb nur an den Rollen (`placeCeviDbPerson`).
 */
import {
  type CeviDbStufeDto,
  type OrganizationType,
  getHitobitoConfig,
  isDepartmentLeaderRole as isDepartmentLeaderRoleShared,
  isUnitRoleClass,
  getUnitRoleKey,
  classifyUnitRole,
} from '@schichtplan/shared';
import { cevidbConfig } from '../config/cevidb.js';

export interface CeviDbLeadership {
  /** Hat eine Rolle aus `departmentLeaderRoleClasses` */
  isLeader: boolean;
  /** Gruppen-ID der Ortsgruppe der Person (Feld `ortsgruppeField`) */
  ortsgruppeId: number | null;
  /** Gruppe, in der die Leitungsrolle liegt (z. B. "JS Illnau") */
  leaderGroupName: string | null;
  /** Alle Gruppen mit einer Leitungsrolle */
  leaderGroupIds: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Gültige Cevi.DB-Gruppen-ID oder null (die Zahl kann als Zahl oder Text ankommen). */
export function parseCeviDbGroupId(value: unknown): number | null {
  const id = typeof value === 'string' ? Number(value.trim() || NaN) : Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/** Gruppen-ID der Ortsgruppe / Schar / Abteilung aus dem Profil. */
export function ortsgruppeIdFromProfile(profile: unknown, orgType: OrganizationType = 'CEVI'): number | null {
  if (!isRecord(profile)) return null;
  const configuredField = orgType === 'CEVI' ? cevidbConfig().ortsgruppeField : getHitobitoConfig(orgType).ortsgruppeField;
  return (
    parseCeviDbGroupId(profile[configuredField]) ??
    parseCeviDbGroupId(profile.ortsgruppe_id) ??
    parseCeviDbGroupId(profile.abteilung_id) ??
    parseCeviDbGroupId(profile.schar_id)
  );
}

function profileRoles(profile: unknown): Record<string, unknown>[] {
  return isRecord(profile) && Array.isArray(profile.roles) ? profile.roles.filter(isRecord) : [];
}

function uniqueIds(ids: (number | null)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id !== null))];
}

function roleClassOf(role: Record<string, unknown>): string | null {
  const roleClass = typeof role.role_class === 'string' ? role.role_class : role.role;
  return typeof roleClass === 'string' ? roleClass : null;
}

/** Prüft, ob eine Rolle als Abteilungsleitung zählt (aus Konfiguration, Verband oder flexibler Suffix-Erkennung). */
export function isDepartmentLeaderRole(
  roleClass: string,
  configuredRolesOrOrg?: string[] | OrganizationType
): boolean {
  if (!roleClass || typeof roleClass !== 'string') return false;
  if (Array.isArray(configuredRolesOrOrg)) {
    if (configuredRolesOrOrg.includes(roleClass)) return true;
    const normalized = roleClass.toLowerCase();
    return (
      normalized.endsWith('::abteilungsleiter') ||
      normalized.endsWith('::abteilungsleiterin') ||
      normalized.endsWith('::abteilungsleitung') ||
      normalized.endsWith('::scharleiter') ||
      normalized.endsWith('::scharleiterin') ||
      normalized.endsWith('::scharleitung')
    );
  }
  return isDepartmentLeaderRoleShared(roleClass, configuredRolesOrOrg);
}

export function ceviDbLeadership(profile: unknown, orgType: OrganizationType = 'CEVI'): CeviDbLeadership {
  const configuredRoles =
    orgType === 'CEVI'
      ? cevidbConfig().departmentLeaderRoleClasses
      : getHitobitoConfig(orgType).departmentLeaderRoleClasses;

  const leaderRoles = profileRoles(profile).filter((role) => {
    const roleClass = roleClassOf(role);
    return (
      roleClass !== null &&
      (isDepartmentLeaderRole(roleClass, configuredRoles) || isDepartmentLeaderRoleShared(roleClass, orgType))
    );
  });
  const leaderRole = leaderRoles[0];

  const ortsgruppeId =
    ortsgruppeIdFromProfile(profile, orgType) ??
    (leaderRole ? parseCeviDbGroupId(leaderRole.group_id) : null);

  return {
    isLeader: Boolean(leaderRole),
    ortsgruppeId,
    leaderGroupName: leaderRole && typeof leaderRole.group_name === 'string' ? leaderRole.group_name : null,
    leaderGroupIds: uniqueIds(leaderRoles.map((role) => parseCeviDbGroupId(role.group_id))),
  };
}

const kindRank: Record<CeviDbStufeDto['kind'], number> = { LEITUNG: 0, TEILNEHMER: 1, ANDERE: 2 };

/**
 * Stufen / Einheiten der Person: alle Gruppen, in denen sie eine Rolle hat.
 * Pro Gruppe zählt die stärkste Rolle (Leitung vor Teilnehmer*in).
 * Die Haupt-Gruppe (`primary_group_id` des Profils) steht zuerst.
 */
export function ceviDbStufen(profile: unknown, orgType: OrganizationType = 'CEVI'): CeviDbStufeDto[] {
  const primaryGroupId = isRecord(profile) ? parseCeviDbGroupId(profile.primary_group_id) : null;
  const byGroup = new Map<number, CeviDbStufeDto>();
  const ceviCfg = orgType === 'CEVI' ? cevidbConfig() : null;

  for (const role of profileRoles(profile)) {
    const roleClass = roleClassOf(role);
    const groupId = parseCeviDbGroupId(role.group_id);
    if (roleClass === null || groupId === null) continue;

    // Scharleitungs- und Abteilungsleitungs-Rollen sind die Leitung der Organisation, keine Unter-Einheit/Stufe
    if (isDepartmentLeaderRole(roleClass, orgType)) continue;

    const isCeviStufe = ceviCfg ? roleClass.startsWith(ceviCfg.stufeRoleClassPrefix) : false;
    if (!isCeviStufe && !isUnitRoleClass(roleClass, orgType)) continue;

    const roleKey = getUnitRoleKey(roleClass);
    let kind: CeviDbStufeDto['kind'];
    if (ceviCfg && isCeviStufe) {
      kind = ceviCfg.stufeLeaderRoles.includes(roleKey)
        ? 'LEITUNG'
        : ceviCfg.stufeParticipantRoles.includes(roleKey)
          ? 'TEILNEHMER'
          : 'ANDERE';
    } else {
      kind = classifyUnitRole(roleClass, orgType);
    }
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

/** Gruppen aller Rollen (für die Gruppenstruktur beim Login) */
export function ceviDbRoleGroupIds(profile: unknown): number[] {
  return uniqueIds(profileRoles(profile).map((role) => parseCeviDbGroupId(role.group_id)));
}

/** Name der Ortsgruppe / Schar / Abteilung aus den Rollen des Profils */
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
  leaderGroupIds: number[];
  /** Gruppen aller Rollen der Person */
  roleGroupIds: number[];
  primaryGroupId: number | null;
  stufen: CeviDbStufeDto[];
}

/**
 * Alles, was der Schichtplan aus dem Hitobito-Profil (Cevi, Pfadi, Jubla) braucht.
 * Wird nur direkt beim Login auf die frische OAuth-Antwort angewendet und in eigene Spalten geschrieben.
 */
export function deriveCeviDbFields(profile: unknown, orgType: OrganizationType = 'CEVI'): CeviDbDerived {
  const leadership = ceviDbLeadership(profile, orgType);
  return {
    ortsgruppeId: leadership.ortsgruppeId,
    ortsgruppeName: ortsgruppeNameFromProfile(profile, leadership.ortsgruppeId),
    isDepartmentLeader: leadership.isLeader,
    leaderGroupName: leadership.leaderGroupName,
    leaderGroupIds: leadership.leaderGroupIds,
    roleGroupIds: ceviDbRoleGroupIds(profile),
    primaryGroupId: isRecord(profile) ? parseCeviDbGroupId(profile.primary_group_id) : null,
    stufen: ceviDbStufen(profile, orgType),
  };
}

/** Gruppe aus der Cevi.DB-Gruppenstruktur (Tabelle `cevidb_groups`) */
export interface CeviDbGroupInfo {
  id: number;
  name: string;
  jungscharId: number | null;
  ortsgruppeId: number | null;
  /** Nur bei Ortsgruppen: Anzahl Jungscharen */
  jungscharCount: number | null;
  /** Gruppentyp laut Gruppen-API (z. B. «Abteilung», «Region») */
  groupType?: string | null;
}

export interface CeviDbPlacement {
  /** Mindestens eine Rolle liegt nachweislich in einer Ortsgruppe */
  verified: boolean;
  /** Alle Gruppen der Rollen sind bekannt. Sonst ist ein fehlender Treffer keine Aussage. */
  complete: boolean;
  /** Heimabteilung laut Rollen; null, wenn keine Abteilung passt oder mehrere gleich gut passen */
  homeDepartmentId: string | null;
  /** Alle Abteilungen, in denen die Person Rollen hat */
  departmentIds: string[];
  /** Abteilungen mit Abteilungsleitung; null: nicht prüfbar, dann bleiben die Leitungen, wie sie sind */
  leaderDepartmentIds: string[] | null;
  /** Abteilung zum selbst änderbaren Feld `ortsgruppe_id`: nur eine Angabe der Person, gibt keine Cevi.DB-Rechte */
  selfDeclaredDepartmentId: string | null;
  ortsgruppeId: number | null;
  ortsgruppeName: string | null;
  jungscharIds: number[];
}

/**
 * Wohin gehört eine Person? Nur Rollen und Gruppenstruktur zählen. Eine Gruppe gehört zur Abteilung ihrer Jungschar,
 * sonst zur Abteilung ihrer Ortsgruppe (im Normalfall hat eine Ortsgruppe genau eine Jungschar und eine Abteilung).
 * Abteilungsleitung gibt es nur in der Jungschar der Rolle. Hängt die Abteilung noch an einer Ortsgruppe mit mehreren
 * Jungscharen, wäre nicht klar, für welchen Teil die Rolle gilt: Dann ist die Leitung «nicht prüfbar».
 */
export function placeCeviDbPerson(
  person: Pick<CeviDbDerived, 'roleGroupIds' | 'primaryGroupId' | 'leaderGroupIds' | 'ortsgruppeId'>,
  groups: ReadonlyMap<number, CeviDbGroupInfo>,
  departments: ReadonlyMap<number, string>,
  currentHomeDepartmentId: string | null
): CeviDbPlacement {
  const departmentOf = (groupId: number | null) => (groupId !== null ? departments.get(groupId) : undefined);
  const departmentOfGroup = (groupId: number): string | null => {
    const group = groups.get(groupId);
    if (!group) return null;
    return departmentOf(groupId) ?? departmentOf(group.jungscharId) ?? departmentOf(group.ortsgruppeId) ?? null;
  };

  const leaderDepartmentIds = (): string[] | null => {
    const ids = new Set<string>();
    for (const groupId of person.leaderGroupIds) {
      const group = groups.get(groupId);
      if (!group) return null;
      const direct = departmentOf(groupId);
      if (direct) {
        ids.add(direct);
        continue;
      }
      const ofJungschar = departmentOf(group.jungscharId);
      if (ofJungschar) {
        ids.add(ofJungschar);
        continue;
      }
      const ofOrtsgruppe = departmentOf(group.ortsgruppeId);
      if (!ofOrtsgruppe) continue;
      const jungscharCount = groups.get(group.ortsgruppeId!)?.jungscharCount ?? null;
      if (jungscharCount === null || jungscharCount > 1) return null;
      ids.add(ofOrtsgruppe);
    }
    return [...ids];
  };

  const known = person.roleGroupIds.flatMap((id) => groups.get(id) ?? []);
  const departmentIds = [
    ...new Set(person.roleGroupIds.map(departmentOfGroup).filter((id): id is string => id !== null)),
  ];
  const leaders = leaderDepartmentIds();

  const pool = leaders?.length ? leaders : departmentIds;
  const selfDeclared = departmentOf(person.ortsgruppeId) ?? null;
  let homeDepartmentId = person.primaryGroupId !== null ? departmentOfGroup(person.primaryGroupId) : null;
  if (!homeDepartmentId) {
    if (pool.length === 1) homeDepartmentId = pool[0];
    else if (currentHomeDepartmentId && pool.includes(currentHomeDepartmentId)) homeDepartmentId = currentHomeDepartmentId;
    // Nur noch Auswahl unter den eigenen Rollen: Dafür darf die Angabe der Person den Ausschlag geben
    else if (selfDeclared && pool.includes(selfDeclared)) homeDepartmentId = selfDeclared;
  }

  const anchorIds = [person.primaryGroupId, ...person.leaderGroupIds, ...person.roleGroupIds];
  const anchor = anchorIds
    .flatMap((id) => (id !== null ? (groups.get(id) ?? []) : []))
    .find((g) => g.ortsgruppeId !== null);
  const ortsgruppeId = anchor?.ortsgruppeId ?? null;

  return {
    verified: anchor !== undefined,
    complete: known.length === person.roleGroupIds.length,
    homeDepartmentId,
    departmentIds,
    leaderDepartmentIds: leaders,
    selfDeclaredDepartmentId: selfDeclared,
    ortsgruppeId,
    ortsgruppeName: ortsgruppeId !== null ? (groups.get(ortsgruppeId)?.name ?? null) : null,
    jungscharIds: uniqueIds(known.map((g) => g.jungscharId)),
  };
}
