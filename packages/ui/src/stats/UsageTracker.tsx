'use client';

import { useEffect } from 'react';
import { HELP_URL, type STATS_APPS } from '@schichtplan/shared';
import { trackUi } from './usage';

/** Höchstens so viele Browser-Fehler pro Seitenaufruf melden (eine Fehlerschleife soll nicht fluten) */
const MAX_ERRORS = 5;

function deviceClass(): 'phone' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  if (width < 640) return 'phone';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function isDark(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark' || theme === 'light') return theme === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Pfad einer Hilfeseite aus einem Link (nur auf das Hilfe-Center, ohne Anker und Query) */
function helpPath(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    const help = new URL(HELP_URL);
    return url.host === help.host ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * Einmal pro Seitenaufruf: welche App, Gerätegrösse (aus der Fensterbreite), hell/dunkel. Dazu Fehler
 * im Browser (nur die Anzahl) und Klicks auf Links ins Hilfe-Center (nur der Pfad der Hilfeseite).
 * Im Root-Layout einbinden.
 */
export function UsageTracker({ app, reportTheme = true }: { app: keyof typeof STATS_APPS; reportTheme?: boolean }) {
  useEffect(() => {
    trackUi('UI_APP_LOAD', app);
    trackUi('UI_DEVICE', deviceClass());
    if (reportTheme) trackUi('UI_THEME', isDark() ? 'dark' : 'light');

    let errors = 0;
    const onError = () => {
      if (errors++ < MAX_ERRORS) trackUi('UI_JS_ERROR', app);
    };
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]');
      const path = link ? helpPath(link.getAttribute('href') ?? '') : null;
      if (path) trackUi('UI_HELP_CLICK', path);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, [app, reportTheme]);

  return null;
}
