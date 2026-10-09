import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cevi Schichtplan',
  description: 'Schichtplan-Verwaltung für Cevi-Events',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
