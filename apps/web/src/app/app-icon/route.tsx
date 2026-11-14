import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import { OgIcon, cachedOgImage, getRequestOrigin, loadBrandLogo, loadImage } from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

/**
 * App-Icon der installierten Web-App (Manifest) mit dem Logo der Abteilung.
 * `?size=192|512`, `?maskable=1` lässt Rand frei, weil Android das Icon rund oder als Tropfen zuschneidet.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const size = params.get('size') === '512' ? 512 : 192;
  const maskable = params.get('maskable') === '1';
  const { origin, host } = await getRequestOrigin();
  const org = getOrganization(host);
  return cachedOgImage(`app-icon:${host}:${size}:${maskable ? 'm' : 'a'}`, 10 * 60 * 1000, async () => {
    const [department, brandLogo] = await Promise.all([getDepartmentPreview(), loadBrandLogo(host)]);
    const logo = (await loadImage(department?.logoUrl, origin)) ?? brandLogo;
    return new ImageResponse(
      <OgIcon logo={logo} accent={department?.primaryColor ?? org.primaryColor} size={size} inset={maskable ? 0.6 : 0.8} />,
      { width: size, height: size }
    );
  });
}
