import type { MetadataRoute } from 'next';

/** Das Login-Portal gehört nicht in Suchmaschinen. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
