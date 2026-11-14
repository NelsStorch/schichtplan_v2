import { getOrganization } from '@schichtplan/shared';
import { type OgSubpage, getRequestOrigin, ogSubpageMetadata } from '@schichtplan/ui/og';

type Org = ReturnType<typeof getOrganization>;

/** Unterseiten des Logins mit eigener Link-Vorschau. Schlüssel = Pfad ohne Schrägstrich. */
export const LOGIN_PAGES = {
  abteilung: (org: Org) => ({
    title: `${org.unitTerm} wählen`,
    description: `Wähle deine ${org.unitTerm} und Stufen für den ${org.name}.`,
    subtitle: `Deine ${org.unitTerm} und Stufen auswählen.`,
  }),
  'abteilung-erstellen': (org: Org) => ({
    title: `${org.unitTerm} anlegen`,
    description: `Lege für deine ${org.orgName}-${org.unitTerm} einen eigenen Schichtplan mit Subdomain an.`,
    subtitle: `Eigener Schichtplan für deine ${org.unitTerm}. Kostenlos.`,
  }),
  'konto-verknuepfen': (org: Org) => ({
    title: 'Konto verknüpfen',
    description: `${org.authProviderShort} mit deinem bestehenden Konto verbinden.`,
    subtitle: `${org.authProviderShort} mit deinem Konto verbinden.`,
  }),
  'verify-email': (org: Org) => ({
    title: 'E-Mail bestätigen',
    description: `Bestätige deine E-Mail-Adresse, um dein Konto im ${org.name} zu aktivieren.`,
    subtitle: 'Noch ein Klick, dann ist dein Konto aktiv.',
  }),
  'passwort-vergessen': () => ({
    title: 'Passwort vergessen',
    description: 'Link zum Zurücksetzen deines Passworts anfordern.',
    subtitle: 'Link zum Zurücksetzen anfordern.',
  }),
  'passwort-zuruecksetzen': () => ({
    title: 'Neues Passwort',
    description: 'Ein neues Passwort für dein Konto setzen.',
    subtitle: 'Ein neues Passwort für dein Konto setzen.',
  }),
  'zwei-faktor': () => ({
    title: 'Zwei-Faktor-Code',
    description: 'Anmeldung mit dem Code aus deiner Authenticator-App bestätigen.',
    subtitle: 'Anmeldung mit dem Code bestätigen.',
  }),
} satisfies Record<string, (org: Org) => OgSubpage>;

export type LoginPageKey = keyof typeof LOGIN_PAGES;

export function loginPage(key: string | null | undefined, org: Org): OgSubpage | null {
  return key && Object.hasOwn(LOGIN_PAGES, key) ? LOGIN_PAGES[key as LoginPageKey](org) : null;
}

/** Metadaten samt eigenem Vorschaubild für eine Login-Unterseite */
export async function loginPageMetadata(key: LoginPageKey) {
  const { host } = await getRequestOrigin();
  return ogSubpageMetadata(key, `/${key}`, LOGIN_PAGES[key](getOrganization(host)));
}
