import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Abteilung anlegen',
  description: 'Lege für deine Cevi-Abteilung einen eigenen Schichtplan mit Subdomain an.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
