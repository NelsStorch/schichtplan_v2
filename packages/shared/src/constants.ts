export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',       // Abteilungsleiter / Hauptverantwortlicher
  PLANNER: 'PLANNER',   // Schichtplaner / OK-Mitglied
  HELPER: 'HELPER',     // Normaler Helfer
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * Wer darf sich bei einem Anlass eintragen? Eintragen braucht immer ein Konto
 * (ein Cevi-Name-Profil ohne Passwort reicht). Zugangs-Links und das OK gehen immer.
 *
 * Neuen Typ hinzufügen: Eintrag hier ergänzen. Die Prüfung im Backend
 * (`services/eventAccess.ts`) liest nur diese Eigenschaften:
 * - `scope`: ANY = alle Abteilungen, DEPARTMENT = nur die eigene (plus Whitelist)
 * - `ceviDb`: Abteilung und Stufe müssen aus Cevi.DB stammen
 * - `whitelist`: weitere Abteilungen freischaltbar
 * Das Icon pro Typ steht im Frontend (`apps/web/src/components/event-meta.tsx`).
 */
export interface EventAccessTypeConfig {
  label: string;
  short: string;
  description: string;
  scope: 'ANY' | 'DEPARTMENT';
  ceviDb: boolean;
  whitelist: boolean;
}

export const EVENT_ACCESS_TYPES = {
  PUBLIC: {
    label: 'Öffentlich',
    short: 'Öffentlich',
    description: 'Alle mit dem Link. Ein Cevi-Name-Profil ohne Passwort reicht.',
    scope: 'ANY',
    ceviDb: false,
    whitelist: false,
  },
  CEVIDB_ALL: {
    label: 'Cevi.DB, alle Abteilungen',
    short: 'Cevi.DB',
    description: 'Alle mit Cevi.DB-Login, egal aus welcher Abteilung. Für regionale Anlässe und Kurse.',
    scope: 'ANY',
    ceviDb: true,
    whitelist: false,
  },
  DEPARTMENT: {
    label: 'Abteilungs-intern',
    short: 'Intern',
    description: 'Alle, die beim Login diese Abteilung angegeben haben.',
    scope: 'DEPARTMENT',
    ceviDb: false,
    whitelist: false,
  },
  DEPARTMENT_CEVIDB: {
    label: 'Abteilungs-intern, Cevi.DB',
    short: 'Intern · Cevi.DB',
    description: 'Nur mit Cevi.DB-Login und dort in dieser Abteilung (Ortsgruppe).',
    scope: 'DEPARTMENT',
    ceviDb: true,
    whitelist: false,
  },
  WHITELIST: {
    label: 'Mehrere Abteilungen',
    short: 'Whitelist',
    description: 'Wie abteilungs-intern, dazu weitere freigeschaltete Abteilungen.',
    scope: 'DEPARTMENT',
    ceviDb: false,
    whitelist: true,
  },
  WHITELIST_CEVIDB: {
    label: 'Mehrere Abteilungen, Cevi.DB',
    short: 'Whitelist · Cevi.DB',
    description: 'Wie abteilungs-intern mit Cevi.DB, dazu weitere freigeschaltete Abteilungen.',
    scope: 'DEPARTMENT',
    ceviDb: true,
    whitelist: true,
  },
} as const satisfies Record<string, EventAccessTypeConfig>;

export type EventAccessType = keyof typeof EVENT_ACCESS_TYPES;
export const EVENT_ACCESS_TYPE_KEYS = Object.keys(EVENT_ACCESS_TYPES) as [EventAccessType, ...EventAccessType[]];

/** Gespeicherter Wert als bekannter Typ (Unbekanntes gilt als PUBLIC) */
export function toEventAccessType(type: string): EventAccessType {
  return Object.prototype.hasOwnProperty.call(EVENT_ACCESS_TYPES, type) ? (type as EventAccessType) : 'PUBLIC';
}

export function accessTypeConfig(type: string): EventAccessTypeConfig {
  return EVENT_ACCESS_TYPES[toEventAccessType(type)];
}

/** Profilfelder, die ein Anlass verlangen kann. Bei Cevi.DB-Konten kommen sie aus dem Profil. */
export const REQUIRED_PROFILE_FIELDS = {
  PHONE: { label: 'Handynummer' },
  EMAIL: { label: 'E-Mail' },
  BIRTH_DATE: { label: 'Geburtsdatum' },
  FULL_NAME: { label: 'Vor- und Nachname' },
  ADDRESS: { label: 'Adresse' },
} as const;

export type RequiredProfileField = keyof typeof REQUIRED_PROFILE_FIELDS;
export const REQUIRED_PROFILE_FIELD_KEYS = Object.keys(REQUIRED_PROFILE_FIELDS) as [
  RequiredProfileField,
  ...RequiredProfileField[],
];

export const EVENT_QUESTION_TYPES = {
  TEXT: 'Freitext',
  YES_NO: 'Ja / Nein',
  CHOICE: 'Auswahl',
} as const;

export type EventQuestionType = keyof typeof EVENT_QUESTION_TYPES;

export const STUFE_ROLES = {
  LEITUNG: 'Leitung',
  TEILNEHMER: 'Teilnehmer*in',
} as const;

export type StufeRole = keyof typeof STUFE_ROLES;

/** Platzhalter-Nachname des Cevi-Name-Logins und Platzhalter-E-Mail des Cevi.DB-Logins zählen nicht als Angabe. */
export const PLACEHOLDER_LAST_NAME = '(Helfer)';
export const PLACEHOLDER_EMAIL_REGEX = /^cevidb_\d+@cevi-schichtplan\.ch$/;

export const DEFAULT_SHIFT_CATEGORIES = [
  'Küche & Verpflegung',
  'Grill & Essensausgabe',
  'Bar & Getränke',
  'Kasse & Bons',
  'Aufbau & Vorbereitung',
  'Abbau & Aufräumen',
  'Aktivität & Posten',
  'Springer & Allrounder',
] as const;

export const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'admin',
  'mail',
  'dev',
  'staging',
  'app',
  'static',
  'cdn',
  'auth',
  'status',
] as const;

export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
