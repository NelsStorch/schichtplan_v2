'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { ErrorView } from '@schichtplan/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled login error:', error);
  }, [error]);

  return (
    <ErrorView
      error={error}
      reset={reset}
      homeHref="/"
      homeLabel="Zurück zum Login"
      secondaryActions={[
        {
          label: 'Hauptportal (cevi-schichtplan.ch)',
          href: 'https://cevi-schichtplan.ch',
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
