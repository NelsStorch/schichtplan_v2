import type { MetadataRoute } from 'next';
import { getOrganization } from '@schichtplan/shared';
import { getRequestOrigin, ogVersion, safeAccent } from '@schichtplan/ui/og';
import { appName, getDepartmentPreview } from '@/lib/og';

/**
 * Jede Abteilung ist eine eigene Subdomain und damit eine eigene installierbare App: Name, Farbe und Icon
 * kommen darum von der Abteilung (Icon mit ihrem Logo, siehe app-icon/route.tsx).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let org = getOrganization('cevi');
  let department: Awaited<ReturnType<typeof getDepartmentPreview>> = null;
  try {
    const { host } = await getRequestOrigin();
    org = getOrganization(host);
    department = await getDepartmentPreview();
  } catch {}

  const v = ogVersion(department?.name, department?.logoUrl, department?.primaryColor);
  const icon = (size: 192 | 512, purpose: 'any' | 'maskable') => ({
    src: `/app-icon?size=${size}${purpose === 'maskable' ? '&maskable=1' : ''}&v=${v}`,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose,
  });

  return {
    id: '/',
    name: appName(department?.name),
    // Unter dem Icon ist nur Platz für etwa 12 Zeichen; das Logo zeigt die Abteilung
    short_name: 'Schichtplan',
    description: department
      ? `Anlässe und Schichten der ${department.name}: anschauen, eintragen, fertig.`
      : `Schichten für Chilbi, Lager und ${org.orgName}-Anlässe: anschauen, eintragen, fertig.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: safeAccent(department?.primaryColor ?? org.primaryColor),
    lang: 'de-CH',
    icons: [icon(192, 'any'), icon(192, 'maskable'), icon(512, 'any'), icon(512, 'maskable')],
    shortcuts: [
      {
        name: 'Meine Schichten',
        short_name: 'Meine Schichten',
        description: 'Deine gebuchten Schichten und Zeiten',
        url: '/meine-schichten',
        icons: [{ src: `/app-icon?size=192&v=${v}`, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Anlässe & Schichten',
        short_name: 'Anlässe',
        description: 'Alle Anlässe und offene Schichten der Abteilung',
        url: '/',
        icons: [{ src: `/app-icon?size=192&v=${v}`, sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
