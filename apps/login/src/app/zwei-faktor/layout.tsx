import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zwei-Faktor-Code',
  description: 'Anmeldung mit dem Code aus deiner Authenticator-App bestätigen.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
