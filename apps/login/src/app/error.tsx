'use client';

import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { ErrorView } from '@schichtplan/ui';
import { getLandingUrl, getOrganization } from '@schichtplan/shared';

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

  const org = typeof window !== 'undefined' ? getOrganization(window.location.host) : undefined;
  const orgDomain = org?.domain ?? 'cevi-schichtplan.ch';

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
