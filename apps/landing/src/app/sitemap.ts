import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';

/**
 * Nur die Startseite: /datenschutz ist bewusst noindex, /login und /profil sind in robots.txt gesperrt.
 * Ohne lastModified, changeFrequency und priority: Ein Datum pro Abruf wäre falsch (Google ignoriert es dann),
 * die anderen beiden Angaben wertet Google nicht aus.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { origin } = await getRequestOrigin();

  return [{ url: `${origin}/` }];
}
