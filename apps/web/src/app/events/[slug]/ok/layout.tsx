import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Organisation',
  description: 'Schichten planen und Helfer*innen einteilen.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
