import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import { OgIcon, cachedOgImage, getRequestOrigin, loadBrandLogo } from '@schichtplan/ui/og';

const SIZE = 180;

/** Homescreen-Icon für iOS: Verbandslogo als PNG (iOS kann kein SVG). Ändert sich nur mit einem Deploy. */
export async function GET() {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return cachedOgImage(`icon:${host}`, 24 * 60 * 60 * 1000, async () => {
    const logo = await loadBrandLogo(host);
    return new ImageResponse(<OgIcon logo={logo} accent={org.primaryColor} size={SIZE} />, { width: SIZE, height: SIZE });
  });
}
