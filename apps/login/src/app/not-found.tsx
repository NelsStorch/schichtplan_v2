'use client';

import { ExternalLink } from 'lucide-react';
import { NotFoundView, useOrganization } from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared';

export default function NotFound() {
  const orgDomain = useOrganization().domain;

  return (
    <NotFoundView
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
