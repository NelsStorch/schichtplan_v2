import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';

const TITLE = 'Anmelden · Cevi Schichtplan';
const DESCRIPTION = 'Zentrales Login für Leiter*innen und Helfer*innen des Cevi Schichtplans';

export async function generateMetadata(): Promise<Metadata> {
  const { origin } = await getRequestOrigin();
  const image = { url: `${origin}/og`, ...OG_SIZE, alt: 'Anmelden beim Cevi Schichtplan' };
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
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
