import type { Metadata } from 'next';
import './globals.css';
import { fontVariables } from '@schichtplan/ui/fonts';

export const metadata: Metadata = {
  title: 'Anmelden – Cevi Schichtplan',
  description: 'Zentrales Login für Leiter*innen und Helfer*innen des Cevi Schichtplans',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bis zum Redesign dieser App fest dunkel: die Seiten nutzen noch hartkodierte slate-Farben
  return (
    <html lang="de" className={`dark ${fontVariables}`} data-theme="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-rose-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
