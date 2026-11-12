import type { Metadata } from 'next';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    title: `${org.unitTerm} wählen`,
    description: `Wähle deine ${org.unitTerm} und Stufen für den ${org.name}.`,
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
