import type { Metadata } from 'next';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    title: 'E-Mail bestätigen',
    description: `Bestätige deine E-Mail-Adresse, um dein Konto im ${org.name} zu aktivieren.`,
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
