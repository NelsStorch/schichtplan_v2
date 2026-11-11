import {
  type OrganizationType,
  getOrganizationTypeFromHost,
} from './organizations.js';

/**
 * Standard-Scopes für Hitobito OAuth2.
 * Wichtig: `groups` ist zwingend erforderlich, um Gruppenstruktur und Untergruppen abzufragen!
 */
export const DEFAULT_HITOBITO_SCOPES = 'email name with_roles groups';

export interface HitobitoConfig {
  /** Verbands-Typ (CEVI, PFADI, JUBLA, OTHER) */
  orgType: OrganizationType;
  /** Name der Hitobito-Instanz (z. B. 'Cevi.DB', 'PBS MiData', 'Jubla-DB') */
  name: string;
  /** OAuth2-Scopes (standardmässig `email name with_roles groups`) */
  oauthScopes: string;
  /** Profilfeld mit der ID der Stamm- bzw. Ortsgruppe / Schar */
  ortsgruppeField: string;
  /** Standard-BaseURL der Hitobito-Instanz */
  defaultBaseUrl: string;
  /** Typen von Gruppen in Hitobito, die eine Abteilung / Schar darstellen (inkl. Region und Kantonalverband) */
  departmentGroupTypes: string[];
  /**
   * Dieselben Gruppentypen, wie sie die Gruppen-API (`/groups/{id}.json`, Feld `group_type`) liefert: übersetzt, auf
   * Deutsch. Eine Rolle gehört zur nächsten Gruppe dieser Typen über ihr. Auch Regionen und Kantonalverbände können
   * so einen eigenen Schichtplan haben, geleitet von der Regions- bzw. Kantonsleitung.
   */
  departmentGroupLabels: string[];
  /** Nur Cevi: Zwischenebene unter der Ortsgruppe (Jungschar), sonst leer */
  jungscharGroupLabels: string[];
  /** Voll qualifizierte Rollen-Klassen (`roles[].role_class`), die als Abteilungsleitung / Scharleitung gelten */
  departmentLeaderRoleClasses: string[];
  /** Namensendungen (Suffixe) von Rollen, die als Leitung gelten (Groß-/Kleinschreibung tolerant) */
  departmentLeaderSuffixes: string[];
  /** Präfixe von Rollen, die zu einer Stufe / Einheit / Kindergruppe gehören */
  unitRoleClassPrefixes: string[];
  /** Rollenbezeichnungen (letzter Teil nach ::), die als Leitung einer Stufe / Einheit gelten */
  unitLeaderRoles: string[];
  /** Rollenbezeichnungen (letzter Teil nach ::), die als Teilnehmer*in einer Stufe / Einheit gelten */
  unitParticipantRoles: string[];

  // -------------------------------------------------------------------------
  // Abwärtskompatibilitäts-Aliase für bestehenden Cevi.DB-Code
  // -------------------------------------------------------------------------
  /** Alias für `unitRoleClassPrefixes[0]` */
  stufeRoleClassPrefix?: string;
  /** Alias für `unitLeaderRoles` */
  stufeLeaderRoles?: string[];
  /** Alias für `unitParticipantRoles` */
  stufeParticipantRoles?: string[];
}

/**
 * Leitung der Cevi-Ebenen über der Ortsgruppe (Mitgliederorganisation, Sektion): Sie darf dort einen Schichtplan
 * anlegen. Reine Datenpflege-Rollen (Administrator der Mitgliederorganisation, AdminOrtsgruppen) zählen nicht.
 */
export const CEVI_REGIONAL_LEADER_ROLE_CLASSES = [
  'Group::MitgliederorganisationGeschaeftsstelle::Geschaeftsleiter',
  'Group::MitgliederorganisationVorstand::Praesidium',
  'Group::Sektion::Administrator',
];

