import './globals.css';
import type { Metadata, Viewport } from 'next';
import { FeedbackProvider, ThemeScript, UsageTracker } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { getDepartmentPreview } from '@/lib/og';
import { PortalProvider } from '@/lib/portal';

const DESCRIPTION = 'Schichten für Chilbi, Lager und Cevi-Anlässe: anschauen, eintragen, fertig.';

/**
 * Pro Abteilung (Subdomain) eigener Titel für Link-Vorschauen. Bewusst nur Abteilungsname und -logo:
 * Anlässe können intern oder «nur für Mitglieder» sein, ihre Titel gehören nicht in eine öffentliche Vorschau.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { origin } = await getRequestOrigin();
  const department = await getDepartmentPreview();
  const title = department ? `${department.name} · Cevi Schichtplan` : 'Cevi Schichtplan';
  const image = { url: `${origin}/og`, ...OG_SIZE, alt: title };
  const description = department
    ? `Schichten und Anlässe der ${department.name}: anschauen, eintragen, fertig.`
    : DESCRIPTION;
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: '%s · Cevi Schichtplan' },
    description,
    robots: { index: false, follow: false },
    manifest: '/manifest.json',
    icons: {
      icon: [
        { url: '/images/cevi-logo.svg', type: 'image/svg+xml' },
        { url: '/images/cevi-logo.png', type: 'image/png' },
      ],
      apple: '/images/cevi-logo.png',
    },
    appleWebApp: { capable: true, title: 'Schichtplan', statusBarStyle: 'black-translucent' },
    openGraph: { type: 'website', siteName: 'Cevi Schichtplan', locale: 'de_CH', title, description, url: '/', images: [image] },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh]">
        <FeedbackProvider>
          <PortalProvider>{children}</PortalProvider>
          <ServiceWorkerRegister />
        </FeedbackProvider>
        <UsageTracker app="web" />
      </body>
    </html>
  );
}
