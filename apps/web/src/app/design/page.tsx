import { notFound } from 'next/navigation';
import { Styleguide } from './Styleguide';

export const metadata = { title: 'Design-System', robots: { index: false } };

/** Lebender Styleguide des Design-Systems (packages/ui). Nur in der Entwicklung erreichbar. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Styleguide />;
}
