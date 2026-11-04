/**
 * Datenarme Nutzungsstatistik: feste Liste aller Kennzahlen. Gezählt wird nur, was hier steht, und nur
 * als Summe pro Tag (ohne Person, IP, Gerät oder echte URL). Unterteilungen (`dims`) sind ebenfalls fest;
 * `openDim` erlaubt einen Pfad (z. B. Hilfeseite), der auf STATS_OPEN_DIM_PATTERN gekürzt wird.
 * Backend: apps/backend/src/services/usageStats.ts, Browser: trackUi() in ./statsClient.ts.
 */

export const USAGE_METRIC_GROUPS = {
  KONTEN: 'Login und Konten',
  BETRIEB: 'Betrieb',
  ANLAESSE: 'Anlässe und Schichten',
  BROWSER: 'Funktionen im Browser',
  HILFE: 'Hilfe-Center',
} as const;

export type UsageMetricGroup = keyof typeof USAGE_METRIC_GROUPS;

export interface UsageMetricDef {
  label: string;
  group: UsageMetricGroup;
  /** server = vom Backend gezählt, ui = Meldung aus dem Browser (POST /api/stats/ui) */
  source: 'server' | 'ui';
  dims?: Readonly<Record<string, string>>;
  /** Freie, aber gekürzte Unterteilung (nur Pfade aus Kleinbuchstaben, Ziffern, - und /) */
  openDim?: boolean;
}

const LOGIN_METHODS = { cevidb: 'Cevi.DB', password: 'E-Mail/Passwort', ceviname: 'Cevi-Name' } as const;
const SIGNUP_BY = { SELF: 'selbst', OK: 'durch das OK', GUEST: 'Gast (durch das OK)' } as const;
const MESSAGE_TARGETS = { ALL: 'Alle', SHIFTS: 'Schichten', PEOPLE: 'Personen', OK: 'OK', OPEN: 'Noch offen (Soll)' } as const;

export const MAIL_KINDS = {
  VERIFICATION: 'E-Mail bestätigen',
  PASSWORD_RESET: 'Passwort zurücksetzen',
  ACCOUNT_EXISTS: 'Konto existiert schon',
  SHIFT_REMINDER: 'Schicht-Erinnerung',
  REPLACEMENT_TAKEN: 'Ersatz gefunden',
  OK_MESSAGE: 'Nachricht vom OK',
  ADMIN_NOTICE: 'Admin-Hinweis',
  SERVER_ALERT: 'Server-Alarm',
  OTHER: 'Andere',
} as const;
export type MailKind = keyof typeof MAIL_KINDS;

export const STATS_JOBS = {
  SHIFT_REMINDERS: 'Schicht-Erinnerungen',
  ANSWER_RETENTION: 'Löschfristen der Antworten',
  STATS_MAINTENANCE: 'Statistik aufräumen',
} as const;

/** Unterseiten des OK-Bereichs (Pfad nach /ok/, '' = Übersicht) */
export const OK_PAGES = {
  uebersicht: 'Übersicht',
  schichten: 'Schichten',
  'schichten/arbeiten': 'Arbeiten',
  'schichten/vorlagen': 'Vorlagen',
  helfende: 'Helfende',
  'helfende/zugang': 'Zugang',
  fragen: 'Fragen',
  nachrichten: 'Nachrichten',
  anwesenheit: 'Anwesenheit',
  verpflegung: 'Verpflegung',
  export: 'Export',
  einstellungen: 'Einstellungen',
  protokoll: 'Protokoll',
} as const;

export const STATS_APPS = { web: 'Abteilungen', landing: 'Startseite', login: 'Login' } as const;

