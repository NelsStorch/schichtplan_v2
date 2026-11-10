import {
  type OrganizationType,
  getOrganizationTypeFromHost,
} from './organizations.js';

export interface OrganizationVocabulary {
  /** Begriff für die Abteilung / Schar / den Verein (z. B. 'Abteilung', 'Schar', 'Verein') */
  department: string;
  /** Plural der Abteilung / Schar (z. B. 'Abteilungen', 'Scharen', 'Vereine') */
  departmentPlural: string;
  /** Begriff für die Leitung der Abteilung / Schar (z. B. 'Abteilungsleitung', 'Scharleitung', 'Vorstand') */
  departmentLeader: string;
  /** Singular für ein Mitglied (z. B. 'Cevianer*in', 'Pfadfinder*in', 'Jublaner*in', 'Mitglied') */
  member: string;
  /** Plural für Mitglieder (z. B. 'Cevianer*innen', 'Pfadfinder*innen', 'Jublaner*innen', 'Mitglieder') */
  memberPlural: string;
  /** Begriff für eine Untergruppe / Stufe / Einheit (z. B. 'Stufe', 'Einheit', 'Gruppe', 'Team') */
  group: string;
  /** Plural für Untergruppen (z. B. 'Stufen', 'Einheiten', 'Gruppen', 'Teams') */
  groupPlural: string;
  /** Begriff für die Leitung einer Untergruppe (z. B. 'Stufenleitung', 'Einheitsleitung', 'Gruppenleitung', 'Teamleitung') */
  groupLeader: string;
  /** Begriff für den Cevi-Namen / Pfadinamen / Spitznamen (z. B. 'Cevi-Name', 'Pfadiname', 'Leitername', 'Spitzname') */
  nickname: string;
  /** Name des Authentifizierungs-Providers (z. B. 'Cevi.DB', 'PBS MiData', 'Jubla-DB', 'E-Mail & Passwort') */
  authProvider: string;
}

export const VOCABULARIES: Record<OrganizationType, OrganizationVocabulary> = {
  CEVI: {
    department: 'Abteilung',
    departmentPlural: 'Abteilungen',
    departmentLeader: 'Abteilungsleitung',
    member: 'Cevianer*in',
    memberPlural: 'Cevianer*innen',
    group: 'Stufe',
    groupPlural: 'Stufen',
    groupLeader: 'Stufenleitung',
    nickname: 'Cevi-Name',
    authProvider: 'Cevi.DB',
  },
  PFADI: {
    department: 'Abteilung',
    departmentPlural: 'Abteilungen',
    departmentLeader: 'Abteilungsleitung',
    member: 'Pfadfinder*in',
    memberPlural: 'Pfadfinder*innen',
    group: 'Einheit',
    groupPlural: 'Einheiten',
    groupLeader: 'Einheitsleitung',
    nickname: 'Pfadiname',
    authProvider: 'PBS MiData',
  },
  JUBLA: {
    department: 'Schar',
    departmentPlural: 'Scharen',
    departmentLeader: 'Scharleitung',
    member: 'Jublaner*in',
    memberPlural: 'Jublaner*innen',
    group: 'Gruppe',
    groupPlural: 'Gruppen',
    groupLeader: 'Gruppenleitung',
    nickname: 'Leitername',
    authProvider: 'Jubla-DB',
  },
  OTHER: {
    department: 'Verein',
    departmentPlural: 'Vereine',
    departmentLeader: 'Vorstand',
    member: 'Mitglied',
    memberPlural: 'Mitglieder',
    group: 'Team',
    groupPlural: 'Teams',
    groupLeader: 'Teamleitung',
    nickname: 'Spitzname',
    authProvider: 'E-Mail & Passwort',
  },
};

/**
 * Liefert das verbandsspezifische Vokabular für einen OrganizationType.
 * Fallback ist immer CEVI.
 */
export function getVocabulary(orgType?: OrganizationType | string | null): OrganizationVocabulary {
  switch (orgType?.toUpperCase()) {
    case 'PFADI':
      return VOCABULARIES.PFADI;
    case 'JUBLA':
      return VOCABULARIES.JUBLA;
    case 'OTHER':
    case 'VEREIN':
      return VOCABULARIES.OTHER;
    default:
      return VOCABULARIES.CEVI;
  }
}

/**
 * Ermittelt das Vokabular anhand eines Hostnamens oder Slugs.
 */
export function getVocabularyFromHost(hostnameOrSlug?: string | null): OrganizationVocabulary {
  const orgType = getOrganizationTypeFromHost(hostnameOrSlug);
  return getVocabulary(orgType);
}
