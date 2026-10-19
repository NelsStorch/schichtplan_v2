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
          title="Schichtplanung für Cevi-Abteilungen"
          subtitle="Helfereinsätze an Chilbi, PfiLa und Lagern ohne Excel-Chaos."
          host={host}
        />
      ),
      OG_SIZE
    );
  });
}
