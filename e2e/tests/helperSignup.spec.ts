import { type APIRequestContext, expect, test } from '@playwright/test';
import { URLS } from './env';
import { type TestEvent, adminApi, createTestEvent, deleteTestEvent, loginOnDepartment } from './helpers';

/** Helfer 2 aus dem Seed: Heimabteilung Demo, keine Rechte */
const HELPER = 'helfer2@example.com';

test.describe('Helfende: eintragen, Meine Schichten, austragen', () => {
  let api: APIRequestContext;
  let event: TestEvent;

  test.beforeAll(async () => {
    api = await adminApi();
    event = await createTestEvent(api, 'eintragen');
  });
  test.afterAll(async () => {
    await deleteTestEvent(api, event.slug);
    await api.dispose();
  });

  test('ganzer Ablauf', async ({ page }) => {
    await loginOnDepartment(page, HELPER);

    // Eintragen
    await page.goto(`${URLS.web}/events/${event.slug}`);
    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
    await page.getByRole('button', { name: `In ${event.shiftTitle} eintragen`, exact: true }).click();
    await expect(page.getByText('Du bist eingetragen!')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Du bist 1× eingetragen' })).toBeVisible();

    // Meine Schichten
    await page.goto(`${URLS.web}/meine-schichten`);
    await expect(page.getByText(event.shiftTitle).first()).toBeVisible();

    // Austragen: Schicht-Karte öffnen (als Knopf beschriftet mit Zeit und Titel, z. B. «Do 10:00 E2E-Schicht …»)
    await page.goto(`${URLS.web}/events/${event.slug}`);
    const card = new RegExp(String.raw`\d{2}:\d{2} ${event.shiftTitle}`);
    await page.getByRole('button', { name: card }).first().click();
    await page.getByText('Aus dieser Arbeit austragen').click();
    await page.getByRole('button', { name: 'Austragen', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Du bist 1× eingetragen' })).toHaveCount(0);
    await expect(page.getByText('0 von 3 besetzt')).toBeVisible();
  });

  test('ohne Anmeldung: Anlass sichtbar, aber zuerst anmelden', async ({ page }) => {
    await page.goto(`${URLS.web}/events/${event.slug}`);
    await expect(page.getByRole('heading', { name: event.title })).toBeVisible();
    await expect(page.getByText('Zum Eintragen anmelden')).toBeVisible();
  });
});
