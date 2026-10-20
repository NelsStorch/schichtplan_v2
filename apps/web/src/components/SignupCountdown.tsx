'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { cn } from '@schichtplan/ui';
import { formatZurichDateTime } from '@schichtplan/shared';

interface SignupCountdownProps {
  opensAt: string;
  onOpen?: () => void;
  className?: string;
  compact?: boolean;
  /** Seite automatisch neu laden, sobald der Countdown abläuft (Standard: true) */
  autoReload?: boolean;
  /** Optionale Schicht-ID, die nach dem Reload im Dialog geöffnet werden soll */
  reloadShiftId?: string | null;
}

export function SignupCountdown({
  opensAt,
  onOpen,
  className,
  compact = false,
  autoReload = true,
  reloadShiftId,
}: SignupCountdownProps) {
  const [diff, setDiff] = useState<number>(() => new Date(opensAt).getTime() - Date.now());
  const hasTriggeredRef = useRef(false);
  const reloadShiftIdRef = useRef(reloadShiftId);
  reloadShiftIdRef.current = reloadShiftId;

  useEffect(() => {
    const target = new Date(opensAt).getTime();
    const initialRemaining = target - Date.now();

    // Falls der Zeitpunkt beim ersten Mount schon vorbei ist, nicht neu laden
    if (initialRemaining <= 0) {
      setDiff(0);
      return;
    }

    let animId: number | null = null;
    let timerId: ReturnType<typeof setInterval> | null = null;
    let reloadTimerId: ReturnType<typeof setTimeout> | null = null;

    const triggerOpen = () => {
      if (hasTriggeredRef.current) return;
      hasTriggeredRef.current = true;
      setDiff(0);
      onOpen?.();

      if (autoReload && typeof window !== 'undefined') {
        // 400ms Delay für die optische Rückmeldung ("Jetzt freigeschaltet!"),
        // danach Seite neu laden, damit alle Daten, Berechtigungen und Eintragen-Knöpfe
        // direkt frisch vom Server geladen werden.
        reloadTimerId = setTimeout(() => {
          const shiftId = reloadShiftIdRef.current;
          if (shiftId) {
            const url = new URL(window.location.href);
            url.searchParams.set('schicht', shiftId);
            window.location.href = url.toString();
          } else {
            window.location.reload();
          }
        }, 400);
      }
    };

    const update = () => {
      const remaining = target - Date.now();
      setDiff(remaining);

      if (remaining <= 0) {
        triggerOpen();
        return false;
      }
      return true;
    };

    const run = () => {
      const remaining = target - Date.now();
      setDiff(remaining);

      if (remaining <= 0) {
        triggerOpen();
        return;
      }

      // Unter 1 Minute (< 60s): Millisekunden-Genauigkeit mit requestAnimationFrame
      if (remaining <= 60 * 1000) {
        const loop = () => {
          const stillRunning = update();
          if (stillRunning) {
            animId = requestAnimationFrame(loop);
          }
        };
        animId = requestAnimationFrame(loop);
      } else if (remaining <= 10 * 60 * 1000) {
        // Zwischen 1 und 10 Minuten: Sekundentakt (250ms Poll für geschmeidigen Übergang)
        timerId = setInterval(() => {
          const rem = target - Date.now();
          setDiff(rem);
          if (rem <= 60 * 1000) {
            if (timerId) clearInterval(timerId);
            run();
          }
        }, 250);
      } else {
        // Mehr als 10 Minuten (bis 24 Stunden): Sekundentakt
        timerId = setInterval(() => {
          const rem = target - Date.now();
          setDiff(rem);
          if (rem <= 10 * 60 * 1000) {
            if (timerId) clearInterval(timerId);
            run();
          }
        }, 1000);
      }
    };

    run();

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      if (timerId !== null) clearInterval(timerId);
      if (reloadTimerId !== null) clearTimeout(reloadTimerId);
    };
  }, [opensAt, onOpen, autoReload]);

  if (diff <= 0) {
    if (compact) {
      return (
        <span className={cn('inline-flex items-center gap-1.5 font-semibold text-success-ink', className)}>
          <Sparkles className="size-4 animate-bounce text-success" />
          <span>Jetzt freigeschaltet!</span>
        </span>
      );
    }
    return (
      <div
        className={cn(
          'rounded-card border border-success/40 bg-success/10 p-3.5 sm:p-4 text-center transition-all duration-300 shadow-sm',
          className
        )}
      >
        <div className="flex items-center justify-center gap-2 text-sm sm:text-base font-bold text-success-ink">
          <Sparkles className="size-5 animate-bounce text-success" />
          <span>Jetzt freigeschaltet! Seite wird aktualisiert...</span>
        </div>
        <p className="mt-1 text-2xs text-fg-muted">Du kannst dich jetzt direkt für Schichten eintragen.</p>
      </div>
    );
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (diff > ONE_DAY_MS) {
    return (
      <span className={cn('text-xs text-fg-muted', className)}>
        Öffnet am {formatZurichDateTime(opensAt)}
      </span>
    );
  }

  // Phasen:
  // 1. diff > 10 Min: Stunden & Minuten
  // 2. 1 Min < diff <= 10 Min: Minuten & Sekunden
  // 3. diff <= 1 Min: Sekunden & Millisekunden
  let timeDisplay = '';
  let subLabel = '';
  let isFinalRush = false;

  if (diff > 10 * 60 * 1000) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    timeDisplay = `${hours > 0 ? `${hours}h ` : ''}${minutes}m`;
    subLabel = `${hours > 0 ? `${hours} Std. ` : ''}${minutes} Min.`;
  } else if (diff > 60 * 1000) {
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    timeDisplay = `${pad(minutes)}:${pad(seconds)}`;
    subLabel = `${minutes} Min. ${seconds} Sek.`;
  } else {
    isFinalRush = true;
    const seconds = Math.floor(diff / 1000);
    const millis = Math.floor(diff % 1000);
    const pad3 = (n: number) => String(n).padStart(3, '0');
    const pad2 = (n: number) => String(n).padStart(2, '0');
    timeDisplay = `${pad2(seconds)}.${pad3(millis)}s`;
    subLabel = `${seconds} Sek. ${millis} ms`;
  }

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums',
          isFinalRush ? 'text-accent-ink animate-pulse' : 'text-fg',
          className
        )}
      >
        <Clock className={cn('size-3.5', isFinalRush ? 'text-accent animate-spin' : 'text-fg-subtle')} />
        <span>{timeDisplay}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        'rounded-card border transition-all duration-300',
        isFinalRush
          ? 'border-accent bg-accent/15 p-3.5 sm:p-4 shadow-md ring-2 ring-accent/30'
          : diff <= 10 * 60 * 1000
          ? 'border-warning/50 bg-warning/10 p-3.5 sm:p-4'
          : 'border-line bg-surface-2 p-3 sm:p-3.5',
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              isFinalRush
                ? 'bg-accent text-accent-fg animate-pulse'
                : 'bg-surface text-fg-muted border border-line'
            )}
          >
            <Clock className="size-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-fg">
              {isFinalRush ? 'Gleich geht es los!' : 'Freischaltung zum Eintragen:'}
            </p>
            <p className="text-2xs text-fg-muted">
              {subLabel ? `Noch ${subLabel}` : 'In Kürze verfügbar'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div
            className={cn(
              'font-mono font-extrabold tracking-tight tabular-nums px-3 py-1.5 rounded-field border shadow-inner',
              isFinalRush
                ? 'text-lg sm:text-xl bg-accent text-accent-fg border-accent/40 animate-pulse'
                : 'text-base sm:text-lg bg-surface text-fg border-line'
            )}
          >
            {timeDisplay}
          </div>
        </div>
      </div>
    </div>
  );
}
