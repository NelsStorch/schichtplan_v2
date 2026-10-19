import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'E-Mail bestätigen',
  description: 'Bestätige deine E-Mail-Adresse, um dein Konto im Cevi Schichtplan zu aktivieren.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
