import { ImageResponse } from 'next/og';
import { getOrganization } from '@schichtplan/shared';
import { OgIcon, cachedOgImage, getRequestOrigin, loadBrandLogo, loadImage, ogVersion } from '@schichtplan/ui/og';
import { getDepartmentPreview } from '@/lib/og';

/**
 * App-Icon mit dem Logo der Abteilung: für das Manifest, den Browser-Tab und Push-Mitteilungen.
 * `?size=64|96|192|512`; `?maskable=1` lässt Rand frei, weil Android das Icon rund oder als Tropfen zuschneidet;
 * `?plain=1` ohne weissen Hintergrund (Favicon, Badge).
 */
const SIZES = [64, 96, 192, 512];
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const size = SIZES.find((n) => String(n) === params.get('size')) ?? 192;
  const maskable = params.get('maskable') === '1';
  const plain = !maskable && params.get('plain') === '1';
  const [{ origin, host }, department] = await Promise.all([getRequestOrigin(), getDepartmentPreview()]);
  const org = getOrganization(host);
  const v = ogVersion(department?.name, department?.logoUrl, department?.primaryColor);
  return cachedOgImage(`app-icon:${host}:${size}:${maskable ? 'm' : plain ? 'p' : 'a'}:${v}`, 10 * 60 * 1000, async () => {
    const [logo, brandLogo] = await Promise.all([loadImage(department?.logoUrl, origin), loadBrandLogo(host)]);
    return new ImageResponse(
      <OgIcon
        logo={logo ?? brandLogo}
        accent={department?.primaryColor ?? org.primaryColor}
        size={size}
        inset={maskable ? 0.6 : plain ? 1 : 0.8}
        transparent={plain}
      />,
      { width: size, height: size }
    );
  });
}
