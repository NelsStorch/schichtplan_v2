import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import {
  OgCard,
  cachedOgImage,
  getRequestOrigin,
  loadBrandLogo,
  loadRemoteLogo,
  ogImageOptions,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

/** Vorschaubild der Abteilungs-Seite (und interner Anlässe): Abteilungsname, -logo und -farbe. */
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
          title={department?.name ?? org.name}
          subtitle="Schicht aussuchen, eintragen, fertig."
          eyebrow={org.name}
          host={host}
        />
      ),
      await ogImageOptions()
    );
  });
}
