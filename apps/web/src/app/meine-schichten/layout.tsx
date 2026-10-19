import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meine Schichten',
  description: 'Deine eingetragenen Schichten im Überblick, mit Kalender-Export.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
