import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mein Profil',
  description: 'Deine Angaben, Abteilung, Stufen und eigenen Schichten im Cevi Schichtplan verwalten.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
