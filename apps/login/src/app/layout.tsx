import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OrganizationProvider, ThemeScript, UsageTracker, accentVars } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';

export async function generateMetadata(): Promise<Metadata> {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const title = `Anmelden · ${org.name}`;
  const description = `Zentrales Login für Leiter*innen und Helfer*innen des ${org.name}s`;
  const image = { url: `${origin}/og`, ...OG_SIZE, alt: `Anmelden beim ${org.name}` };
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${org.name}` },
    description,
    icons: {
      icon: [{ url: org.logoUrl, type: 'image/svg+xml' }],
      apple: org.logoUrl,
    },
    openGraph: { type: 'website', siteName: org.name, locale: 'de_CH', title, description, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: org.primaryColor,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verband schon auf dem Server aus dem Host bestimmen: Logo und Name stimmen ab dem ersten Rendern
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  const orgSlug = getOrganizationSlugFromHost(host);
  return (
    <html
      lang="de-CH"
      className={fontVariables}
      style={accentVars(org.primaryColor) as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh]">
        <OrganizationProvider slug={orgSlug}>{children}</OrganizationProvider>
        <UsageTracker app="login" />
      </body>
    </html>
  );
}
