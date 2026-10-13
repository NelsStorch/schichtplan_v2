import './globals.css';
import type { Metadata, Viewport } from 'next';
import { FeedbackProvider, ThemeScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
import { PortalProvider } from '@/lib/portal';

export const metadata: Metadata = {
  title: { default: 'Cevi Schichtplan', template: '%s · Cevi Schichtplan' },
  description: 'Schichten für Chilbi, Lager und Cevi-Anlässe: anschauen, eintragen, fertig.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/images/cevi-logo.svg', type: 'image/svg+xml' },
      { url: '/images/cevi-logo.png', type: 'image/png' },
    ],
    apple: '/images/cevi-logo.png',
  },
  appleWebApp: { capable: true, title: 'Schichtplan', statusBarStyle: 'black-translucent' },
};

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
        </FeedbackProvider>
      </body>
    </html>
  );
}
