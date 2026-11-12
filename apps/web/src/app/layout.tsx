import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';
import { FeedbackProvider, OrganizationProvider, ThemeScript, UsageTracker } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';
import { CommandPalette, CommandPaletteProvider } from '@/components/command';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { getDepartmentPreview } from '@/lib/og';
import { PortalProvider } from '@/lib/portal';

/**
 * Pro Abteilung (Subdomain) eigener Titel für Link-Vorschauen. Bewusst nur Abteilungsname und -logo:
 * Anlässe können intern oder «nur für Mitglieder» sein, ihre Titel gehören nicht in eine öffentliche Vorschau.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const department = await getDepartmentPreview();
  const brandName = `${org.name} Schichtplan`;
  const title = department ? `${department.name} · ${brandName}` : brandName;
  const image = { url: `${origin}/og`, ...OG_SIZE, alt: title };
  const description = department
    ? `Schichten und Anlässe der ${department.name}: anschauen, eintragen, fertig.`
    : `Schichten für Chilbi, Lager und ${org.name}-Anlässe: anschauen, eintragen, fertig.`;
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${brandName}` },
    description,
    robots: { index: false, follow: false },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: org.logoUrl, type: 'image/svg+xml' },
      ],
      apple: org.logoUrl,
    },
    appleWebApp: { capable: true, title: 'Schichtplan', statusBarStyle: 'black-translucent' },
    openGraph: { type: 'website', siteName: brandName, locale: 'de_CH', title, description, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

// Kein maximum-scale/user-scalable: Zoomen muss möglich bleiben (Barrierefreiheit).
// Das iOS-Auto-Zoom auf Inputs verhindern stattdessen 16px-Schriftgrössen in Feldern.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e11d48',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { host } = await getRequestOrigin();
  const orgSlug = getOrganizationSlugFromHost(host);
  return (
    <html lang="de-CH" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh]">
        <OrganizationProvider slug={orgSlug}>
        <FeedbackProvider>
          <PortalProvider>
            <CommandPaletteProvider>
              {children}
              <CommandPalette />
              <PwaInstallBanner />
            </CommandPaletteProvider>
          </PortalProvider>
          <ServiceWorkerRegister />
        </FeedbackProvider>
        </OrganizationProvider>
        <UsageTracker app="web" />
      </body>
    </html>
  );
}
