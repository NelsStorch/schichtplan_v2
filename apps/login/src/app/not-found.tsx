'use client';

import { ExternalLink } from 'lucide-react';
import { NotFoundView } from '@schichtplan/ui';
import { getLandingUrl, getOrganization } from '@schichtplan/shared';

export default function NotFound() {
  const org = typeof window !== 'undefined' ? getOrganization(window.location.host) : undefined;
  const orgDomain = org?.domain ?? 'cevi-schichtplan.ch';

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
