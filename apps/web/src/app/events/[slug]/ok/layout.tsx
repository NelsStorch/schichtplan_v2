import type { Metadata } from 'next';
import { OkLayout } from '@/components/ok/OkLayout';

export const metadata: Metadata = {
  title: 'OK-Bereich',
  description: 'Schichten planen und Helfende einteilen.',
  robots: { index: false, follow: false },
};

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <OkLayout slug={slug}>{children}</OkLayout>;
}
