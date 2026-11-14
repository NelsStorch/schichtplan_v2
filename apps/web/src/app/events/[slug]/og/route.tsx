import { ImageResponse } from 'next/og';
import { formatZurichDateRange, getOrganization } from '@schichtplan/shared';
import {
  OgCard,
  cachedOgImage,
  getRequestOrigin,
  loadBrandLogo,
  loadRemoteLogo,
  ogImageOptions,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview, getEventPreview, openSlotsLabel } from '@/lib/og';

/**
 * Vorschaubild eines öffentlichen Anlasses: Titel, Datum und freie Plätze. Interne Anlässe und Entwürfe
 * bekommen 404 (das Backend liefert für sie keine Vorschau-Daten), ihre Seite verweist auf das Abteilungsbild.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const event = await getEventPreview(slug);
  if (!event) return new Response('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  // Freie Plätze ändern sich laufend: nach 5 Minuten neu zeichnen. Nur existierende Anlässe landen im Cache.
  return cachedOgImage(`${host}/events/${event.slug}`, 5 * 60 * 1000, async () => {
    const [department, brandLogo] = await Promise.all([getDepartmentPreview(), loadBrandLogo(host)]);
    const logo =
      (await loadRemoteLogo(event.logoUrl, origin)) ?? (await loadRemoteLogo(department?.logoUrl, origin)) ?? brandLogo;
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          accent={safeAccent(department?.primaryColor ?? org.primaryColor)}
          title={event.title}
          subtitle={[formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime), department?.name]
            .filter(Boolean)
            .join(' · ')}
          badge={openSlotsLabel(event.openSlots)}
          eyebrow={org.name}
          host={host}
        />
      ),
      await ogImageOptions()
    );
  });
}
