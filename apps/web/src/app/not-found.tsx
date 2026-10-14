'use client';

import { CalendarDays, Clock, ExternalLink } from 'lucide-react';
import { NotFoundView } from '@schichtplan/ui';
import { usePortal } from '@/lib/portal';

export default function NotFound() {
  const { department } = usePortal();

  return (
    <NotFoundView
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
