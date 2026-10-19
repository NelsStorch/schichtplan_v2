import type { MetadataRoute } from 'next';

/** Abteilungs-Portale gehören nicht in Suchmaschinen, nur die Landingpage (cevi-schichtplan.ch). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
