import './globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';
import { FeedbackProvider, ThemeScript, UsageTracker } from '@schichtplan/ui';
import type { Metadata, Viewport } from 'next';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';
import { JsonLd } from '@/components/JsonLd';

const TITLE = 'Cevi Schichtplan · Helferliste & Schichtplan für Cevi-Abteilungen';
// Höchstens ~155 Zeichen, sonst kürzt Google die Beschreibung
const DESCRIPTION =
  'Kostenlose Helferliste online für Chilbi, Lager und Anlässe von Cevi-Abteilungen. Helfer*innen tragen sich per Link ein, ohne App und ohne Passwort.';

export async function generateMetadata(): Promise<Metadata> {
  const { origin } = await getRequestOrigin();
  const image = {
    url: `${origin}/og`,
    ...OG_SIZE,
    alt: 'Cevi Schichtplan: Kostenlose Schicht- und Helferplanung für Cevi-Abteilungen',
  };

  return {
    metadataBase: new URL(origin),
    title: { default: TITLE, template: '%s · Cevi Schichtplan' },
    description: DESCRIPTION,
    authors: [{ name: 'Cevi Schichtplan', url: `${origin}/` }],
    creator: 'Cevi Schichtplan Team',
    publisher: 'Cevi Schichtplan',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    alternates: {
      canonical: `${origin}/`,
    },
    icons: {
      // Nur das SVG: Sonst laden manche Browser zusätzlich das 54-KB-PNG
      icon: [{ url: '/images/cevi-logo.svg', type: 'image/svg+xml' }],
      apple: '/images/cevi-logo.png',
    },
    openGraph: {
      type: 'website',
      siteName: 'Cevi Schichtplan',
      locale: 'de_CH',
      alternateLocale: ['de_DE'],
      title: TITLE,
      description: DESCRIPTION,
      url: `${origin}/`,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: [image],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    category: 'technology',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#e11d48',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { origin } = await getRequestOrigin();

  return (
    <html lang="de-CH" className={`${fontVariables} scroll-smooth`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <JsonLd origin={origin} />
        <link rel="alternate" type="text/markdown" href="/llms.txt" title="LLM context" />
        <link rel="alternate" type="text/markdown" href="/llms-full.txt" title="Full LLM context" />
      </head>
      <body className="min-h-[100dvh] bg-canvas text-fg antialiased flex flex-col selection:bg-accent selection:text-white grain">
        <FeedbackProvider>{children}</FeedbackProvider>
        <UsageTracker app="landing" />
      </body>
    </html>
  );
}
