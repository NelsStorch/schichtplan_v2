import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import {
  OG_SIZE,
  OgCard,
  cachedOgImage,
  getRequestOrigin,
  loadBrandLogo,
  loadRemoteLogo,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

/** Vorschaubild jeder Abteilungs-Seite (auch Anlässe): Abteilungsname, -logo und -farbe. */
export async function GET() {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  // Name, Logo oder Farbe der Abteilung können sich ändern: nach 10 Minuten neu zeichnen
  return cachedOgImage(host, 10 * 60 * 1000, async () => {
    const [department, brandLogo] = await Promise.all([getDepartmentPreview(), loadBrandLogo(host)]);
    const logo = (await loadRemoteLogo(department?.logoUrl, origin)) ?? brandLogo;
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          accent={safeAccent(department?.primaryColor ?? org.primaryColor)}
          title={department?.name ?? `${org.name} Schichtplan`}
          subtitle="Schichten anschauen, eintragen, fertig."
          eyebrow={`${org.name} Schichtplan`}
          host={host}
        />
      ),
      OG_SIZE
    );
  });
}
