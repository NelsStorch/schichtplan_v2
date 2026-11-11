'use client';

import { useEffect } from 'react';
import { LifeBuoy, LogIn } from 'lucide-react';
import { helpUrl, loginBaseUrl } from '@schichtplan/shared';
import { ErrorView, useOrganization } from '@schichtplan/ui';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const org = useOrganization();

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
          label: 'Hilfe-Center',
          href: helpUrl('/', org.domain),
          external: true,
          icon: <LifeBuoy className="size-3.5" />,
        },
        {
          label: 'Zentrales Login',
          href: loginBaseUrl(org.domain),
          external: true,
          icon: <LogIn className="size-3.5" />,
        },
      ]}
    />
  );
}
