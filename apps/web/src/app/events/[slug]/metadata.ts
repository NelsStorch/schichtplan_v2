import type { Metadata } from 'next';
import { formatZurichDateRange, formatZurichShiftWhen, getOrganization } from '@schichtplan/shared';
import { getRequestOrigin, ogImage } from '@schichtplan/ui/og';
import { getDepartmentPreview, getEventPreview, openSlotsLabel } from '@/lib/og';
import { eventOgResponse, isReplacementPreview, warmOgImage } from '@/lib/ogRender';

/**
 * Link-Vorschau eines Anlasses oder (mit `shiftId`) einer einzelnen Schicht, mit `wantsReplacement` als
 * «Ersatz gesucht». Nur soweit die Anlass-Seite die Angaben auch ohne Login zeigt: Bei Entwürfen und internen
 * Anlässen von Abteilungen «nur für Mitglieder» liefert das Backend nichts, dann bleibt es bei der Abteilungs-Vorschau.
 * Das Vorschaubild wird gleich mit vorbereitet, damit es bereitliegt, wenn WhatsApp es abholt.
 */
export async function eventPreviewMetadata(
  slug: string,
  shiftId?: string | null,
  wantsReplacement = false
): Promise<Metadata | null> {
  const [event, department, { origin, host }] = await Promise.all([
    getEventPreview(slug, shiftId),
    getDepartmentPreview(),
    getRequestOrigin(),
  ]);
  if (!event) return null;
  const shift = shiftId ? event.shift : null;
  if (shiftId && !shift) return null;
  warmOgImage(() => eventOgResponse(slug, shiftId ?? null, wantsReplacement));

  const org = getOrganization(host);
  const where = department?.name ?? org.name;
  const eventUrl = `${origin}/events/${encodeURIComponent(event.slug)}`;
  // ?v= ändert sich mit allem, was im Bild steht
  const version = [
    event.title,
    event.startDate,
    event.endDate,
    event.openSlots,
    event.logoUrl,
    event.bannerUrl,
    department?.name,
    department?.logoUrl,
    department?.primaryColor,
  ];

  if (shift) {
    const replacement = isReplacementPreview(event, wantsReplacement);
    const when = formatZurichShiftWhen(shift.startTime, shift.endTime);
    const title = replacement ? `Ersatz gesucht: ${shift.title} – ${event.title}` : `${shift.title} – ${event.title}`;
    const slots = openSlotsLabel(shift.openSlots, 'Schicht ist besetzt');
    const description = replacement
      ? `${when}. Für diese Schicht wird Ersatz gesucht. Übernimmst du? (${where})`
      : [`${when}.`, slots ? `${slots}.` : null, `${where}: jetzt eintragen.`].filter(Boolean).join(' ');
    const query = `schicht=${shift.id}${replacement ? '&ersatz=1' : ''}`;
    const image = ogImage(
      `${eventUrl}/og?${query}`,
      title,
      ...version,
      shift.title,
      shift.startTime,
      shift.endTime,
      shift.openSlots,
      replacement ? shift.replacementWanted : null
    );
    return {
      title,
      description,
      openGraph: { type: 'website', siteName: org.name, locale: 'de_CH', title, description, url: `${eventUrl}?${query}`, images: [image] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
  }

  const dates = formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime);
  const slots = openSlotsLabel(event.openSlots);
  const title = `${event.title} – ${where}`;
  const description = [`${dates}.`, slots ? `${slots}.` : null, 'Schicht aussuchen und eintragen.'].filter(Boolean).join(' ');
  const image = ogImage(`${eventUrl}/og`, title, ...version);
  return {
    title: event.title,
    description,
    openGraph: { type: 'website', siteName: org.name, locale: 'de_CH', title, description, url: eventUrl, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
