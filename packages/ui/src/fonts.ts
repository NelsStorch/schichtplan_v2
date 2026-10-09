import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google';

// Display: charakterstarke Grotesk für Titel & Zahlen. Text: Geist. Zeiten/IDs: Geist Mono.
// Selbst gehostet via next/font (kein Google-Request zur Laufzeit).
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

/** Auf <html> setzen: `<html className={fontVariables}>` */
export const fontVariables = `${display.variable} ${sans.variable} ${mono.variable}`;
