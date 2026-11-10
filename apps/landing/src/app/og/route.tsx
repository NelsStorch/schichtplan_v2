import { ImageResponse } from 'next/og';
import { OG_SIZE, OgCard, cachedOgImage, getRequestOrigin, loadBrandLogo } from '@schichtplan/ui/og';
import { getOrganization } from '@schichtplan/shared';

export async function GET() {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);

  // Inhalt ändert sich nur mit einem Deploy
  return cachedOgImage(host, 24 * 60 * 60 * 1000, async () => {
    const logo = await loadBrandLogo(host);
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          title={`Schichtplanung für ${org.targetGroup}`}
          subtitle="Helfereinsätze an Lagern und Festen ohne Excel-Chaos."
          host={host}
        />
      ),
      OG_SIZE
    );
  });
}
