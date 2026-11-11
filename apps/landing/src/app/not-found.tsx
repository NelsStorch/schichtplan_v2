'use client';

import { LifeBuoy, LogIn } from 'lucide-react';
import { helpUrl, loginBaseUrl } from '@schichtplan/shared';
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
          href: loginBaseUrl(),
          external: true,
          icon: <LogIn className="size-3.5" />,
        },
      ]}
    />
  );
}
