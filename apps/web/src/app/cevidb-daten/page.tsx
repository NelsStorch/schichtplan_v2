'use client';

import { useEffect } from 'react';
import { getCeviDbDataUrl } from '@schichtplan/shared';

/**
 * Der Cevi.DB-Dateninspektor ist aus Sicherheitsgründen ausschliesslich auf dem
 * zentralen Login-Portal (login.<rootDomain>/cevidb-daten) verfügbar, da die
 * Admin-API auf Abteilungs-Subdomains gesperrt ist.
 * Diese Seite leitet automatisch auf das Login-Portal weiter.
 */
export default function WebCeviDbRedirectPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId') || undefined;
    window.location.replace(getCeviDbDataUrl(userId));
  }, []);

  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6 text-sm text-fg-muted">
      Weiterleitung zum Cevi.DB Daten-Inspektor...
    </div>
  );
}
