import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';

/**
 * Nur die Startseite darf in Suchmaschinen erscheinen. `/$` ist der exakte Pfad «/», die längere Regel schlägt `Disallow: /`.
 * `_next/static` und `images` bleiben offen, damit Google die Seite korrekt darstellen kann; `/og` für Link-Vorschauen.
 * Die Staging-Umgebung (`dev.` und `*.dev.`) wird komplett gesperrt.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { origin, host } = await getRequestOrigin();
  const isStaging = /^([^.]+\.)?dev\./.test(host);
  if (isStaging) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: ['/$', '/og', '/images/', '/_next/static/'], disallow: '/' },
    sitemap: `${origin}/sitemap.xml`,
  };
}
