import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConsoleBanner, FeedbackProvider, ThemeScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';

export const metadata: Metadata = {
  title: 'Admin · Cevi Schichtplan',
  description: 'Verwaltung für globale Admins des Cevi Schichtplans',
  robots: { index: false, follow: false },
  openGraph: { siteName: 'Cevi Schichtplan', locale: 'de_CH', title: 'Admin · Cevi Schichtplan' },
  icons: {
    icon: [
      { url: '/images/cevi-logo.svg', type: 'image/svg+xml' },
      { url: '/images/cevi-logo.png', type: 'image/png' },
    ],
    apple: '/images/cevi-logo.png',
  },
};

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
        <ConsoleBanner />
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
