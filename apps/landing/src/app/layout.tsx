import './globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';
import { FeedbackProvider, ThemeScript, UsageTracker } from '@schichtplan/ui';
import type { Metadata, Viewport } from 'next';
import { OG_SIZE, getRequestOrigin } from '@schichtplan/ui/og';
import { JsonLd } from '@/components/JsonLd';

const TITLE = 'Cevi Schichtplan · Helferliste & Schichtplan für Vereine (Kostenlos)';
const DESCRIPTION =
  'Schichtplan und Helferliste für Chilbi, Lager & Vereinsanlässe. Helfer tragen sich in 10 Sekunden per Link ein – ohne App & Passwort. 100% kostenlos mit Schweizer Datenschutz.';

export async function generateMetadata(): Promise<Metadata> {
  const { origin } = await getRequestOrigin();
  const image = {
    url: `${origin}/og`,
    ...OG_SIZE,
    alt: 'Cevi Schichtplan: Kostenlose Schicht- und Helferplanung für Schweizer Vereine & Cevi-Abteilungen',
  };

  return {
    metadataBase: new URL(origin),
    title: { default: TITLE, template: '%s · Cevi Schichtplan' },
    description: DESCRIPTION,
    keywords: [
      'Cevi Schichtplan',
      'Helferplanung',
      'Schichtplan Verein',
      'Chilbi Schichtliste',
      'Freiwillige Helfer einteilen',
      'Cevi.DB',
      'Hitobito',
      'PfiLa Helfer',
      'Sommerlager Schichtplan',
      'Doodle Alternative Verein',
      'Excel Schichtplan Vorlage',
      'Helferliste online',
      'Pfadi Schichtplan',
      'Jubla Helferplanung',
      'Vereinsanlass Helfer',
      'Schweizer Vereine',
      'Helferbörse',
      'Helferkoordination Schweiz',
    ],
    authors: [{ name: 'Cevi Schichtplan', url: 'https://cevi-schichtplan.ch' }],
    creator: 'Cevi Schichtplan Team',
    publisher: 'Cevi Schichtplan',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    alternates: {
      canonical: origin,
    },
    icons: {
      icon: [
        { url: '/images/cevi-logo.svg', type: 'image/svg+xml' },
        { url: '/images/cevi-logo.png', type: 'image/png' },
      ],
      apple: '/images/cevi-logo.png',
    },
    openGraph: {
      type: 'website',
      siteName: 'Cevi Schichtplan',
      locale: 'de_CH',
      alternateLocale: ['de_DE'],
      title: TITLE,
      description: DESCRIPTION,
      url: origin,
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
