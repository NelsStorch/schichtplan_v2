import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Neues Passwort',
  description: 'Ein neues Passwort für dein Konto setzen.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
