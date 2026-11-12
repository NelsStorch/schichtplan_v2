import type { Metadata } from 'next';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    title: `${org.unitTerm} anlegen`,
    description: `Lege für deine ${org.orgName}-${org.unitTerm} einen eigenen Schichtplan mit Subdomain an.`,
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
