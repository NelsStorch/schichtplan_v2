import type { Metadata } from 'next';
import { loginPageMetadata } from '@/lib/ogPages';

export async function generateMetadata(): Promise<Metadata> {
  return loginPageMetadata('abteilung-erstellen');
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
