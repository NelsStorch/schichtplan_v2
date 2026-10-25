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

export const EVENT_QUESTION_SCOPES = {
  ONCE: 'Einmal pro Anlass',
  PER_SIGNUP: 'Bei jeder Eintragung',
} as const;

export type EventQuestionScope = keyof typeof EVENT_QUESTION_SCOPES;

/**
 * Wie lange die Antworten auf eine Frage nach dem Anlass bleiben: Tage nach dem Ende der letzten
 * Schicht, null = nie automatisch löschen. Gelöscht wird in `services/answerRetention.ts` (Backend).
 */
export const QUESTION_RETENTION_DAYS = [0, 10, 30, 90, 365, null] as const;
export type QuestionRetentionDays = (typeof QUESTION_RETENTION_DAYS)[number];
export const DEFAULT_QUESTION_RETENTION_DAYS: QuestionRetentionDays = 30;

/** Gespeicherter Wert als erlaubte Dauer (Unbekanntes gilt als «nie», es wird also nichts gelöscht) */
export function toRetentionDays(days: number | null | undefined): QuestionRetentionDays {
  return (QUESTION_RETENTION_DAYS as readonly (number | null)[]).includes(days ?? null)
    ? ((days ?? null) as QuestionRetentionDays)
    : null;
}

/** Auswahl im Fragen-Editor: «Direkt nach dem Anlass», «30 Tage nach dem Anlass», «Nie löschen» */
export function retentionLabel(days: number | null): string {
  if (days === null) return 'Nie löschen';
  if (days === 0) return 'Direkt nach dem Anlass';
  return `${days} Tage nach dem Anlass`;
}

/** Hinweis im Formular: «Wird 30 Tage nach dem Anlass gelöscht.» */
export function retentionNotice(days: number | null): string {
  if (days === null) return 'Wird nicht automatisch gelöscht.';
  if (days === 0) return 'Wird direkt nach dem Anlass gelöscht.';
  return `Wird ${days} Tage nach dem Anlass gelöscht.`;
}

/** Vorgefertigte Fragen im Fragen-Editor des OK (Aufbewahrung: DEFAULT_QUESTION_RETENTION_DAYS) */
export interface EventQuestionPreset {
  key: string;
  label: string;
  type: EventQuestionType;
  options: string[];
  /** Kurze Erklärung im Auswahlmenü */
  hint: string;
}

export const EVENT_QUESTION_PRESETS: EventQuestionPreset[] = [
  { key: 'ADDRESS', label: 'Adresse (Strasse, PLZ, Ort)', type: 'TEXT', options: [], hint: 'z. B. für Versand oder Versicherung' },
  { key: 'DIET', label: 'Allergien / Ernährung', type: 'TEXT', options: [], hint: 'z. B. vegetarisch, laktosefrei, Nüsse' },
  { key: 'TSHIRT', label: 'T-Shirt-Grösse', type: 'CHOICE', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], hint: 'Auswahl XS bis XXL' },
  { key: 'EMERGENCY', label: 'Notfallkontakt (Name und Telefon)', type: 'TEXT', options: [], hint: 'Wen das OK im Notfall anruft' },
];

/** Anwesenheit pro Anlass: aus, nur das OK hakt ab, oder zusätzlich Selbst-Check-in per QR-Code */
export const ATTENDANCE_MODES = {
  OFF: 'Keine Anwesenheitsliste',
  OK_ONLY: 'Nur das OK hakt ab',
  OK_AND_QR: 'OK hakt ab und Selbst-Check-in per QR-Code',
} as const;

export type AttendanceMode = keyof typeof ATTENDANCE_MODES;
export const ATTENDANCE_MODE_KEYS = Object.keys(ATTENDANCE_MODES) as [AttendanceMode, ...AttendanceMode[]];

/** Status einer Schicht-Eintragung (null = offen) */
export const ATTENDANCE_STATUSES = {
  PRESENT: 'Anwesend',
  EXCUSED: 'Entschuldigt',
  NO_SHOW: 'Nicht erschienen',
} as const;

export type AttendanceStatus = keyof typeof ATTENDANCE_STATUSES;
export const ATTENDANCE_STATUS_KEYS = Object.keys(ATTENDANCE_STATUSES) as [AttendanceStatus, ...AttendanceStatus[]];

/** Selbst-Check-in ist ab so vielen Minuten vor Schichtbeginn bis zum Schichtende möglich */
export const CHECKIN_EARLY_MINUTES = 30;

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
  'login',
  // Hilfe-Center (hilfe.<domain>) und naheliegende Varianten
  'hilfe',
  'help',
  'docs',
  'doku',
] as const;

export const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
