'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { ErrorView, useOrganization } from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared';

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

  const orgDomain = useOrganization().domain;

  return (
    <ErrorView
      error={error}
      reset={reset}
      homeHref="/"
      homeLabel="Zurück zum Login"
      secondaryActions={[
        {
          label: `Hauptportal (${orgDomain})`,
          href: getLandingUrl(),
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
