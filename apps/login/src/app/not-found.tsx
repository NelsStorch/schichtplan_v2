'use client';

import { ExternalLink } from 'lucide-react';
import { NotFoundView } from '@schichtplan/ui';

export default function NotFound() {
  return (
    <NotFoundView
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
