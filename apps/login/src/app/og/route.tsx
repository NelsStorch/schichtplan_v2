import { ImageResponse } from 'next/og';
import { OgCard, cachedOgImage, getRequestOrigin, loadBrandLogo, ogImageOptions } from '@schichtplan/ui/og';
import { getOrganization } from '@schichtplan/shared';
import { loginPage } from '@/lib/ogPages';

/** Vorschaubild des Logins; mit `?seite=<Unterseite>` mit deren Titel (siehe lib/ogPages.ts) */
export async function GET(request: Request) {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  const key = new URL(request.url).searchParams.get('seite');
  const page = loginPage(key, org);
  // Inhalt ändert sich nur mit einem Deploy; unbekannte Seiten teilen sich das Standardbild
  return cachedOgImage(`${host}:${page ? key : ''}`, 24 * 60 * 60 * 1000, async () => {
    const logo = await loadBrandLogo(host);
    return new ImageResponse(
      (
        <OgCard
          logo={logo}
          eyebrow={org.name}
          accent={org.primaryColor}
          title={page?.title ?? 'Anmelden'}
          subtitle={page?.subtitle ?? `Ein Login für alle ${org.unitTermPlural}.`}
          host={host}
        />
      ),
      await ogImageOptions()
    );
  });
}
