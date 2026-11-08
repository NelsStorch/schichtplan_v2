import { expect, test } from '@playwright/test';
import { URLS, runId } from './env';

test.describe('Cevi-Name (ohne Passwort)', () => {
  test('neues Profil anlegen und damit wieder anmelden', async ({ page, browser }) => {
    const ceviName = `E2E${runId}`;
    const loginPage = `${URLS.login}/?return_to=${encodeURIComponent(`${URLS.web}/`)}`;

    const fillLogin = async (p: typeof page) => {
      await p.goto(loginPage);
      await p.getByText('Mit Cevi-Name', { exact: true }).click();
      await p.getByRole('textbox', { name: 'Cevi-Name oder Vorname' }).fill(ceviName);
      await p.getByPlaceholder('TT.MM.JJJJ').fill('02.02.2002');
      await p.getByRole('button', { name: 'Weiter' }).click();
    };

    // Erstes Mal: kein Profil, Registrierung mit Sicherheitshinweis
    await fillLogin(page);
    await expect(page.getByText('Kein Passwort-Schutz')).toBeVisible();
    await page.getByRole('textbox', { name: 'Vorname' }).fill('E2E');
    await page.getByRole('button', { name: 'Profil anlegen und weiter' }).click();
    await page.waitForURL((url) => url.href.startsWith(`${URLS.web}/`));

    // Zweites Mal (frischer Browser): gleicher Name und Geburtsdatum melden an
    const fresh = await browser.newContext();
    const second = await fresh.newPage();
    await fillLogin(second);
    await second.waitForURL((url) => url.href.startsWith(`${URLS.web}/`));
    await fresh.close();
  });

  test('falsches Geburtsdatum meldet nicht an', async ({ page }) => {
    await page.goto(`${URLS.login}/?return_to=${encodeURIComponent(`${URLS.web}/`)}`);
    await page.getByText('Mit Cevi-Name', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Cevi-Name oder Vorname' }).fill(`E2E${runId}`);
    await page.getByPlaceholder('TT.MM.JJJJ').fill('03.03.2003');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByText('Neu bei Demo-Abteilung?')).toBeVisible();
    expect(page.url()).toContain(URLS.login);
  });
});
