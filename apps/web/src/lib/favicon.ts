'use client';

import { useEffect } from 'react';
import { getBrowserOrganization } from '@schichtplan/shared';

/**
 * Aktualisiert das Browser-Tab-Favicon dynamisch im DOM.
 * Unterstützt Verbandslogo, Abteilungs-Logos und Event-spezifische Logos.
 */
export function updateFavicon(iconUrl?: string | null) {
  if (typeof document === 'undefined') return;

  const defaultUrl = getBrowserOrganization().logoUrl;
  const url = iconUrl && iconUrl.trim().length > 0 ? iconUrl.trim() : defaultUrl;

  // Standard Favicon
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  link.href = url;
  if (url.endsWith('.svg')) {
    link.type = 'image/svg+xml';
  } else if (url.endsWith('.png')) {
    link.type = 'image/png';
  } else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) {
    link.type = 'image/jpeg';
  } else if (url.endsWith('.webp')) {
    link.type = 'image/webp';
  } else {
    link.removeAttribute('type');
  }

  // Das apple-touch-icon bleibt beim PNG vom Server (/apple-touch-icon.png): iOS kann kein SVG
}

/**
 * Hook: Aktualisiert das Favicon während die Komponente aktiv ist
 * und stellt beim Verlassen das Fallback-Icon wieder her.
 */
export function useDynamicFavicon(activeUrl?: string | null, fallbackUrl?: string | null) {
  useEffect(() => {
    updateFavicon(activeUrl || fallbackUrl);

    return () => {
      if (fallbackUrl !== undefined) {
        updateFavicon(fallbackUrl);
      }
    };
  }, [activeUrl, fallbackUrl]);
}
