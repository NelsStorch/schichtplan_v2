'use client';

import { useEffect } from 'react';
import { CalendarDays, Clock, ExternalLink } from 'lucide-react';
import { ErrorView } from '@schichtplan/ui';
import { usePortal } from '@/lib/portal';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { department } = usePortal();

  useEffect(() => {
    console.error('Unhandled app error:', error);
  }, [error]);

  return (
    <ErrorView
      error={error}
      reset={reset}
      departmentName={department?.name}
      departmentLogoUrl={department?.logoUrl}
      homeHref="/"
      homeLabel="Zurück zur Übersicht"
      secondaryActions={[
        {
          label: 'Alle Anlässe',
          href: '/',
          icon: <CalendarDays className="size-3.5" />,
        },
        {
          label: 'Meine Schichten',
          href: '/meine-schichten',
          icon: <Clock className="size-3.5" />,
        },
        {
          label: 'Hauptportal',
          href: 'https://cevi-schichtplan.ch',
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
