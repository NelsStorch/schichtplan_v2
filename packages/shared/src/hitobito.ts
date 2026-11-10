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
  /** Typen von Gruppen in Hitobito, die eine Abteilung / Schar darstellen */
  departmentGroupTypes: string[];
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
  departmentLeaderRoleClasses: [
    'Group::Jungschar::Abteilungsleiter',
    'Group::Jungschar::Abteilungsleiterin',
    'Group::Abteilung::Abteilungsleiter',
    'Group::Abteilung::Abteilungsleiterin',
    'Group::Ortsgruppe::Abteilungsleiter',
    'Group::Ortsgruppe::Abteilungsleiterin',
    'Group::Ortsgruppe::AdministratorCeviDB',
  ],
  departmentLeaderSuffixes: [
    '::abteilungsleiter',
    '::abteilungsleiterin',
    '::abteilungsleitung',
    '::administratorcevidb',
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
  defaultBaseUrl: 'https://midata.scouts.ch',
  departmentGroupTypes: [
    'Group::Abteilung',
    'Group::Pfadi::Abteilung',
    'Group::Stamm',
  ],
  departmentLeaderRoleClasses: [
    'Group::Abteilung::Abteilungsleitung',
    'Group::Abteilung::AbteilungsleitungStv',
    'Group::Abteilung::Abteilungsleiter',
    'Group::Abteilung::Abteilungsleiterin',
    'Group::Abteilung::Sekretariat',
    'Group::Abteilung::Praesidium',
    'Group::Abteilung::VizePraesidium',
    'Group::Pfadi::Abteilung::Abteilungsleitung',
    'Group::Pfadi::Abteilung::Abteilungsleiter',
    'Group::Pfadi::Abteilung::Abteilungsleiterin',
    'Group::Stamm::Stammesfuehrung',
    'Group::Stamm::StammesfuehrungStv',
  ],
  departmentLeaderSuffixes: [
    '::abteilungsleitung',
    '::abteilungsleitungstv',
    '::abteilungsleiter',
    '::abteilungsleiterin',
    '::al',
    '::al-stellvertretung',
    '::stabsleitung',
    '::stammesfuehrung',
    '::stammesfuehrungstv',
  ],
  unitRoleClassPrefixes: [
    'Group::Biber::',
    'Group::Woelfe::',
    'Group::Pfadi::',
    'Group::Pio::',
    'Group::Rover::',
    'Group::Pta::',
    'Group::AbteilungsRover::',
    'Group::StammGruppePfadfinder::',
    'Group::Stufe::',
    'Group::Einheit::',
  ],
  unitLeaderRoles: [
    'Einheitsleitung',
    'Einheitsleiter',
    'Einheitsleiterin',
    'Mitleitung',
    'Mitleiter',
    'Mitleiterin',
    'Stufenleitung',
    'Stufenleiter',
    'Stufenleiterin',
    'StufenleitungBiber',
    'StufenleitungWoelfe',
    'StufenleitungPfadi',
    'StufenleitungPio',
    'StufenleitungRover',
    'StufenleitungPta',
    'Gruppenleiter',
    'Gruppenleiterin',
    'Gruppenleitung',
    'Leitung',
    'Hilfsleitung',
    'Leitwolf',
    'Leitpfadi',
  ],
  unitParticipantRoles: [
    'Biber',
    'Wolf',
    'Wölfe',
    'Pfadi',
    'Pfadis',
    'Pio',
    'Pios',
    'Rover',
    'Rovers',
    'Pta',
    'Mitglied',
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

export const HITOBITO_JUBLA_CONFIG: HitobitoConfig = {
  orgType: 'JUBLA',
  name: 'Jubla-DB',
  oauthScopes: DEFAULT_HITOBITO_SCOPES,
  ortsgruppeField: 'schar_id',
  defaultBaseUrl: 'https://db.jubla.ch',
  departmentGroupTypes: [
    'Group::Flock',
    'Group::Schar',
    'Group::Jubla::Schar',
  ],
  departmentLeaderRoleClasses: [
    'Group::Flock::Leader',
    'Group::Flock::CampLeader',
    'Group::Flock::President',
    'Group::Flock::Scharleitung',
    'Group::Flock::Scharleiter',
    'Group::Flock::Scharleiterin',
    'Group::Schar::Scharleitung',
    'Group::Schar::Scharleiter',
    'Group::Schar::Scharleiterin',
    'Group::Schar::Praeses',
    'Group::Jubla::Schar::Scharleitung',
  ],
  departmentLeaderSuffixes: [
    '::flock::leader',
    '::flock::campleader',
    '::flock::president',
    '::scharleitung',
    '::scharleiter',
    '::scharleiterin',
    '::lagerleitung',
    '::praeses',
    '::president',
  ],
  unitRoleClassPrefixes: [
    'Group::ChildGroup::',
    'Group::Gruppe::',
    'Group::Stufe::',
    'Group::SimpleGroup::',
  ],
  unitLeaderRoles: [
    'Leader',
    'CampLeader',
    'President',
    'Guide',
    'Scharleitung',
    'Scharleiter',
    'Scharleiterin',
    'Lagerleitung',
    'Praeses',
    'Gruppenleiter',
    'Gruppenleiterin',
    'Gruppenleitung',
    'Leiter',
    'Leiterin',
    'Hilfsleiter',
    'Hilfsleiterin',
    'Hilfsleitung',
  ],
  unitParticipantRoles: [
    'Child',
    'Kind',
    'Kinder',
    'Teilnehmer',
    'Teilnehmerin',
    'Mitglied',
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

export const HITOBITO_OTHER_CONFIG: HitobitoConfig = {
  orgType: 'OTHER',
  name: 'Verein',
  oauthScopes: DEFAULT_HITOBITO_SCOPES,
  ortsgruppeField: 'verein_id',
  defaultBaseUrl: '',
  departmentGroupTypes: ['Group::Verein'],
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