export const HITOBITO_CEVI_CONFIG: HitobitoConfig = {
  orgType: 'CEVI',
  name: 'Cevi.DB',
  oauthScopes: DEFAULT_HITOBITO_SCOPES,
  ortsgruppeField: 'ortsgruppe_id',
  defaultBaseUrl: 'https://db.cevi.ch',
  departmentGroupTypes: [
    'Group::Jungschar',
    'Group::Abteilung',
    'Group::Ortsgruppe',
  ],
  // Struktur laut hitobito_cevi: Dachverband → Mitgliederorganisation (z. B. Cevi Region Zürich) → Sektion (optional)
  // → Ortsgruppe → Jungschar → Stufe. Mitgliederorganisation und Sektion können einen eigenen Schichtplan haben.
  departmentGroupLabels: ['Ortsgruppe', 'Mitgliederorganisation', 'Sektion'],
  jungscharGroupLabels: ['Jungschar'],
  departmentLeaderRoleClasses: [
    'Group::Jungschar::Abteilungsleiter',
    'Group::Jungschar::Abteilungsleiterin',
    'Group::Abteilung::Abteilungsleiter',
    'Group::Abteilung::Abteilungsleiterin',
    'Group::Ortsgruppe::Abteilungsleiter',
    'Group::Ortsgruppe::Abteilungsleiterin',
    ...CEVI_REGIONAL_LEADER_ROLE_CLASSES,
  ],
  departmentLeaderSuffixes: [
    '::abteilungsleiter',
    '::abteilungsleiterin',
    '::abteilungsleitung',
  ],
  unitRoleClassPrefixes: [
    'Group::Stufe::',
  ],
  unitLeaderRoles: [
    'Gruppenleiter',
    'Gruppenleiterin',
    'Gruppenleitung',
    'Stufenleiter',
    'Stufenleiterin',
    'Stufenleitung',
    'MiniChef',
    'Minigruppenleiter',
    'Helfer',
  ],
  unitParticipantRoles: [
    'Teilnehmer',
    'Teilnehmerin',
  ],
  get stufeRoleClassPrefix() {
    return this.unitRoleClassPrefixes[0];
  },
  get stufeLeaderRoles() {
    return this.unitLeaderRoles;
  },
  get stufeParticipantRoles() {
    return this.unitParticipantRoles;
  },
};

export const HITOBITO_PFADI_CONFIG: HitobitoConfig = {
  orgType: 'PFADI',
  name: 'PBS MiData',
  oauthScopes: DEFAULT_HITOBITO_SCOPES,
  ortsgruppeField: 'abteilung_id',
  defaultBaseUrl: 'https://db.scout.ch',
  // Struktur laut hitobito_pbs: Bund → Kantonalverband → Region (verschachtelbar) → Abteilung → Biber, Wölfe, Pfadi,
  // Pio, Rover, PTA. Abteilungen hängen unter einer Region oder direkt unter dem Kantonalverband.
  departmentGroupTypes: ['Group::Abteilung', 'Group::Region', 'Group::Kantonalverband'],
  departmentGroupLabels: ['Abteilung', 'Region', 'Kantonalverband'],
  jungscharGroupLabels: [],
  // Nur Rollen mit Schreibrechten auf die Ebene (layer_and_below_full). Präsidium und Vizepräsidium dürfen in
  // MiData nur lesen und werden darum hier nicht Leitung.
  departmentLeaderRoleClasses: [
    'Group::Abteilung::Abteilungsleitung',
    'Group::Abteilung::AbteilungsleitungStv',
    'Group::Abteilung::Sekretariat',
    'Group::Region::Regionalleitung',
    'Group::Kantonalverband::Kantonsleitung',
  ],
  departmentLeaderSuffixes: [
    '::abteilungsleitung',
    '::abteilungsleitungstv',
    '::regionalleitung',
    '::kantonsleitung',
  ],
  unitRoleClassPrefixes: [
    'Group::Biber::',
    'Group::Woelfe::',
    'Group::Pfadi::',
    'Group::Pio::',
    'Group::AbteilungsRover::',
    'Group::Rover::',
    'Group::Pta::',
  ],
  unitLeaderRoles: ['Einheitsleitung', 'Mitleitung'],
  // Leitwolf und Leitpfadi führen als Kinder eine Gruppe innerhalb der Stufe: Sie sind Teilnehmende
  unitParticipantRoles: ['Biber', 'Wolf', 'Leitwolf', 'Pfadi', 'Leitpfadi', 'Pio', 'Rover', 'Mitglied'],
  get stufeRoleClassPrefix() {
    return this.unitRoleClassPrefixes[0];
  },
  get stufeLeaderRoles() {
    return this.unitLeaderRoles;
  },
  get stufeParticipantRoles() {
    return this.unitParticipantRoles;
  },
};

