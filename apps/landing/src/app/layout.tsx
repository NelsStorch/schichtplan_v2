import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cevi Schichtplan - Die moderne Plattform für deine Abteilung',
  description: 'Schichtpläne für Chilbi, Lager & Cevi-Tage einfach online organisieren.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex flex-col selection:bg-rose-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
