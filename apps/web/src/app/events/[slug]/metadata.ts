import type { Metadata } from 'next';
import { formatZurichDateRange, formatZurichShiftWhen, getOrganization } from '@schichtplan/shared';
import { getRequestOrigin, ogImage } from '@schichtplan/ui/og';
import { getDepartmentPreview, getEventPreview, openSlotsLabel } from '@/lib/og';

/**
 * Link-Vorschau eines Anlasses oder (mit `shiftId`) einer einzelnen Schicht, soweit die Anlass-Seite die Angaben
 * auch ohne Login zeigt. Bei Entwürfen und internen Anlässen von Abteilungen «nur für Mitglieder» liefert das
 * Backend nichts, dann kommt null und es bleibt bei der allgemeinen Abteilungs-Vorschau.
 */
export async function eventPreviewMetadata(slug: string, shiftId?: string | null): Promise<Metadata | null> {
  const [event, department, { origin, host }] = await Promise.all([
    getEventPreview(slug, shiftId),
    getDepartmentPreview(),
    getRequestOrigin(),
  ]);
  if (!event) return null;
  const shift = shiftId ? event.shift : null;
  if (shiftId && !shift) return null;

  const org = getOrganization(host);
  const where = department?.name ?? org.name;
  const eventUrl = `${origin}/events/${encodeURIComponent(event.slug)}`;
  const versionBase = [event.title, event.logoUrl, event.bannerUrl, department?.name, department?.logoUrl, department?.primaryColor];

  if (shift) {
    const slots = openSlotsLabel(shift.openSlots, 'Schicht ist besetzt');
    const title = `${shift.title} – ${event.title}`;
    const description = [`${formatZurichShiftWhen(shift.startTime, shift.endTime)}.`, slots ? `${slots}.` : null, `${where}: jetzt eintragen.`]
      .filter(Boolean)
      .join(' ');
    const url = `${eventUrl}?schicht=${shift.id}`;
    const image = ogImage(
      `${eventUrl}/og?schicht=${shift.id}`,
      title,
      ...versionBase,
      shift.title,
      shift.startTime,
      shift.endTime,
      shift.openSlots
    );
    return {
      title,
      description,
      openGraph: { type: 'website', siteName: org.name, locale: 'de_CH', title, description, url, images: [image] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    };
  }

  const dates = formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime);
  const slots = openSlotsLabel(event.openSlots);
  const title = `${event.title} – ${where}`;
  const description = [`${dates}.`, slots ? `${slots}.` : null, 'Schicht aussuchen und eintragen.'].filter(Boolean).join(' ');
  // ?v= ändert sich mit Titel, Datum, Bildern, Farbe und freien Plätzen
  const image = ogImage(`${eventUrl}/og`, title, ...versionBase, event.startDate, event.endDate, event.openSlots);
  return {
    title: event.title,
    description,
    openGraph: { type: 'website', siteName: org.name, locale: 'de_CH', title, description, url: eventUrl, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
