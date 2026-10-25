'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtStand } from './format';

const OFFLINE_SYNC_KEY = 'schichtplan.last_online_sync';

/** Speichert den Zeitstempel des letzten erfolgreichen Online-Datenabrufs im LocalStorage */
export function recordLastSyncTime(date: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_SYNC_KEY, date.toISOString());
  } catch {
    // LocalStorage könnte im privaten Modus blockiert sein
  }
}

/** Liest den Zeitstempel des letzten Online-Datenabrufs */
export function getLastSyncTime(): Date | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(OFFLINE_SYNC_KEY);
    if (!raw) return null;
    const date = new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Hook für den aktuellen Offline-Status und den Stand der gecachten Daten.
 * Wichtig: Wenn online, ist isOffline immer false und formattedStand irrelevant.
 */
export function useOfflineStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [standText, setStandText] = useState<string | null>(null);

  const updateStatus = useCallback(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const offline = !navigator.onLine;
    setIsOffline(offline);
    if (offline) {
      const last = getLastSyncTime();
      setStandText(last ? fmtStand(last) : null);
    }
  }, []);

  useEffect(() => {
    updateStatus();

    const handleOnline = () => {
      setIsOffline(false);
    };

    const handleOffline = () => {
      updateStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateStatus]);

  return {
    isOffline,
    formattedStand: standText,
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Hook für «Zum Home-Bildschirm hinzufügen» (PWA-Installation).
 * Unterstützt Android/Chrome vorinstall-Prompt und iOS Safari Anleitung.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Erkennen, ob bereits als PWA installiert (Standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // iOS Safari Erkennung
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIos(isIosDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setPromptEvent(null);
        return true;
      }
      return false;
    }
    if (isIos) {
      setShowIosGuide(true);
      return false;
    }
    return false;
  }, [promptEvent, isIos]);

  return {
    canInstall: !isInstalled && (Boolean(promptEvent) || isIos),
    isInstalled,
    isIos,
    showIosGuide,
    setShowIosGuide,
    install,
  };
}
