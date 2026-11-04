import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';

/**
 * Robots.txt-Konfiguration für Cevi Schichtplan:
 * - Staging (dev. und *.dev.) wird vollständig gesperrt.
 * - In Produktion ist die Landingpage, /llms.txt und /llms-full.txt für Suchmaschinen & KI-Agenten freigegeben.
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
        allow: [
          '/',
          '/llms.txt',
          '/llms-full.txt',
          '/og',
          '/images/',
          '/_next/static/',
          '/favicon.ico',
        ],
        disallow: ['/profil', '/login', '/api/'],
      },
      {
        userAgent: [
          'OAI-SearchBot',
          'GPTBot',
          'ChatGPT-User',
          'PerplexityBot',
          'Google-Extended',
          'ClaudeBot',
          'Applebot-Extended',
          'Diffbot',
          'cohere-ai',
          'Meta-ExternalAgent',
        ],
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: ['/profil', '/login', '/api/'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
