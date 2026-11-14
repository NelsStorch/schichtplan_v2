import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import { OgIcon, cachedOgImage, getRequestOrigin, loadBrandLogo, loadImage, ogVersion } from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

const SIZE = 180;

/** Homescreen-Icon für iOS (und Link-Vorschauen, die es als Favicon nehmen): Abteilungslogo als PNG. */
export async function GET() {
  const [{ origin, host }, department] = await Promise.all([getRequestOrigin(), getDepartmentPreview()]);
  const org = getOrganization(host);
  const v = ogVersion(department?.name, department?.logoUrl, department?.primaryColor);
  return cachedOgImage(`icon:${host}:${v}`, 10 * 60 * 1000, async () => {
    const [logo, brandLogo] = await Promise.all([loadImage(department?.logoUrl, origin), loadBrandLogo(host)]);
    return new ImageResponse(<OgIcon logo={logo ?? brandLogo} accent={department?.primaryColor ?? org.primaryColor} size={SIZE} />, {
      width: SIZE,
      height: SIZE,
    });
  });
}
