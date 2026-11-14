import type { Metadata } from 'next';
import EventDetailPage from './EventDetailPage';
import { eventPreviewMetadata } from './metadata';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Schicht-Link (`?schicht=ID`): eigene Vorschau mit Schicht, Zeit und freien Plätzen. Ohne Schicht
 * (oder bei internen Anlässen) gilt die Vorschau aus dem Layout.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const raw = query.schicht ?? query.shift;
  const shiftId = Array.isArray(raw) ? raw[0] : raw;
  if (!shiftId) return {};
  return (await eventPreviewMetadata(slug, shiftId)) ?? {};
}

export default function Page({ params }: Props) {
  return <EventDetailPage params={params} />;
}
