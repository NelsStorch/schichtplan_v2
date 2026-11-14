import './globals.css';
import type { Metadata, Viewport } from 'next';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';
import { ConsoleBanner, FeedbackProvider, OrganizationProvider, ThemeScript, UsageTracker } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { getRequestOrigin, ogImage, ogVersion, safeAccent } from '@schichtplan/ui/og';
import { CommandPalette, CommandPaletteProvider } from '@/components/command';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { getDepartmentPreview, previewTitle } from '@/lib/og';
import { PortalProvider } from '@/lib/portal';

/**
 * Pro Abteilung (Subdomain) eigener Titel für Link-Vorschauen: Abteilungsname und -logo. Anlässe haben ihre
 * eigene Vorschau (events/[slug]/metadata.ts), soweit die Anlass-Seite sie auch ohne Login zeigt.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const department = await getDepartmentPreview();
  const brandName = org.name;
  const title = previewTitle(department?.name, brandName);
  // ?v= ändert sich mit Name, Logo und Farbe: Messenger holen dann das neue Bild statt der alten Kopie
  const version = [department?.name, department?.logoUrl, department?.primaryColor];
  const image = ogImage(`${origin}/og`, title, ...version);
  const description = department
    ? 'Alle Anlässe und offenen Schichten an einem Ort. Schicht aussuchen, eintragen, fertig.'
    : `Schichten für Chilbi, Lager und ${org.orgName}-Anlässe: anschauen, eintragen, fertig.`;
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
      // PNG, denn iOS kann kein SVG als Homescreen-Icon
      apple: { url: `/apple-touch-icon.png?v=${ogVersion(...version)}`, sizes: '180x180', type: 'image/png' },
    },
    appleWebApp: { capable: true, title: 'Schichtplan', statusBarStyle: 'black-translucent' },
    openGraph: { type: 'website', siteName: brandName, locale: 'de_CH', title, description, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

// Kein maximum-scale/user-scalable: Zoomen muss möglich bleiben (Barrierefreiheit).
// Das iOS-Auto-Zoom auf Inputs verhindern stattdessen 16px-Schriftgrössen in Feldern.
export async function generateViewport(): Promise<Viewport> {
  const { host } = await getRequestOrigin();
  const department = await getDepartmentPreview();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    // Abteilungsfarbe: färbt die Browserleiste und den Rand der Vorschau in Discord/Telegram
    themeColor: safeAccent(department?.primaryColor ?? getOrganization(host).primaryColor),
  };
}

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
        <ConsoleBanner />
      </body>
    </html>
  );
}
