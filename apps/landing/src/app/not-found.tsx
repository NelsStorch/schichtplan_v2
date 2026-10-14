'use client';

import { LogIn, Search } from 'lucide-react';
import { NotFoundView } from '@schichtplan/ui';

export default function NotFound() {
  return (
    <NotFoundView
      homeHref="/"
      homeLabel="Zurück zur Startseite"
      secondaryActions={[
        {
          label: 'Abteilungen durchsuchen',
          href: '/#abteilungen',
          icon: <Search className="size-3.5" />,
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