export const USAGE_METRICS = {
  // --- Login und Konten -----------------------------------------------------------------------
  ACTIVE_USER: { label: 'Aktive Personen', group: 'KONTEN', source: 'server' },
  LOGIN: { label: 'Anmeldungen', group: 'KONTEN', source: 'server', dims: LOGIN_METHODS },
  LOGIN_FAILED: {
    label: 'Fehlgeschlagene Anmeldungen',
    group: 'KONTEN',
    source: 'server',
    dims: {
      PASSWORD_WRONG: 'Falsches Passwort',
      CEVINAME_NOT_FOUND: 'Cevi-Name nicht gefunden',
      CEVINAME_USE_CEVIDB: 'Cevi-Name: Konto mit Cevi.DB',
      CEVINAME_USE_PASSWORD: 'Cevi-Name: Konto mit Passwort',
      CEVIDB_ERROR: 'Cevi.DB-Fehler',
    },
  },
  REGISTER: { label: 'Neue Konten', group: 'KONTEN', source: 'server', dims: LOGIN_METHODS },
  ACCOUNT_LINK: { label: 'Konto mit Cevi.DB verknüpft', group: 'KONTEN', source: 'server' },
  PROFILE_MERGE: { label: 'Cevi-Name-Profile zusammengeführt', group: 'KONTEN', source: 'server' },
  PASSWORD_RESET: {
    label: 'Passwort vergessen',
    group: 'KONTEN',
    source: 'server',
    dims: { REQUEST: 'angefordert', DONE: 'neu gesetzt' },
  },
  EMAIL_VERIFIED: { label: 'E-Mail bestätigt', group: 'KONTEN', source: 'server' },
  ACCOUNT_DELETE: { label: 'Konto selbst gelöscht', group: 'KONTEN', source: 'server' },

  // --- Betrieb -------------------------------------------------------------------------------
  MAIL_SENT: { label: 'Mails verschickt', group: 'BETRIEB', source: 'server', dims: MAIL_KINDS },
  MAIL_FAILED: { label: 'Mails fehlgeschlagen', group: 'BETRIEB', source: 'server', dims: MAIL_KINDS },
  JOB_RUN: { label: 'Hintergrund-Jobs gelaufen', group: 'BETRIEB', source: 'server', dims: STATS_JOBS },
  JOB_FAILED: { label: 'Hintergrund-Jobs fehlgeschlagen', group: 'BETRIEB', source: 'server', dims: STATS_JOBS },
  JOB_ITEMS: {
    label: 'Von Jobs bearbeitet',
    group: 'BETRIEB',
    source: 'server',
    dims: { SHIFT_REMINDERS: 'Erinnerungen verschickt', ANSWER_RETENTION: 'Antworten gelöscht', STATS_MAINTENANCE: 'Zeilen zusammengefasst' },
  },
  EXTERNAL: {
    label: 'Externe Dienste',
    group: 'BETRIEB',
    source: 'server',
    dims: { CEVIDB_OK: 'Cevi.DB ok', CEVIDB_ERROR: 'Cevi.DB Fehler', QR_OK: 'QR-Generator ok', QR_ERROR: 'QR-Generator Fehler' },
  },

  // --- Anlässe und Schichten -----------------------------------------------------------------
  EVENT_CREATE: {
    label: 'Anlässe erstellt',
    group: 'ANLAESSE',
    source: 'server',
    dims: { BLANK: 'neu', TEMPLATE: 'aus Vorlage' },
  },
  EVENT_DELETE: { label: 'Anlässe gelöscht', group: 'ANLAESSE', source: 'server' },
  EVENT_MOVE: { label: 'Anlässe verschoben', group: 'ANLAESSE', source: 'server' },
  TEMPLATE_SAVE: { label: 'Vorlagen gespeichert', group: 'ANLAESSE', source: 'server' },
  SHIFT_CREATE: {
    label: 'Schichten erstellt',
    group: 'ANLAESSE',
    source: 'server',
    dims: { SINGLE: 'einzeln', SERIES: 'als Serie', DUPLICATE: 'dupliziert' },
  },
  SHIFT_BULK: {
    label: 'Massenbearbeitung',
    group: 'ANLAESSE',
    source: 'server',
    dims: { DELETE: 'löschen', MOVE: 'verschieben', SET_SLOTS: 'Plätze', SET_SETUP: 'Auf-/Abbau', SET_CATEGORY: 'Kategorie' },
  },
  SIGNUP: { label: 'Eintragungen', group: 'ANLAESSE', source: 'server', dims: SIGNUP_BY },
  SIGNOFF: { label: 'Austragungen', group: 'ANLAESSE', source: 'server', dims: { SELF: 'selbst', OK: 'durch das OK' } },
  REPLACEMENT_OFFERED: { label: 'Ersatz gesucht', group: 'ANLAESSE', source: 'server', dims: { SELF: 'selbst', OK: 'durch das OK' } },
  REPLACEMENT_TAKEN: { label: 'Schichten übernommen', group: 'ANLAESSE', source: 'server' },
  ATTENDANCE: { label: 'Anwesenheit erfasst', group: 'ANLAESSE', source: 'server', dims: { OK: 'durch das OK', QR: 'QR-Check-in' } },
  ACCESS_LINK_CREATE: {
    label: 'Zugangs-Links erstellt',
    group: 'ANLAESSE',
    source: 'server',
    dims: { PERSONAL: 'persönlich', GROUP: 'Gruppe' },
  },
  MESSAGE: { label: 'OK-Nachrichten', group: 'ANLAESSE', source: 'server', dims: MESSAGE_TARGETS },
  MESSAGE_RECIPIENTS: { label: 'Empfänger*innen von OK-Nachrichten', group: 'ANLAESSE', source: 'server', dims: MESSAGE_TARGETS },
  CALENDAR_FEED: { label: 'Kalender-Feed abgerufen', group: 'ANLAESSE', source: 'server' },

  // --- Browser ------------------------------------------------------------------------------
  UI_APP_LOAD: { label: 'Seiten geladen', group: 'BROWSER', source: 'ui', dims: STATS_APPS },
  UI_DEVICE: {
    label: 'Gerätegrösse',
    group: 'BROWSER',
    source: 'ui',
    dims: { phone: 'Handy', tablet: 'Tablet', desktop: 'Computer' },
  },
  UI_THEME: { label: 'Darstellung', group: 'BROWSER', source: 'ui', dims: { dark: 'dunkel', light: 'hell' } },
  UI_JS_ERROR: { label: 'Fehler im Browser', group: 'BROWSER', source: 'ui', dims: STATS_APPS },
  UI_OK_PAGE: { label: 'OK-Bereich aufgerufen', group: 'BROWSER', source: 'ui', dims: OK_PAGES },
  UI_PLAN_VIEW: {
    label: 'Ansicht gewählt',
    group: 'BROWSER',
    source: 'ui',
    dims: { EVENT_GRID: 'Anlass: Raster', EVENT_LIST: 'Anlass: Liste', OK_LIST: 'OK: Liste', OK_PLAN: 'OK: Zeitachse' },
  },
  UI_PDF: {
    label: 'Schichtplan-PDF',
    group: 'BROWSER',
    source: 'ui',
    dims: {
      plan_download: 'Übersicht laden',
      plan_print: 'Übersicht drucken',
      aushang_download: 'Aushang laden',
      aushang_print: 'Aushang drucken',
      personen_download: 'Pro Person laden',
      personen_print: 'Pro Person drucken',
    },
  },
  UI_CSV: {
    label: 'CSV-Export',
    group: 'BROWSER',
    source: 'ui',
    dims: { SHIFTS: 'Schichtplan', ASSIGNMENTS: 'Einteilung', ROSTER: 'Helfende', HOURS: 'Stunden', ATTENDANCE: 'Anwesenheit', OTHER: 'Andere' },
  },
  UI_ATTENDANCE_PRINT: { label: 'Anwesenheitsliste gedruckt', group: 'BROWSER', source: 'ui' },
  UI_MY_SHIFTS: {
    label: '«Meine Schichten» geöffnet',
    group: 'BROWSER',
    source: 'ui',
    dims: { online: 'online', offline: 'offline' },
  },
  UI_BRIEFING: { label: 'Einsatz-Briefing aufgeklappt', group: 'BROWSER', source: 'ui' },
  UI_HELP_CLICK: { label: 'Klicks auf Hilfe-Links', group: 'BROWSER', source: 'ui', openDim: true },

  // --- Hilfe-Center -------------------------------------------------------------------------
  HELP_PAGE: { label: 'Hilfeseiten gelesen', group: 'HILFE', source: 'ui', openDim: true },
  HELP_SEARCH_EMPTY: { label: 'Suchen ohne Treffer', group: 'HILFE', source: 'ui' },
  HELP_FEEDBACK_YES: { label: 'Hilfeseite hilfreich', group: 'HILFE', source: 'ui', openDim: true },
  HELP_FEEDBACK_NO: { label: 'Hilfeseite nicht hilfreich', group: 'HILFE', source: 'ui', openDim: true },
} as const satisfies Record<string, UsageMetricDef>;

