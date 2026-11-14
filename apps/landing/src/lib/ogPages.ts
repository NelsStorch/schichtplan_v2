import { getOrganization } from '@schichtplan/shared';
import { type OgSubpage, getRequestOrigin, ogSubpageMetadata } from '@schichtplan/ui/og';

type Org = ReturnType<typeof getOrganization>;

/** Unterseiten der Landingpage mit eigener Link-Vorschau. Schlüssel = Pfad ohne Schrägstrich. */
export const LANDING_PAGES = {
  datenschutz: (org: Org) => ({
    title: 'Datenschutzerklärung',
    description: `Welche Personendaten der ${org.name} bearbeitet, wozu und welche Rechte du hast (nDSG).`,
    subtitle: 'Welche Daten wir bearbeiten und welche Rechte du hast.',
  }),
  profil: (org: Org) => ({
    title: 'Mein Profil',
    description: `Deine Angaben, ${org.unitTerm}, Stufen und eigenen Schichten im ${org.name} verwalten.`,
    subtitle: `Angaben, ${org.unitTerm} und eigene Schichten verwalten.`,
  }),
} satisfies Record<string, (org: Org) => OgSubpage>;

export type LandingPageKey = keyof typeof LANDING_PAGES;

export function landingPage(key: string | null | undefined, org: Org): OgSubpage | null {
  return key && Object.hasOwn(LANDING_PAGES, key) ? LANDING_PAGES[key as LandingPageKey](org) : null;
}

/** Metadaten samt eigenem Vorschaubild für eine Unterseite der Landingpage */
export async function landingPageMetadata(key: LandingPageKey) {
  const { host } = await getRequestOrigin();
  return ogSubpageMetadata(key, `/${key}`, LANDING_PAGES[key](getOrganization(host)));
}
