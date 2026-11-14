import type { Metadata } from 'next';
import EventDetailPage from './EventDetailPage';
import { eventPreviewMetadata } from './metadata';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Schicht-Link (`?schicht=ID`): eigene Vorschau mit Schicht, Zeit und freien Plätzen, mit `&ersatz=1` als
 * «Ersatz gesucht». Ohne Schicht (oder bei internen Anlässen) gilt die Vorschau aus dem Layout.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const shiftId = first(query.schicht) ?? first(query.shift);
  if (!shiftId) return {};
  return (await eventPreviewMetadata(slug, shiftId, first(query.ersatz) === '1')) ?? {};
}

export default function Page({ params }: Props) {
  return <EventDetailPage params={params} />;
}
