import './globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';
import {
  FeedbackProvider,
  OrganizationProvider,
  ThemeScript,
  ConsoleBanner,
  UsageTracker,
  accentVars,
} from '@schichtplan/ui';
import type { Metadata, Viewport } from 'next';
import { getRequestOrigin, ogImage } from '@schichtplan/ui/og';
import { JsonLd } from '@/components/JsonLd';
import { getOrganization, getOrganizationSlugFromHost } from '@schichtplan/shared';

export async function generateMetadata(): Promise<Metadata> {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  const title = `${org.name} · Helferliste & Schichtplan für ${org.targetGroup}`;
  const description = org.metaDescription;

  const image = ogImage(`${origin}/og`, `${org.name}: Kostenlose Schicht- und Helferplanung für ${org.targetGroup}`);

  return {
    metadataBase: new URL(origin),
    title: { default: title, template: `%s · ${org.name}` },
    description,
    authors: [{ name: org.name, url: `${origin}/` }],
    creator: `${org.name} Team`,
    publisher: org.name,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    alternates: {
      canonical: `${origin}/`,
    },
    icons: {
      icon: [{ url: org.logoUrl, type: 'image/svg+xml' }],
      // PNG, denn iOS kann kein SVG als Homescreen-Icon
      apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    },
    openGraph: {
      type: 'website',
      siteName: org.name,
      locale: 'de_CH',
      alternateLocale: ['de_DE'],
      title,
      description,
      url: `${origin}/`,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
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
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);

  return (
    <html
      lang="de-CH"
      className={`${fontVariables} scroll-smooth`}
      data-scroll-behavior="smooth"
      style={accentVars(org.primaryColor) as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <JsonLd origin={origin} org={org} />
        <link rel="alternate" type="text/markdown" href="/llms.txt" title="LLM context" />
        <link rel="alternate" type="text/markdown" href="/llms-full.txt" title="Full LLM context" />
      </head>
      <body className="min-h-[100dvh] bg-canvas text-fg antialiased flex flex-col selection:bg-accent selection:text-white grain">
        <OrganizationProvider slug={getOrganizationSlugFromHost(host)}>
          <FeedbackProvider>{children}</FeedbackProvider>
        </OrganizationProvider>
        <UsageTracker app="landing" />
        <ConsoleBanner />
      </body>
    </html>
  );
}
