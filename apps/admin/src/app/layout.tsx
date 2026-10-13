import type { Metadata, Viewport } from 'next';
import './globals.css';
import { FeedbackProvider, ThemeScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';

export const metadata: Metadata = {
  title: 'Admin · Cevi Schichtplan',
  description: 'Verwaltung für globale Admins des Cevi Schichtplans',
  robots: { index: false, follow: false },
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
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
