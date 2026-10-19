import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Anmelden',
  description: 'Melde dich an, um dich für Schichten einzutragen.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