export const HITOBITO_JUBLA_CONFIG: HitobitoConfig = {
  orgType: 'JUBLA',
  name: 'Jubla-DB',
  oauthScopes: DEFAULT_HITOBITO_SCOPES,
  ortsgruppeField: 'schar_id',
  defaultBaseUrl: 'https://db.jubla.ch',
  // Struktur laut hitobito_jubla: Bund → Kanton → Region → Schar (Flock) → Kindergruppen. Scharen hängen unter einer
  // Region oder direkt unter dem Kanton. Die Leitung von Region und Kanton sitzt in einer eigenen Untergruppe
  // (Regionalleitung / Kantonsleitung), die Rolle zählt darum für die Region bzw. den Kanton darüber.
  departmentGroupTypes: ['Group::Flock', 'Group::Region', 'Group::State'],
  departmentGroupLabels: ['Schar', 'Region', 'Kanton'],
  jungscharGroupLabels: [],
  // Präses (President) darf in der Jubla-DB nur lesen und wird darum hier nicht Leitung
  departmentLeaderRoleClasses: [
    'Group::Flock::Leader',
    'Group::Flock::CampLeader',
    'Group::RegionalBoard::Leader',
    'Group::StateBoard::Leader',
  ],
  departmentLeaderSuffixes: [
    '::flock::leader',
    '::flock::campleader',
    '::regionalboard::leader',
    '::stateboard::leader',
  ],
  unitRoleClassPrefixes: ['Group::ChildGroup::'],
  unitLeaderRoles: ['Leader'],
  unitParticipantRoles: ['Child'],
  get stufeRoleClassPrefix() {
    return this.unitRoleClassPrefixes[0];
  },
  get stufeLeaderRoles() {
    return this.unitLeaderRoles;
  },
  get stufeParticipantRoles() {
    return this.unitParticipantRoles;
  },
};

export const HITOBITO_OTHER_CONFIG: HitobitoConfig = {
  orgType: 'OTHER',
  name: 'Verein',
  oauthScopes: DEFAULT_HITOBITO_SCOPES,
  ortsgruppeField: 'verein_id',
  defaultBaseUrl: '',
  departmentGroupTypes: ['Group::Verein'],
  departmentGroupLabels: [],
  jungscharGroupLabels: [],
  departmentLeaderRoleClasses: ['Vorstand', 'Praesident', 'Praesidentin'],
  departmentLeaderSuffixes: ['::vorstand', '::praesident', '::praesidentin'],
  unitRoleClassPrefixes: ['Group::Team::', 'Group::Gruppe::'],
  unitLeaderRoles: ['Teamleiter', 'Teamleiterin', 'Teamleitung', 'Gruppenleiter', 'Gruppenleiterin'],
  unitParticipantRoles: ['Mitglied', 'Teilnehmer', 'Teilnehmerin'],
  get stufeRoleClassPrefix() {
    return this.unitRoleClassPrefixes[0];
  },
  get stufeLeaderRoles() {
    return this.unitLeaderRoles;
  },
  get stufeParticipantRoles() {
    return this.unitParticipantRoles;
  },
};

export const HITOBITO_CONFIGS: Record<OrganizationType, HitobitoConfig> = {
  CEVI: HITOBITO_CEVI_CONFIG,
  PFADI: HITOBITO_PFADI_CONFIG,
  JUBLA: HITOBITO_JUBLA_CONFIG,
  OTHER: HITOBITO_OTHER_CONFIG,
};

/**
 * Liefert die Hitobito-Konfiguration für einen OrganizationType.
 * Fallback ist CEVI.
 */
export function getHitobitoConfig(orgType?: OrganizationType | string | null): HitobitoConfig {
  switch (orgType?.toUpperCase()) {
    case 'PFADI':
      return HITOBITO_PFADI_CONFIG;
    case 'JUBLA':
      return HITOBITO_JUBLA_CONFIG;
    case 'OTHER':
    case 'VEREIN':
      return HITOBITO_OTHER_CONFIG;
    default:
      return HITOBITO_CEVI_CONFIG;
  }
}

/**
 * Liefert die Hitobito-Konfiguration anhand eines Hostnamens oder Slugs.
 */
export function getHitobitoConfigFromHost(hostnameOrSlug?: string | null): HitobitoConfig {
  const orgType = getOrganizationTypeFromHost(hostnameOrSlug);
  return getHitobitoConfig(orgType);
}

/**
 * Prüft, ob eine Rolle als Abteilungsleitung / Scharleitung / Admin gilt.
 *
 * Kann aufgerufen werden mit:
 * 1. `isDepartmentLeaderRole(roleClass, 'PFADI')`
 * 2. `isDepartmentLeaderRole(roleClass, ['Custom::Leader::Role'])`
 * 3. `isDepartmentLeaderRole(roleClass)` (prüft gegen alle Verbände)
 */
