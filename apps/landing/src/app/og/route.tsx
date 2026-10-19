import { ImageResponse } from 'next/og';
import { OG_SIZE, OgCard, getRequestOrigin, loadCeviLogo } from '@schichtplan/ui/og';

export async function GET() {
  const [logo, { host }] = await Promise.all([loadCeviLogo(), getRequestOrigin()]);
  return new ImageResponse(
    (
      <OgCard
        logo={logo}
        title="Schichtplanung für Cevi-Abteilungen"
        subtitle="Helfereinsätze an Chilbi, PfiLa und Lagern ohne Excel-Chaos."
        host={host}
      />
    ),
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
  );
}
