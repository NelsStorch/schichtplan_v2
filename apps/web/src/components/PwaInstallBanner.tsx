'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useOrganization } from '@schichtplan/ui';
import { isPwaPromptDismissed, dismissPwaPrompt } from '@/lib/pwaDismissal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaInstallBanner() {
  const org = useOrganization();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Bereits als App (Standalone PWA) installiert?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone);

    if (isStandalone) return;

    // Kürzlich (innert 14 Tagen) oder in dieser Session weggedrückt?
    if (isPwaPromptDismissed()) {
      return;
    }

    // iOS Safari Erkennung (inkl. iPad)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && window.navigator.maxTouchPoints > 1);
    const isSafari = isIos && /safari/.test(ua) && !/crios|fxios|opios/.test(ua);

    if (isSafari) {
      setShowIosGuide(true);
      setVisible(true);
      return;
    }

    // Android / Chromium Browser: beforeinstallprompt abfangen
    const handler = (e: Event) => {
      // Vor dem Anzeigen nochmals prüfen (z. B. falls zwischenzeitlich weggedrückt)
      if (isPwaPromptDismissed()) return;
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {}
    // Sowohl bei Akzeptieren als auch bei Ablehnen: 14 Tage Pause
    dismissPwaPrompt();
    setVisible(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    dismissPwaPrompt();
  };

  if (!visible) return null;

  return (
    <aside
      aria-label="App-Installation"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg rounded-card border border-border-muted/80 bg-surface/95 p-4 shadow-lift backdrop-blur-md transition-all duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-field bg-accent/15 text-accent-fg">
          <Smartphone className="size-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">
            {org.name} als App installieren
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Schneller Zugriff auf deine Schichten und Offline-Ansicht auf dem Festgelände ohne Empfang.
          </p>

          {showIosGuide ? (
            <div className="mt-2.5 space-y-2.5">
              <div className="rounded-field bg-surface-muted/60 px-3 py-2 text-xs text-fg">
                <span className="font-medium">Auf dem iPhone/iPad:</span> Unten im Browser auf{' '}
                <span className="inline-flex items-center gap-0.5 font-semibold text-accent-fg">
                  <Share className="inline size-3.5" aria-hidden="true" /> Teilen
                </span>{' '}
                tippen und <strong className="font-semibold">«Zum Home-Bildschirm»</strong> wählen.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="inline-flex items-center gap-1.5 rounded-field bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-hover active:scale-95"
                >
                  Verstanden
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-field px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg"
                >
                  Später
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 rounded-field bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-hover active:scale-95"
              >
                <Download className="size-3.5" aria-hidden="true" />
                App installieren
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-field px-2.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg"
              >
                Später
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-field p-1 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
          aria-label="Hinweis schliessen"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