export type UsageMetricKey = keyof typeof USAGE_METRICS;
export type UiMetricKey = {
  [K in UsageMetricKey]: (typeof USAGE_METRICS)[K]['source'] extends 'ui' ? K : never;
}[UsageMetricKey];

/** Erlaubte Unterteilung einer Kennzahl (Schlüssel aus `dims`) */
export type UsageMetricDim<K extends UsageMetricKey> = (typeof USAGE_METRICS)[K] extends { dims: infer D }
  ? keyof D & string
  : (typeof USAGE_METRICS)[K] extends { openDim: true }
    ? string
    : never;

/** Freie Unterteilungen: nur ein kurzer Pfad, sonst verworfen */
export const STATS_OPEN_DIM_PATTERN = /^[a-z0-9][a-z0-9\-/]{0,79}$/;

/**
 * Unterteilung prüfen: feste Werte nur aus der Liste, freie nur als kurzer Pfad. Unbekannt → null
 * (die Meldung wird verworfen). Ohne Unterteilung immer ''.
 */
export function normalizeUsageDim(metric: UsageMetricKey, dim: string | null | undefined): string | null {
  const def: UsageMetricDef = USAGE_METRICS[metric];
  if (def.dims) return dim && Object.prototype.hasOwnProperty.call(def.dims, dim) ? dim : null;
  if (def.openDim) {
    const clean = (dim ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    if (clean === '') return 'index';
    return STATS_OPEN_DIM_PATTERN.test(clean) && !clean.includes('//') ? clean : null;
  }
  return '';
}

export const isUsageMetric = (value: unknown): value is UsageMetricKey =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(USAGE_METRICS, value);

export const isUiMetric = (value: unknown): value is UiMetricKey =>
  isUsageMetric(value) && USAGE_METRICS[value].source === 'ui';

/** Grenzen der Laufzeit-Stufen in Millisekunden (letzte Stufe = darüber) */
export const REQUEST_DURATION_BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

/** Wie lange die Statistik aufbewahrt wird */
export const STATS_RETENTION = {
  /** Stundenwerte der Anfragen, danach zu Tageswerten zusammengefasst */
  hourlyRequestDays: 90,
  /** Tageszähler, Tageswerte der Anfragen und Momentaufnahmen */
  dailyDays: 730,
} as const;

/** Höchstens so viele Meldungen pro Anfrage an POST /api/stats/ui */
export const STATS_UI_MAX_EVENTS = 25;

// --- Admin-Portal: Antworten von /api/admin/stats/* ------------------------------------------

/** Wählbare Zeiträume in Tagen */
export const STATS_RANGES = [7, 30, 90, 365] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export interface StatsCountDto {
  key: string;
  label: string;
  count: number;
}

export interface AdminStatsMetricDto {
  metric: UsageMetricKey;
  total: number;
  /** Pro Tag, gleiche Reihenfolge wie `days` */
  daily: number[];
  byDim: { dim: string; total: number }[];
}

export interface AdminStatsDepartmentRowDto {
  id: string;
  name: string;
  slug: string;
  homeUsers: number;
  active30: number;
  logins: number;
  signups: number;
  eventsCreated: number;
  messages: number;
  pageLoads: number;
}

export interface AdminStatsUsageDto {
  days: string[];
  departmentId: string | null;
  metrics: AdminStatsMetricDto[];
  /** Aus users.last_seen_on (mit Abteilung: Heimabteilung) */
  active: { today: number; last7: number; last30: number; accounts: number };
  /** Nur ohne Abteilungs-Filter */
  departments: AdminStatsDepartmentRowDto[];
}

export interface AdminStatsRouteDto {
  route: string;
  method: string;
  count: number;
  errors5xx: number;
  client4xx: number;
  rateLimited: number;
  avgMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number;
}

export interface AdminStatsSystemDto {
  generatedAt: string;
  environment: string;
  startedAt: string;
  nodeVersion: string;
  memory: { rssMb: number; heapUsedMb: number };
  database: { bytes: number; tables: { name: string; bytes: number; rows: number }[] };
  uploads: { count: number; bytes: number };
  requests: {
    days: string[];
    daily: { count: number; errors5xx: number; client4xx: number; rateLimited: number }[];
    total: { count: number; errors5xx: number; client4xx: number; rateLimited: number; p95Ms: number | null };
    routes: AdminStatsRouteDto[];
  };
  snapshots: { days: string[]; series: { key: string; label: string; values: (number | null)[] }[] };
}

export interface AdminStatsFeaturesDto {
  days: number;
  departmentId: string | null;
  /** Anlässe mit Beginn im Zeitraum oder später */
  events: {
    count: number;
    published: number;
    signupClosed: number;
    accessTypes: StatsCountDto[];
    attendanceModes: StatsCountDto[];
    requiredFields: StatsCountDto[];
    options: StatsCountDto[];
    questionRetention: StatsCountDto[];
  };
  /** Anlässe, die im Zeitraum zu Ende gingen */
  fill: { events: number; slots: number; signups: number; fullShiftsPct: number | null; avgFillPct: number | null };
  signupsBy: StatsCountDto[];
  /** Tage zwischen Eintragung und Schichtbeginn (Eintragungen im Zeitraum) */
  signupLead: StatsCountDto[];
  attendance: StatsCountDto[];
  messages: { count: number; recipients: number; failed: number; byTarget: StatsCountDto[] };
  okTeams: { events: number; avgSize: number | null };
  roles: StatsCountDto[];
}
