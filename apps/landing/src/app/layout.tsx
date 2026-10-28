import './globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';
import { FeedbackProvider, ThemeScript, UsageTracker } from '@schichtplan/ui';
import type { Metadata, Viewport } from 'next';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';

const TITLE = 'Cevi Schichtplan · Ehrenamtliche Schichtplanung für Cevi-Abteilungen';
const DESCRIPTION =
  'Freiwilligeneinsätze an Chilbi, PfiLa und Lagern ohne Excel-Chaos organisieren. Jede Cevi-Abteilung auf ihrer eigenen Subdomain mit Cevi.DB Login.';

export async function generateMetadata(): Promise<Metadata> {
  const { origin } = await getRequestOrigin();
  const image = { url: `${origin}/og`, ...OG_SIZE, alt: 'Cevi Schichtplan: Ehrenamtliche Schichtplanung für Cevi-Abteilungen' };
  return {
    metadataBase: new URL(origin),
    title: { default: TITLE, template: '%s · Cevi Schichtplan' },
    description: DESCRIPTION,
    icons: {
      icon: [
        { url: '/images/cevi-logo.svg', type: 'image/svg+xml' },
        { url: '/images/cevi-logo.png', type: 'image/png' },
      ],
      apple: '/images/cevi-logo.png',
    },
    openGraph: { type: 'website', siteName: 'Cevi Schichtplan', locale: 'de_CH', title: TITLE, description: DESCRIPTION, url: '/', images: [image] },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [image] },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e11d48',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de-CH" className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh] bg-canvas text-fg antialiased flex flex-col selection:bg-accent selection:text-white grain">
        <FeedbackProvider>{children}</FeedbackProvider>
        <UsageTracker app="landing" />
      </body>
    </html>
  );
}
