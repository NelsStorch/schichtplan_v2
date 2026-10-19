import { ImageResponse } from 'next/og';
import {
  OG_SIZE,
  OgCard,
  getRequestOrigin,
  loadCeviLogo,
  loadRemoteLogo,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

/** Vorschaubild jeder Abteilungs-Seite (auch Anlässe): Abteilungsname, -logo und -farbe. */
export async function GET() {
  const [{ origin, host }, department, ceviLogo] = await Promise.all([
    getRequestOrigin(),
    getDepartmentPreview(),
    loadCeviLogo(),
  ]);
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
    { ...OG_SIZE, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
  );
}
