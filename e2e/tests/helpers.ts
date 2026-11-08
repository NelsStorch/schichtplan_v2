import { type APIRequestContext, type Page, expect, request } from '@playwright/test';
import { ADMIN_EMAIL, DEPARTMENT_SLUG, URLS, runId, seedPassword } from './env';

/**
 * API als Demo-Admin, direkt am Backend (lokal bestimmt x-tenant-slug die Abteilung).
 * Nur für Testdaten, die Abläufe selbst laufen im Browser.
 */
export async function adminApi(): Promise<APIRequestContext> {
  const api = await request.newContext({
    baseURL: URLS.api,
    extraHTTPHeaders: { 'x-tenant-slug': DEPARTMENT_SLUG },
  });
  const res = await api.post('/api/auth/login', { data: { email: ADMIN_EMAIL, password: seedPassword() } });
  expect(res.ok(), `Admin-Login fehlgeschlagen (${res.status()}). Stimmt SEED_PASSWORD?`).toBeTruthy();
  return api;
}

export interface TestEvent {
  slug: string;
  title: string;
  shiftTitle: string;
}

/** Öffentlicher Anlass in der Zukunft mit einer Schicht (3 Plätze), eigener Slug pro Lauf */
export async function createTestEvent(api: APIRequestContext, name: string): Promise<TestEvent> {
  const slug = `e2e-${name}-${runId}`;
  const title = `E2E ${name} ${runId}`;
  const shiftTitle = `E2E-Schicht ${runId}`;
  const start = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const event = await api.post('/api/events', {
    data: { title, slug, startDate: start.toISOString(), accessType: 'PUBLIC' },
  });
  expect(event.ok(), `Anlass anlegen: ${event.status()} ${await event.text()}`).toBeTruthy();
  const { id } = await event.json();

  const shift = await api.post('/api/shifts', {
    data: { eventId: id, title: shiftTitle, startTime: start.toISOString(), endTime: end.toISOString(), requiredSlots: 3 },
  });
  expect(shift.ok(), `Schicht anlegen: ${shift.status()} ${await shift.text()}`).toBeTruthy();
  return { slug, title, shiftTitle };
}

export async function deleteTestEvent(api: APIRequestContext, slug: string) {
  await api.delete(`/api/events/${slug}`, { data: { confirm: slug } });
}

/**
 * Im Browser auf der Abteilungsseite anmelden. Lokal gilt das Cookie des Login-Portals (localhost:3002)
 * nicht für demo.localhost:3000, darum direkt über den API-Proxy der Abteilungsseite.
 * Den Login über das Portal selbst prüft login.spec.ts.
 */
export async function loginOnDepartment(page: Page, email: string) {
  await page.goto(`${URLS.web}/`);
  const status = await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email, password: seedPassword() }
  );
  expect(status, `Login als ${email}`).toBe(200);
}
