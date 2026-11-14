import type { Metadata } from 'next';
import { landingPageMetadata } from '@/lib/ogPages';

export async function generateMetadata(): Promise<Metadata> {
  return landingPageMetadata('profil');
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
