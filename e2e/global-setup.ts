import { URLS, seedPassword } from './tests/env';

/**
 * Sicherheitsnetz vor dem Lauf: nur gegen localhost, Seed-Passwort gesetzt, Backend erreichbar.
 * Die Tests legen Konten an und ändern Eintragungen, das darf nie auf Dev oder Prod passieren.
 */
export default async function globalSetup() {
  for (const url of Object.values(URLS)) {
    const host = new URL(url).hostname;
    if (host !== 'localhost' && !host.endsWith('.localhost')) {
      throw new Error(`E2E-Tests laufen nur lokal, nicht gegen ${url}`);
    }
  }
  seedPassword();
  const res = await fetch(`${URLS.api}/health`).catch(() => null);
  if (!res?.ok) {
    throw new Error(`Backend unter ${URLS.api} nicht erreichbar. Zuerst npm run dev:docker starten (siehe e2e/README.md).`);
  }
}
