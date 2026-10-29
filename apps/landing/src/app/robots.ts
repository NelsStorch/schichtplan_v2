import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';

/**
 * Robots.txt-Konfiguration für Cevi Schichtplan:
 * - Staging (dev. und *.dev.) wird vollständig gesperrt.
 * - In Produktion ist die Landingpage und /llms.txt für Suchmaschinen & KI-Agenten freigegeben.
 * - Interne & geschützte Pfade (/profil, /login, /api/) sind gesperrt.
 * - Wichtige Assets (_next/static, images, og) bleiben crawlbar für sauberes Rendering und Rich Previews.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { origin, host } = await getRequestOrigin();
  const isStaging = /^([^.]+\.)?dev\./.test(host);

  if (isStaging) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/llms.txt', '/og', '/images/', '/_next/static/', '/favicon.ico'],
        disallow: ['/profil', '/login', '/api/'],
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'ClaudeBot', 'PerplexityBot', 'Applebot-Extended'],
        allow: ['/', '/llms.txt'],
        disallow: ['/profil', '/login', '/api/'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
