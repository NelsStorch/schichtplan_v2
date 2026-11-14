import type { Metadata } from 'next';
import { formatZurichDateRange, getOrganization } from '@schichtplan/shared';
import { getRequestOrigin, ogImage } from '@schichtplan/ui/og';
import { getDepartmentPreview, getEventPreview, openSlotsLabel } from '@/lib/og';

const FALLBACK: Metadata = {
  title: 'Anlass',
  description: 'Schichten des Anlasses ansehen und dich eintragen.',
  robots: { index: false, follow: false },
};

/**
 * Link-Vorschau mit Titel, Datum und freien Plätzen, aber nur für öffentliche Anlässe. Bei internen Anlässen,
 * Anlässen nur für Leitende und Entwürfen liefert das Backend nichts: dann bleibt es bei der Abteilungs-Vorschau.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [event, department, { origin, host }] = await Promise.all([
    getEventPreview(slug),
    getDepartmentPreview(),
    getRequestOrigin(),
  ]);
  if (!event) return FALLBACK;

  const org = getOrganization(host);
  const dates = formatZurichDateRange(event.startDate, event.endDate, event.dayCutoffTime);
  const slots = openSlotsLabel(event.openSlots);
  const where = department?.name ?? org.name;
  const title = `${event.title} – ${where}`;
  const description = [`${dates}.`, slots ? `${slots}.` : null, 'Schicht aussuchen und eintragen.']
    .filter(Boolean)
    .join(' ');
  const url = `${origin}/events/${encodeURIComponent(event.slug)}`;
  // ?v= ändert sich mit Titel, Datum, Logo, Farbe und freien Plätzen
  const image = ogImage(
    `${url}/og`,
    title,
    event.title,
    event.startDate,
    event.endDate,
    event.logoUrl,
    event.openSlots,
    department?.name,
    department?.logoUrl,
    department?.primaryColor
  );
  return {
    title: event.title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: org.name, locale: 'de_CH', title, description, url, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
