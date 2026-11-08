import { expect, test } from '@playwright/test';
import { URLS } from './env';

test.describe('Abteilung «Nur für Mitglieder» (Datenschutz)', () => {
  test('ohne Anmeldung keine Anlässe, nur der Hinweis', async ({ page }) => {
    await page.goto(`${URLS.web}/`);
    await expect(page.getByText('Diese Abteilung zeigt ihre Anlässe nur Mitgliedern.')).toBeVisible();
    await expect(page.getByText('Sommerlager 2026')).toHaveCount(0);
  });

  test('ohne Anmeldung liefert die API keinen Arbeitskatalog', async ({ page }) => {
    await page.goto(`${URLS.web}/`);
    const status = await page.evaluate(async () => (await fetch('/api/tasks')).status);
    expect(status).toBe(401);
  });
});
