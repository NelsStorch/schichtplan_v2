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
    <html lang="de" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col selection:bg-rose-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
