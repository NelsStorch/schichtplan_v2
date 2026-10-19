import { ImageResponse } from 'next/og';
import {
  OG_SIZE,
  OgCard,
  cachedOgImage,
  getRequestOrigin,
  loadCeviLogo,
  loadRemoteLogo,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

/** Vorschaubild jeder Abteilungs-Seite (auch Anlässe): Abteilungsname, -logo und -farbe. */
export async function GET() {
  const { origin, host } = await getRequestOrigin();
  // Name, Logo oder Farbe der Abteilung können sich ändern: nach 10 Minuten neu zeichnen
  return cachedOgImage(host, 10 * 60 * 1000, async () => {
    const [department, ceviLogo] = await Promise.all([getDepartmentPreview(), loadCeviLogo()]);
    const logo = (await loadRemoteLogo(department?.logoUrl, origin)) ?? ceviLogo;
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          accent={safeAccent(department?.primaryColor)}
          title={department?.name ?? 'Cevi Schichtplan'}
          subtitle="Schichten anschauen, eintragen, fertig."
          host={host}
        />
      ),
      OG_SIZE
    );
  });
}
