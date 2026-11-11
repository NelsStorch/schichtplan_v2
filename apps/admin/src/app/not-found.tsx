'use client';

import { ExternalLink } from 'lucide-react';
import { NotFoundView } from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared';

export default function NotFound() {
  return (
    <NotFoundView
      badge="Admin-Portal · 404"
      title="Seite nicht gefunden"
      description="Diese Admin-Seite existiert nicht oder wurde verschoben."
      homeHref="/"
      homeLabel="Zur Admin-Übersicht"
      secondaryActions={[
        {
          label: 'Hauptportal',
          href: getLandingUrl(),
          external: true,
          icon: <ExternalLink className="size-3.5" />,
        },
      ]}
    />
  );
}