export function isDepartmentLeaderRole(
  roleClass: string,
  orgTypeOrConfigured?: OrganizationType | string[] | string | null
): boolean {
  if (!roleClass || typeof roleClass !== 'string') return false;

  const normalized = roleClass.toLowerCase().trim();

  // Fall A: Ein explizites Array konfigurierter Rollen wurde übergeben
  if (Array.isArray(orgTypeOrConfigured)) {
    if (orgTypeOrConfigured.includes(roleClass)) return true;
    return (
      normalized.endsWith('::abteilungsleiter') ||
      normalized.endsWith('::abteilungsleiterin') ||
      normalized.endsWith('::abteilungsleitung') ||
      normalized.endsWith('::scharleiter') ||
      normalized.endsWith('::scharleiterin') ||
      normalized.endsWith('::scharleitung') ||
      normalized.endsWith('::flock::leader')
    );
  }

  // Fall B: Ein Verbandstyp wurde angegeben
  if (orgTypeOrConfigured && typeof orgTypeOrConfigured === 'string') {
    const config = getHitobitoConfig(orgTypeOrConfigured);
    if (config.departmentLeaderRoleClasses.includes(roleClass)) return true;
    return config.departmentLeaderSuffixes.some((suffix) => normalized.endsWith(suffix.toLowerCase()));
  }

  // Fall C: Kein Verbandstyp angegeben - prüfe gegen alle bekannten Verbände
  for (const config of Object.values(HITOBITO_CONFIGS)) {
    if (config.departmentLeaderRoleClasses.includes(roleClass)) return true;
    if (config.departmentLeaderSuffixes.some((suffix) => normalized.endsWith(suffix.toLowerCase()))) {
      return true;
    }
  }

  return false;
}

/**
 * Prüft, ob eine Rolle (`role_class`) zu einer Einheit / Stufe / Kindergruppe gehört.
 */
export function isUnitRoleClass(
  roleClass: string,
  orgType?: OrganizationType | string | null
): boolean {
  if (!roleClass || typeof roleClass !== 'string') return false;

  if (orgType) {
    const config = getHitobitoConfig(orgType);
    return config.unitRoleClassPrefixes.some((prefix) => roleClass.startsWith(prefix));
  }

  // Gegen alle Verbände prüfen
  for (const config of Object.values(HITOBITO_CONFIGS)) {
    if (config.unitRoleClassPrefixes.some((prefix) => roleClass.startsWith(prefix))) {
      return true;
    }
  }

  return false;
}

/**
 * Extrahiert den reinen Rollen-Schlüssel (letzter Teil nach dem letzten `::`).
 * Beispiel: `Group::Stufe::Stufenleiter` -> `Stufenleiter`
 */
export function getUnitRoleKey(roleClass: string): string {
  if (!roleClass || typeof roleClass !== 'string') return '';
  const lastIndex = roleClass.lastIndexOf('::');
  return lastIndex >= 0 ? roleClass.slice(lastIndex + 2) : roleClass;
}

/**
 * Klassifiziert eine Rolle innerhalb einer Einheit in Leitung, Teilnehmer oder Andere.
 */
export function classifyUnitRole(
  roleClassOrKey: string,
  orgType?: OrganizationType | string | null
): 'LEITUNG' | 'TEILNEHMER' | 'ANDERE' {
  if (!roleClassOrKey || typeof roleClassOrKey !== 'string') return 'ANDERE';

  const roleKey = getUnitRoleKey(roleClassOrKey);
  const config = getHitobitoConfig(orgType);

  if (config.unitLeaderRoles.includes(roleKey)) {
    return 'LEITUNG';
  }
  if (config.unitParticipantRoles.includes(roleKey)) {
    return 'TEILNEHMER';
  }

  // Falls nicht beim Zielverband gefunden und kein expliziter Verband erzwungen war:
  // Fallback-Prüfung gegen alle Verbände
  if (!orgType) {
    for (const otherConfig of Object.values(HITOBITO_CONFIGS)) {
      if (otherConfig.unitLeaderRoles.includes(roleKey)) return 'LEITUNG';
      if (otherConfig.unitParticipantRoles.includes(roleKey)) return 'TEILNEHMER';
    }
  }

  return 'ANDERE';
}
