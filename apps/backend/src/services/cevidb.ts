/**
 * Auswertung des Cevi.DB-Profils (`/oauth/profile` mit Scope `with_roles`).
 * Das Profil wird beim Cevi.DB-Login in `users.ceviDbData` gespeichert.
 */

/**
 * Cevi.DB-Rollen (`role_class`), die als Abteilungsleitung gelten und damit für ihre Ortsgruppe
 * eine Abteilung (Subdomain) anlegen dürfen. Weitere Rollen hier ergänzen.
 */
export const DEPARTMENT_LEADER_ROLE_CLASSES: readonly string[] = ['Group::Jungschar::Abteilungsleiter'];

export interface CeviDbLeadership {
  /** Hat eine Rolle aus DEPARTMENT_LEADER_ROLE_CLASSES */
  isLeader: boolean;
  /** `ortsgruppe_id` der Person: Cevi.DB-Gruppe, zu der ihre Abteilung gehört */
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

export function ceviDbLeadership(profile: unknown): CeviDbLeadership {
  if (!isRecord(profile)) return { isLeader: false, ortsgruppeId: null, leaderGroupName: null };

  const roles = Array.isArray(profile.roles) ? profile.roles.filter(isRecord) : [];
  const leaderRole = roles.find((role) => {
    const roleClass = typeof role.role_class === 'string' ? role.role_class : role.role;
    return typeof roleClass === 'string' && DEPARTMENT_LEADER_ROLE_CLASSES.includes(roleClass);
  });

  return {
    isLeader: Boolean(leaderRole),
    ortsgruppeId: parseCeviDbGroupId(profile.ortsgruppe_id),
    leaderGroupName: leaderRole && typeof leaderRole.group_name === 'string' ? leaderRole.group_name : null,
  };
}
