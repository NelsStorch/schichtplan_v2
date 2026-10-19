import { ImageResponse } from 'next/og';
import { OG_SIZE, OgCard, cachedOgImage, getRequestOrigin, loadCeviLogo } from '@schichtplan/ui/og';

export async function GET() {
  const { host } = await getRequestOrigin();
  // Inhalt ändert sich nur mit einem Deploy
  return cachedOgImage(host, 24 * 60 * 60 * 1000, async () => {
    const logo = await loadCeviLogo();
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          eyebrow="Cevi Schichtplan"
          title="Anmelden"
          subtitle="Ein Login für alle Abteilungen."
          host={host}
        />
      ),
      OG_SIZE
    );
  });
}
