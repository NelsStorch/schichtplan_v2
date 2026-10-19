import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cevi.DB-Daten',
  description: 'Diese Angaben haben wir bei der Anmeldung über die Cevi.DB erhalten.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
