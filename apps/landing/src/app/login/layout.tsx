import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Weiterleitung zum Login',
  description: 'Du wirst zum zentralen Login des Cevi Schichtplans weitergeleitet.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
