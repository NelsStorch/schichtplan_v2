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
    <html lang="de">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-white text-slate-900 antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
