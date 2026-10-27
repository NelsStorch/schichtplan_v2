/**
 * Rolle in einer Abteilung (department_members.role). ADMIN = Abteilungsleitung (alle Rechte, nur über Cevi.DB
 * oder das Admin-Portal), HELPER = alle anderen. Was jemand ohne Abteilungsleitung darf, steht in den einzelnen
 * Rechten (DEPARTMENT_PERMISSIONS).
 */
export const ROLES = {
  ADMIN: 'ADMIN',
  HELPER: 'HELPER',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * Einzelne Rechte in einer Abteilung. Die Abteilungsleitung hat immer alle.
 * `requires`: wird beim Speichern automatisch mitgesetzt (z. B. braucht jedes Anlass-Recht «Alle Anlässe sehen»).
 * Neues Recht: hier ergänzen, im Backend prüfen (`services/permissions.ts`) und die Hilfeseite
 * `abteilung/rechte` nachführen. Bestehende Personen bekommen es nicht automatisch.
 */
export interface DepartmentPermissionConfig {
  label: string;
  description: string;
  group: 'DEPARTMENT' | 'EVENTS';
  requires: readonly string[];
}

export const DEPARTMENT_PERMISSIONS = {
  DEPARTMENT_SETTINGS: {
    label: 'Abteilung bearbeiten',
    description: 'Name, Logo, Farbe, Kontaktperson und «Startseite nur für Mitglieder».',
    group: 'DEPARTMENT',
    requires: [],
  },
  STUFEN_MANAGE: {
    label: 'Stufen verwalten',
    description: 'Stufen anlegen, umbenennen, mit Cevi.DB verknüpfen und löschen.',
    group: 'DEPARTMENT',
    requires: [],
  },
  PEOPLE_VIEW: {
    label: 'Personen sehen',
    description: 'Liste der Personen der Abteilung mit Stufen und Rechten.',
    group: 'DEPARTMENT',
    requires: [],
  },
  PEOPLE_MANAGE: {
    label: 'Personen und Rechte verwalten',
    description:
      'Stufen von Personen setzen, Personen aus der Abteilung entfernen und Rechte vergeben, aber nur weniger, als man selbst hat. Sieht das Protokoll.',
    group: 'DEPARTMENT',
    requires: ['PEOPLE_VIEW'],
  },
  TEMPLATES_MANAGE: {
    label: 'Vorlagen verwalten',
    description: 'Anlässe als Vorlage speichern und Vorlagen löschen.',
    group: 'DEPARTMENT',
    requires: ['EVENTS_VIEW_ALL'],
  },
  EVENTS_VIEW_ALL: {
    label: 'Alle Anlässe sehen',
    description: 'Auch Entwürfe und den OK-Bereich aller Anlässe, inkl. Kontaktangaben der Helfenden.',
    group: 'EVENTS',
    requires: [],
  },
  EVENTS_CREATE: {
    label: 'Anlässe erstellen',
    description: 'Neue Anlässe anlegen, auch aus Vorlagen. Die Einstellungen danach ändert die OK-Leitung.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  EVENTS_EDIT_SETTINGS: {
    label: 'Anlässe bearbeiten',
    description: 'Einstellungen aller Anlässe ändern (wie die OK-Leitung), Anlässe verschieben.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  SHIFTS_MANAGE: {
    label: 'Schichten planen',
    description: 'Schichten, Arbeiten und Tagesverantwortliche in allen Anlässen.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  HELPERS_MANAGE: {
    label: 'Helfende einteilen',
    description: 'Helfende ein- und austragen, Abmeldungen und Zugangs-Links in allen Anlässen.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  MESSAGES_SEND: {
    label: 'Nachrichten senden',
    description: 'E-Mails an Helfende aller Anlässe.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  ATTENDANCE_MANAGE: {
    label: 'Anwesenheit erfassen',
    description: 'Anwesenheitsliste führen und den QR-Code für den Check-in herunterladen.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  EXPORT: {
    label: 'Exportieren',
    description: 'Listen, Schichtplan-PDF und Helferstunden herunterladen.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  ORGANIZERS_MANAGE: {
    label: 'OK ernennen',
    description: 'OK-Leitung und OK-Mitglieder aller Anlässe ernennen und entfernen.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
  EVENTS_DELETE: {
    label: 'Anlässe löschen',
    description: 'Anlässe mit allen Schichten und Eintragungen endgültig löschen.',
    group: 'EVENTS',
    requires: ['EVENTS_VIEW_ALL'],
  },
} as const satisfies Record<string, DepartmentPermissionConfig>;

export type DepartmentPermission = keyof typeof DEPARTMENT_PERMISSIONS;

export const DEPARTMENT_PERMISSION_KEYS = Object.keys(DEPARTMENT_PERMISSIONS) as DepartmentPermission[];

export const isDepartmentPermission = (value: unknown): value is DepartmentPermission =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEPARTMENT_PERMISSIONS, value);

/** Gültige Rechte inkl. der vorausgesetzten, in der Reihenfolge des Katalogs (ohne Doppelte) */
export function normalizePermissions(values: readonly unknown[]): DepartmentPermission[] {
  const set = new Set<DepartmentPermission>();
  const add = (p: DepartmentPermission) => {
    if (set.has(p)) return;
    set.add(p);
    for (const r of DEPARTMENT_PERMISSIONS[p].requires) if (isDepartmentPermission(r)) add(r);
  };
  for (const v of values) if (isDepartmentPermission(v)) add(v);
  return DEPARTMENT_PERMISSION_KEYS.filter((p) => set.has(p));
}

/**
 * Feste Vorlagen zum Vergeben von Rechten. Gespeichert werden nur die einzelnen Rechte,
 * die Vorlage füllt nur die Häkchen vor.
 */
export const DEPARTMENT_PERMISSION_PRESETS = {
  ADMINISTRATION: {
    label: 'Administration',
    description: 'Fast alles wie die Abteilungsleitung. Vergibt Rechte, aber nur weniger, als sie selbst hat.',
    permissions: DEPARTMENT_PERMISSION_KEYS,
  },
  EVENT_COORDINATION: {
    label: 'Anlass-Koordination',
    description: 'Erstellt Anlässe und plant in allen Anlässen mit. Die frühere Rolle «Planung».',
    permissions: [
      'EVENTS_VIEW_ALL',
      'EVENTS_CREATE',
      'SHIFTS_MANAGE',
      'HELPERS_MANAGE',
      'MESSAGES_SEND',
      'ATTENDANCE_MANAGE',
      'EXPORT',
      'TEMPLATES_MANAGE',
    ],
  },
  EVENT_EDITING: {
    label: 'Anlässe bearbeiten',
    description: 'Bearbeitet alle bestehenden Anlässe wie die OK-Leitung, erstellt aber keine neuen.',
    permissions: [
      'EVENTS_VIEW_ALL',
      'EVENTS_EDIT_SETTINGS',
      'SHIFTS_MANAGE',
      'HELPERS_MANAGE',
      'MESSAGES_SEND',
      'ATTENDANCE_MANAGE',
      'EXPORT',
      'ORGANIZERS_MANAGE',
    ],
  },
  EVENT_CREATION: {
    label: 'Anlässe erstellen',
    description: 'Legt neue Anlässe an. Planen und Einstellungen danach über das OK.',
    permissions: ['EVENTS_VIEW_ALL', 'EVENTS_CREATE'],
  },
} as const satisfies Record<
  string,
  { label: string; description: string; permissions: readonly DepartmentPermission[] }
>;

export type DepartmentPermissionPreset = keyof typeof DEPARTMENT_PERMISSION_PRESETS;

/** Vorlage, die genau diesen Rechten entspricht (sonst null = eigene Auswahl) */
export function permissionPresetOf(permissions: readonly string[]): DepartmentPermissionPreset | null {
  const own = normalizePermissions(permissions);
  for (const [key, preset] of Object.entries(DEPARTMENT_PERMISSION_PRESETS)) {
    const p = normalizePermissions(preset.permissions);
    if (p.length === own.length && p.every((x) => own.includes(x))) return key as DepartmentPermissionPreset;
  }
  return null;
}

/**
 * Bezeichnung einer Person in der Abteilung: Abteilungsleitung, Name der Vorlage, «Eigene Rechte»,
 * «Mitglied» (Heimabteilung) oder «Gast» (nur über die Subdomain angemeldet).
 */
export function departmentRoleLabel(person: {
  isLeader: boolean;
  permissions: readonly string[];
  isHomeDepartment: boolean;
}): string {
  if (person.isLeader) return 'Abteilungsleitung';
  if (normalizePermissions(person.permissions).length > 0) {
    const preset = permissionPresetOf(person.permissions);
    return preset ? DEPARTMENT_PERMISSION_PRESETS[preset].label : 'Eigene Rechte';
  }
  return person.isHomeDepartment ? 'Mitglied' : 'Gast';
}

/** Was jemand in einem Anlass darf (aus OK-Rolle, Abteilungsrechten oder Abteilungsleitung) */
export const EVENT_CAPABILITIES = [
  'VIEW',
  'SETTINGS',
  'SHIFTS',
  'HELPERS',
  'MESSAGES',
  'ATTENDANCE',
  'EXPORT',
  'ORGANIZERS',
  'TEMPLATES',
  'DELETE',
] as const;

export type EventCapability = (typeof EVENT_CAPABILITIES)[number];

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

/** «Ersatz gesucht» möglich bis so viele Stunden vor Schichtbeginn (0 = bis Schichtbeginn) */
export const REPLACEMENT_CUTOFF_HOURS = [0, 1, 2, 6, 12, 24] as const;
export type ReplacementCutoffHours = (typeof REPLACEMENT_CUTOFF_HOURS)[number];

/** Wählbare Vorlaufzeiten (in Minuten vor Schichtbeginn) für E-Mail-Erinnerungen */
export const EMAIL_REMINDER_MINUTES = [60, 120, 360, 720, 1440, 2880, 10080] as const;
export type EmailReminderMinutes = (typeof EMAIL_REMINDER_MINUTES)[number];
export const DEFAULT_EMAIL_REMINDER_MINUTES: readonly EmailReminderMinutes[] = [1440];

/** Wählbare Vorlaufzeiten (in Minuten vor Schichtbeginn) für Browser-Push-Erinnerungen */
export const PUSH_REMINDER_MINUTES = [15, 30, 60, 120, 360, 720, 1440, 2880, 10080] as const;
export type PushReminderMinutes = (typeof PUSH_REMINDER_MINUTES)[number];
export const DEFAULT_PUSH_REMINDER_MINUTES: readonly PushReminderMinutes[] = [60, 1440];

/** Beschriftung einer Erinnerungs-Vorlaufzeit (für Auswahl-Chips & Texte) */
export const REMINDER_MINUTE_LABELS: Record<number, { short: string; long: string; inText: string }> = {
  15: { short: '15 Min.', long: '15 Minuten vorher', inText: 'in 15 Minuten' },
  30: { short: '30 Min.', long: '30 Minuten vorher', inText: 'in 30 Minuten' },
  60: { short: '1 Std.', long: '1 Stunde vorher', inText: 'in 1 Stunde' },
  120: { short: '2 Std.', long: '2 Stunden vorher', inText: 'in 2 Stunden' },
  360: { short: '6 Std.', long: '6 Stunden vorher', inText: 'in 6 Stunden' },
  720: { short: '12 Std.', long: '12 Stunden vorher', inText: 'in 12 Stunden' },
  1440: { short: '24 Std. (1 Tag)', long: '24 Stunden (1 Tag) vorher', inText: 'in 24 Stunden' },
  2880: { short: '48 Std. (2 Tage)', long: '48 Stunden (2 Tage) vorher', inText: 'in 2 Tagen' },
  10080: { short: '1 Woche (7 Tage)', long: '1 Woche (7 Tage) vorher', inText: 'in 1 Woche' },
};

export function formatReminderLeadTime(minutes: number, mode: 'short' | 'long' | 'inText' = 'long'): string {
  const entry = REMINDER_MINUTE_LABELS[minutes];
  if (entry) return entry[mode];
  if (minutes < 60) return mode === 'inText' ? `in ${minutes} Minuten` : `${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  return mode === 'inText' ? `in ${hours} Stunden` : `${hours} Std.`;
}

/** Bis wann «Ersatz gesucht» gesetzt und übernommen werden kann */
export function replacementDeadline(shiftStart: Date | string, cutoffHours: number): Date {
  return new Date(new Date(shiftStart).getTime() - cutoffHours * 60 * 60 * 1000);
}

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
