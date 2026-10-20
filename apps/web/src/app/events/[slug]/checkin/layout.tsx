import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Check-in',
  description: 'Bei deiner Schicht einchecken.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
