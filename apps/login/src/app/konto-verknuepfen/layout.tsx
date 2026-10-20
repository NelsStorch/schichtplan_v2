import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Konto verknüpfen',
  description: 'Cevi.DB mit deinem bestehenden Konto verbinden.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
