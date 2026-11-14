import { ImageResponse } from 'next/og';
import { formatZurichDateRange, formatZurichShiftWhen, getOrganization } from '@schichtplan/shared';
import {
  OgCard,
  cachedOgImage,
  getRequestOrigin,
  loadBrandLogo,
  loadImage,
  ogImageOptions,
  safeAccent,
} from '@schichtplan/ui/og';
import { getDepartmentPreview, getEventPreview, isUuid, openSlotsLabel } from '@/lib/og';

/**
 * Vorschaubild eines öffentlichen Anlasses (Titel, Datum, freie Plätze, Banner im Hintergrund) oder mit
 * `?schicht=ID` einer einzelnen Schicht. Interne Anlässe und Entwürfe bekommen 404 (das Backend liefert für sie
 * keine Vorschau-Daten), ihre Seite verweist auf das Abteilungsbild.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shiftParam = new URL(request.url).searchParams.get('schicht');
  const shiftId = shiftParam && isUuid(shiftParam) ? shiftParam : null;
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const event = await getEventPreview(slug, shiftId);
  const shift = shiftId ? event?.shift : null;
  if (!event || (shiftId && !shift)) {
    return new Response('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  // Freie Plätze ändern sich laufend: nach 5 Minuten neu zeichnen. Nur existierende Anlässe/Schichten landen im Cache.
  return cachedOgImage(`${host}/events/${event.slug}/${shift?.id ?? ''}`, 5 * 60 * 1000, async () => {
    const [department, brandLogo, background] = await Promise.all([
      getDepartmentPreview(),
      loadBrandLogo(host),
      loadImage(event.bannerUrl, origin),
    ]);
    const logo = (await loadImage(event.logoUrl, origin)) ?? (await loadImage(department?.logoUrl, origin)) ?? brandLogo;
    const accent = safeAccent(department?.primaryColor ?? org.primaryColor);
    const card = shift ? (
      <OgCard
        logo={logo}
        accent={accent}
        background={background}
        title={shift.title}
        subtitle={`${formatZurichShiftWhen(shift.startTime, shift.endTime)} · ${event.title}`}
        badge={openSlotsLabel(shift.openSlots, 'Schicht ist besetzt')}
        eyebrow={department?.name ?? org.name}
        host={host}
      />
    ) : (
      <OgCard
        logo={logo}
        accent={accent}
        background={background}
        title={event.title}
        subtitle={[formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime), department?.name]
          .filter(Boolean)
          .join(' · ')}
        badge={openSlotsLabel(event.openSlots)}
        eyebrow={org.name}
        host={host}
      />
    );
    return new ImageResponse(card, await ogImageOptions());
  });
}
