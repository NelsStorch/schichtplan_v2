export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',       // Abteilungsleiter / Hauptverantwortlicher
  PLANNER: 'PLANNER',   // Schichtplaner / OK-Mitglied
  HELPER: 'HELPER',     // Normaler Helfer
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const SIGNUP_MODES = {
  NAME_ONLY: 'NAME_ONLY',         // "Nur Cevi-Name (Kein Passwort/Login nötig)"
  OPEN: 'OPEN',                   // "Offen (Mit Account oder nur Cevi-Name)"
  LOGIN_REQUIRED: 'LOGIN_REQUIRED', // "Login erforderlich (Cevi.DB, Google, E-Mail)"
  CEVIDB_ONLY: 'CEVIDB_ONLY',     // "Nur Cevi.DB Login erlaubt"
} as const;

export type SignupMode = (typeof SIGNUP_MODES)[keyof typeof SIGNUP_MODES];

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
