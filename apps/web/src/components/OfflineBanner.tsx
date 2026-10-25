'use client';

import { WifiOff } from 'lucide-react';
import { useOfflineStatus } from '@/lib/offline';

/**
 * Offline-Hinweis mit Stand der gecachten Daten.
 * Vorgabe: «und anzeigen von wann der stand ist (nur wenn offline sonst nichts anzeigen)».
 * Rendert strikt null, wenn online.
 */
export function OfflineBanner() {
  const { isOffline, formattedStand } = useOfflineStatus();

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-warning/30 bg-warning/15 px-4 py-2.5 text-center text-xs font-medium text-warning-ink backdrop-blur-sm sm:text-sm"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2">
        <WifiOff className="size-4 shrink-0 text-warning-ink" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Offline-Modus:</strong>{' '}
          {formattedStand ? `Stand: ${formattedStand}. ` : ''}
          Nur Leseansicht (Eintragen und Austragen erfordert Internet).
        </span>
      </div>
    </div>
  );
}
