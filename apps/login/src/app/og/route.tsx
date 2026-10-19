import { ImageResponse } from 'next/og';
import { OG_SIZE, OgCard, getRequestOrigin, loadCeviLogo } from '@schichtplan/ui/og';

export async function GET() {
  const [logo, { host }] = await Promise.all([loadCeviLogo(), getRequestOrigin()]);
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
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
  );
}
