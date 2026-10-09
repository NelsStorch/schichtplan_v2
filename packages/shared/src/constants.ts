export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',       // Abteilungsleiter / Hauptverantwortlicher
  PLANNER: 'PLANNER',   // Schichtplaner / OK-Mitglied
  HELPER: 'HELPER',     // Normaler Helfer
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

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
