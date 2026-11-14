import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import { OgIcon, cachedOgImage, getRequestOrigin, loadBrandLogo, loadRemoteLogo } from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

const SIZE = 180;

/** Homescreen-Icon für iOS (und Link-Vorschauen, die es als Favicon nehmen): Abteilungslogo als PNG. */
export async function GET() {
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  return cachedOgImage(`icon:${host}`, 10 * 60 * 1000, async () => {
    const [department, brandLogo] = await Promise.all([getDepartmentPreview(), loadBrandLogo(host)]);
    const logo = (await loadRemoteLogo(department?.logoUrl, origin)) ?? brandLogo;
    return new ImageResponse(<OgIcon logo={logo} accent={department?.primaryColor ?? org.primaryColor} size={SIZE} />, {
      width: SIZE,
      height: SIZE,
    });
  });
}
