/** Adressen der lokalen Umgebung (docker-compose.dev.yml) und Zugangsdaten aus dem Seed */
export const URLS = {
  api: process.env.E2E_API_URL || 'http://localhost:4000',
  web: process.env.E2E_WEB_URL || 'http://demo.localhost:3000',
  login: process.env.E2E_LOGIN_URL || 'http://localhost:3002',
  landing: process.env.E2E_LANDING_URL || 'http://localhost:3001',
};

/** Seed-Konten (apps/backend/prisma/seed.ts) */
export const ADMIN_EMAIL = 'admin@example.com';
export const HELPER_EMAIL = 'helfer1@example.com';
export const DEPARTMENT_SLUG = 'demo';
export const PUBLIC_EVENT_SLUG = 'chilbi-2026';

/** Passwort der Seed-Konten: beim Seeden mit SEED_PASSWORD gesetzt, hier gleich übergeben */
export function seedPassword(): string {
  const value = process.env.SEED_PASSWORD;
  if (!value) throw new Error('SEED_PASSWORD fehlt (gleicher Wert wie beim npm run db:seed, siehe e2e/README.md)');
  return value;
}

/** Eindeutiger Name pro Lauf, damit wiederholte Läufe sich nicht in die Quere kommen */
export const runId = Date.now().toString(36);
