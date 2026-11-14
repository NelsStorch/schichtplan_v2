import type { Metadata } from 'next';
import { eventPreviewMetadata } from './metadata';

const FALLBACK: Metadata = {
  title: 'Anlass',
  description: 'Schichten des Anlasses ansehen und dich eintragen.',
};

/** Link-Vorschau mit Titel, Datum und freien Plätzen, soweit ohne Login sichtbar (siehe metadata.ts) */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const preview = await eventPreviewMetadata(slug);
  return { robots: { index: false, follow: false }, ...(preview ?? FALLBACK) };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
