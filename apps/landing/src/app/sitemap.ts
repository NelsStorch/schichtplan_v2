import type { MetadataRoute } from 'next';
import { getRequestOrigin } from '@schichtplan/ui/og';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { origin } = await getRequestOrigin();
  return [
    { url: `${origin}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/datenschutz`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
