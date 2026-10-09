import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Anmelden – Cevi Schichtplan',
  description: 'Zentrales Login für Leiter*innen und Helfer*innen des Cevi Schichtplans',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-rose-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
