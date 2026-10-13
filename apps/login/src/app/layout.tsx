import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';

export const metadata: Metadata = {
  title: 'Anmelden · Cevi Schichtplan',
  description: 'Zentrales Login für Leiter*innen und Helfer*innen des Cevi Schichtplans',
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
