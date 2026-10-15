import './globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';
import { FeedbackProvider } from '@schichtplan/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cevi Schichtplan · Ehrenamtliche Schichtplanung für Cevi-Abteilungen',
  description: 'Freiwilligeneinsätze an Chilbi, PfiLa und Lagern ohne Excel-Chaos organisieren. Jede Cevi-Abteilung auf ihrer eigenen Subdomain mit Cevi.DB Login.',
  icons: {
    icon: [
      { url: '/images/cevi-logo.svg', type: 'image/svg+xml' },
      { url: '/images/cevi-logo.png', type: 'image/png' },
    ],
    apple: '/images/cevi-logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`dark ${fontVariables}`} data-theme="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-[100dvh] bg-canvas text-fg antialiased flex flex-col selection:bg-accent selection:text-white grain">
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
