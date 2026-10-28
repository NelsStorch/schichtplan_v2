'use client';

import { LifeBuoy, LogIn } from 'lucide-react';
import { helpUrl } from '@schichtplan/shared';
import { NotFoundView } from '@schichtplan/ui';

export default function NotFound() {
  return (
    <NotFoundView
      homeHref="/"
      homeLabel="Zurück zur Startseite"
      secondaryActions={[
        {
          label: 'Hilfe-Center',
          href: helpUrl(),
          external: true,
          icon: <LifeBuoy className="size-3.5" />,
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
