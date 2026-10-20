import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Passwort vergessen',
  description: 'Link zum Zurücksetzen deines Passworts anfordern.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
