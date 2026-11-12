import type { Metadata } from 'next';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    title: 'Mein Profil',
    description: `Deine Angaben, ${org.unitTerm}, Stufen und eigenen Schichten im ${org.name} verwalten.`,
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
