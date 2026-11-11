'use client';

import { LifeBuoy, LogIn } from 'lucide-react';
import { helpUrl, loginBaseUrl } from '@schichtplan/shared';
import { NotFoundView, useOrganization } from '@schichtplan/ui';

export default function NotFound() {
  const org = useOrganization();
  return (
    <NotFoundView
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
