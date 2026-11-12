import type { MetadataRoute } from 'next';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin } from '@schichtplan/ui/og';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let org = getOrganization('cevi');
  try {
    const { host } = await getRequestOrigin();
    org = getOrganization(host);
  } catch {}

  return {
    name: org.name,
    short_name: 'Schichtplan',
    description: `Schichten für Chilbi, Lager und ${org.orgName}-Anlässe: anschauen, eintragen, fertig.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#e11d48',
    lang: 'de-CH',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Meine Schichten',
        short_name: 'Meine Schichten',
        description: 'Deine gebuchten Schichten und Zeiten',
        url: '/meine-schichten',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Anlässe & Schichten',
        short_name: 'Anlässe',
        description: 'Alle Anlässe und offene Schichten der Abteilung',
        url: '/',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
