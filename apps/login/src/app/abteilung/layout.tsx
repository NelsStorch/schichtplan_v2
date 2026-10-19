import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Abteilung wählen',
  description: 'Wähle deine Heimabteilung und Stufen für den Cevi Schichtplan.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
