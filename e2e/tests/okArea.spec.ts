import { type APIRequestContext, expect, test } from '@playwright/test';
import { ADMIN_EMAIL, URLS } from './env';
import { type TestEvent, adminApi, createTestEvent, deleteTestEvent, loginOnDepartment } from './helpers';

test.describe('OK-Bereich', () => {
  let api: APIRequestContext;
  let event: TestEvent;

  test.beforeAll(async () => {
    api = await adminApi();
    event = await createTestEvent(api, 'ok');
  });
  test.afterAll(async () => {
    await deleteTestEvent(api, event.slug);
    await api.dispose();
  });

  test('Abteilungsleitung sieht Übersicht und Arbeiten-Katalog', async ({ page }) => {
    await loginOnDepartment(page, ADMIN_EMAIL);
    await page.goto(`${URLS.web}/events/${event.slug}/ok`);
    await expect(page.getByText('Neue Schicht').first()).toBeVisible();

    await page.goto(`${URLS.web}/events/${event.slug}/ok/schichten/arbeiten`);
    await expect(page.getByText('Bar & Ausschank')).toBeVisible();
  });

  test('Helfende ohne Rechte kommen nicht an OK-Daten', async ({ page }) => {
    await loginOnDepartment(page, 'helfer2@example.com');
    const status = await page.evaluate(async (slug) => (await fetch(`/api/events/${slug}/logs`)).status, event.slug);
    expect(status).toBe(403);
  });
});
