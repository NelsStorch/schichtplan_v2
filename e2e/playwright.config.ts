import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-End-Tests der wichtigsten Abläufe gegen die lokale Umgebung (npm run dev:docker)
 * mit den Demodaten aus dem Seed (Abteilung «demo»). Ablauf und Voraussetzungen: e2e/README.md.
 *
 * Bewusst nur lokal: Die Tests legen Konten an und tragen sich in Schichten ein.
 */
export default defineConfig({
  testDir: './tests',
  // Die Tests teilen sich die Demodaten (z. B. Plätze in Schichten): nacheinander laufen lassen
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    // Next-Dev-Server kompilieren Seiten beim ersten Aufruf: grosszügige Wartezeiten
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
