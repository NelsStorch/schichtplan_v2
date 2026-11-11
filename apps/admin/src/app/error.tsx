'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { ErrorView } from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled admin error:', error);
  }, [error]);

  return (
    <ErrorView
      badge="Admin-Portal · 500"
      title="Admin-Fehler aufgetreten"
      description="Ein Fehler ist im Admin-Portal aufgetreten. Versuch es erneut oder kehr zur Übersicht zurück."
      error={error}
      reset={reset}
      homeHref="/"
      homeLabel="Zur Admin-Übersicht"
      secondaryActions={[
        {
          label: 'Hauptportal',
          href: getLandingUrl(),
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
