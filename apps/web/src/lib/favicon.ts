'use client';

import { useEffect } from 'react';

/**
 * Aktualisiert das Browser-Tab-Favicon dynamisch im DOM.
 * Unterstützt Cevi-Logo, Abteilungs-Logos und Event-spezifische Logos.
 */
export function updateFavicon(iconUrl?: string | null) {
  if (typeof document === 'undefined') return;

  const url = iconUrl && iconUrl.trim().length > 0 ? iconUrl.trim() : '/images/cevi-logo.svg';

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

  // Apple Touch Icon
  let appleLink = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
  if (!appleLink) {
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  appleLink.href = url;
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
