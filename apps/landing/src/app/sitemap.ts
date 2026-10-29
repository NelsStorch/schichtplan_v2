import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { origin } = await getRequestOrigin();
  const now = new Date();

  return [
    {
      url: `${origin}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ];
}
