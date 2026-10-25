'use client';

import { useEffect } from 'react';

/**
 * Registriert den Service Worker für Offline-Fähigkeit und Caching im Browser.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Registrierung im Browser
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Bei Seitenaufruf prüfen, ob ein SW-Update vorliegt
        registration.update().catch(() => {});
      })
      .catch((err) => {
        // Lokale Entwicklung ohne HTTPS oder unsupported Environment ignorieren
        if (process.env.NODE_ENV === 'development') {
          console.debug('[SW] Registration failed:', err);
        }
      });
  }, []);

  return null;
}
