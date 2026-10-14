'use client';

import { useEffect } from 'react';
import { LogIn, Search } from 'lucide-react';
import { ErrorView } from '@schichtplan/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled landing error:', error);
  }, [error]);

  return (
    <ErrorView
      error={error}
      reset={reset}
      homeHref="/"
      homeLabel="Zurück zur Startseite"
      secondaryActions={[
        {
          label: 'Abteilungen durchsuchen',
          href: '/#abteilungen',
          icon: <Search className="size-3.5" />,
        },
        {
          label: 'Zentrales Login',
          href: 'https://login.cevi-schichtplan.ch',
          external: true,
          icon: <LogIn className="size-3.5" />,
        },
      ]}
    />
  );
}
