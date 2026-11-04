'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronsRight,
  Clock,
  CupSoda,
  Sparkles,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import { SWISS_TIMEZONE, type CateringTokenDto } from '@schichtplan/shared';
import { Badge, Card, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtTime, fmtWeekday } from '@/lib/format';

interface CateringTokenCardProps {
  token: CateringTokenDto;
  slug: string;
  onRedeemed?: (updated: CateringTokenDto) => void;
  isManager?: boolean;
}

/** Erkennt anhand des Titels das passende Icon */
function getTokenIcon(title: string) {
  const t = title.toLowerCase();
  if (
    t.includes('getränk') ||
    t.includes('trinken') ||
    t.includes('bier') ||
    t.includes('cola') ||
    t.includes('mineral') ||
    t.includes('kaffee')
  ) {
    return <CupSoda className="size-5 shrink-0" />;
  }
  if (
    t.includes('menü') ||
    t.includes('essen') ||
    t.includes('burger') ||
    t.includes('bratwurst') ||
    t.includes('kuchen') ||
    t.includes('pommes')
  ) {
    return <UtensilsCrossed className="size-5 shrink-0" />;
  }
  return <Ticket className="size-5 shrink-0" />;
}

const MIN_DRAG_DURATION_MS = 350;
const REDEEM_THRESHOLD = 0.95;

export function CateringTokenCard({
  token: initialToken,
  slug,
  onRedeemed,
  isManager,
}: CateringTokenCardProps) {
  const toast = useToast();
  const [token, setToken] = useState<CateringTokenDto>(initialToken);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0); // 0 bis 1
  const [isDragging, setIsDragging] = useState(false);
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartTimeRef = useRef<number>(0);
  const currentProgressRef = useRef<number>(0);
  const [speedWarning, setSpeedWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, []);

  // Live-Uhrzeit & Countdown für die 2-Minuten-Bestätigung (Screenshot-Prävention)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(() => {
    if (initialToken.status === 'REDEEMED' && initialToken.redeemedAt) {
      const redeemedMs = new Date(initialToken.redeemedAt).getTime();
      const elapsedSec = Math.floor((Date.now() - redeemedMs) / 1000);
      if (elapsedSec < 120) {
        return 120 - elapsedSec;
      }
    }
    return null;
  });

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  // Laufende Uhrzeit aktualisieren
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown nach Einlösung
  useEffect(() => {
    if (countdownSeconds === null || countdownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownSeconds]);

  const handleRedeem = async () => {
    if (isRedeeming || token.status === 'REDEEMED') return;
    setIsRedeeming(true);
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 120]);
        } catch {}
      }
      const res = await api<{ token?: CateringTokenDto } & CateringTokenDto>(
        `/api/events/${slug}/catering-tokens/${token.id}/redeem`,
        {
          method: 'POST',
        }
      );
      const updated = res.token ?? res;
      setToken(updated);
      setCountdownSeconds(120);
      onRedeemed?.(updated);
      toast({
        title: `${updated.title} entwertet`,
        description: 'Viel Vergnügen und en Guete!',
        tone: 'success',
      });
    } catch (err) {
      toast({
        title: 'Entwertung fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setIsRedeeming(false);
      currentProgressRef.current = 0;
      setSwipeProgress(0);
      setIsDragging(false);
    }
  };

  /**
   * Schwerfälliger Schieber:
   * - Muss direkt am linken Schieber-Knopf (Thumb) gepackt werden (kein Klick-Sprung in der Spur).
   * - Nichtlineare Widerstandskurve (`Math.pow(raw, 1.55)`), damit man spürbar bis ganz zum Anschlag ziehen muss.
   * - Mindest-Ziehdauer (`MIN_DRAG_DURATION_MS`), damit schnelles versehentliches Wischen beim Scrollen ignoriert wird.
   * - Löst erst beim bewussten Loslassen (`onPointerUp`) am rechten Anschlag (`>= 95%`) aus.
   */
  const handleThumbPointerDown = (e: React.PointerEvent) => {
    if (!token.isAvailableNow || token.status !== 'AVAILABLE' || isRedeeming) return;
    e.stopPropagation();
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    setSpeedWarning(false);
    dragStartXRef.current = e.clientX;
    dragStartTimeRef.current = Date.now();
    currentProgressRef.current = 0;
    setSwipeProgress(0);
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleThumbPointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !sliderTrackRef.current) return;
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const usableWidth = rect.width - 52; // Abzug der Thumb-Breite + Padding
    if (usableWidth <= 0) return;

    const deltaX = Math.max(0, e.clientX - dragStartXRef.current);
    // Zusätzlicher Ziehweg + progressive Widerstandskurve (schwerfälliges Gefühl)
    const rawLinear = Math.max(0, Math.min(1, deltaX / (usableWidth * 1.06)));
    const heavyProgress = Math.pow(rawLinear, 1.55);

    currentProgressRef.current = heavyProgress;
    setSwipeProgress(heavyProgress);
  };

  const handleThumbPointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const elapsedMs = Date.now() - dragStartTimeRef.current;
    const finalProgress = currentProgressRef.current;

    if (finalProgress >= REDEEM_THRESHOLD && elapsedMs >= MIN_DRAG_DURATION_MS && !isRedeeming) {
      void handleRedeem();
    } else {
      if (finalProgress >= REDEEM_THRESHOLD && elapsedMs < MIN_DRAG_DURATION_MS) {
        setSpeedWarning(true);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => setSpeedWarning(false), 3800);
        toast({
          title: 'Bitte langsam schieben',
          description: 'Zum Schutz vor versehentlichem Entwerten den Regler langsam bis zum Ende ziehen und loslassen.',
          tone: 'info',
        });
      }
      currentProgressRef.current = 0;
      setSwipeProgress(0);
    }
  };

  const isRecentlyRedeemed = countdownSeconds !== null && countdownSeconds > 0;
  const isReadyToRelease = swipeProgress >= REDEEM_THRESHOLD;

  // Formatierung der Live-Uhrzeit mit Sekunden in Europe/Zurich
  const timeString = currentTime.toLocaleTimeString('de-CH', {
    timeZone: SWISS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-300 p-4 sm:p-5',
        isRecentlyRedeemed
          ? 'border-success bg-gradient-to-br from-success/15 via-success/5 to-transparent shadow-lg shadow-success/10 ring-2 ring-success/40'
          : token.status === 'REDEEMED'
            ? 'opacity-70 bg-bg-muted/40 border-border/60'
            : token.isAvailableNow
              ? 'border-accent/40 hover:border-accent bg-bg hover:shadow-md'
              : 'border-border/60 bg-bg-muted/20'
      )}
    >
      {/* 1. AKTIVE 2-MINUTEN-LIVE-BESTÄTIGUNG (Screenshotsicher durch pulsierende Live-Uhrzeit) */}
      {isRecentlyRedeemed ? (
        <div className="space-y-4 text-center py-2 animate-in fade-in duration-300">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success text-success-fg shadow-md shadow-success/30 animate-pulse">
            <CheckCircle2 className="size-8" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/20 text-success-ink font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles className="size-3.5" /> Bon soeben entwertet
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-fg">
              {token.title}
            </h3>
            <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
              Vor dem Standpersonal vorweisen – bitte nicht schliessen.
            </p>
          </div>

          {/* Screenshot-Schutz: Laufende Sekunden-Uhrzeit */}
          <div className="mx-auto max-w-xs rounded-xl bg-bg/80 border border-success/30 p-3 shadow-inner">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              Offizielle Festzeit
            </p>
            <p className="font-mono text-2xl font-black text-success-ink tracking-widest tabular-nums my-0.5">
              {timeString}
            </p>
            <p className="text-xs font-medium text-fg-muted">
              Live-Gültigkeit: noch{' '}
              <span className="font-bold text-fg font-mono">
                {Math.floor(countdownSeconds / 60)}:
                {(countdownSeconds % 60).toString().padStart(2, '0')}
              </span>{' '}
              Min
            </p>
          </div>

          <div className="text-xs text-fg-muted">
            {token.shiftTitle || 'Schicht'}: {token.taskTitle ? `${token.taskTitle} · ` : ''}
            {fmtWeekday(token.shiftStartTime)}, {fmtTime(token.shiftStartTime)}–{fmtTime(token.shiftEndTime)}
          </div>
        </div>
      ) : (
        /* 2. REGULÄRE BON-ANSICHT */
        <div className="space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg',
                  token.status === 'REDEEMED'
                    ? 'bg-fg-muted/15 text-fg-muted'
                    : token.isAvailableNow
                      ? 'bg-accent/15 text-accent-ink'
                      : 'bg-fg-muted/10 text-fg-muted'
                )}
              >
                {getTokenIcon(token.title)}
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-base text-fg truncate">{token.title}</h4>
                <p className="text-xs text-fg-muted truncate">
                  {token.shiftTitle || 'Schicht'}
                  {token.taskTitle ? ` (${token.taskTitle})` : ''}
                </p>
              </div>
            </div>

            {token.status === 'REDEEMED' ? (
              <Badge tone="neutral" className="shrink-0 text-xs">
                <Check className="size-3 mr-1" /> Eingelöst
              </Badge>
            ) : token.isAvailableNow ? (
              <Badge tone="accent" className="shrink-0 text-xs">
                Einlösbar
              </Badge>
            ) : (
              <Badge tone="neutral" className="shrink-0 text-xs">
                <Clock className="size-3 mr-1" /> Ab {fmtTime(token.availableFrom)}
              </Badge>
            )}
          </div>

          <div className="text-xs text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {fmtWeekday(token.shiftStartTime)}, {fmtTime(token.shiftStartTime)}–{fmtTime(token.shiftEndTime)}
            </span>
            {token.redeemedAt && (
              <span className="text-success-ink font-medium">
                · Entwertet um {fmtTime(token.redeemedAt)} Uhr
              </span>
            )}
          </div>

          {/* SCHWERFÄLLIGER SWIPE-SLIDER ZUM ENTWERTEN (Nur wenn einlösbar und offen) */}
          {token.status === 'AVAILABLE' && (
            <div className="pt-1">
              {token.isAvailableNow ? (
                <>
                  <div
                    ref={sliderTrackRef}
                  className={cn(
                    'relative select-none touch-none h-13 w-full rounded-full border overflow-hidden flex items-center p-1 transition-all',
                    speedWarning
                      ? 'bg-warning/20 border-warning ring-2 ring-warning/30 animate-shake'
                      : isReadyToRelease
                        ? 'bg-success/15 border-success/50'
                        : 'bg-accent/10 border-accent/30'
                  )}
                >
                  {/* Füllbalken der dem Ziehen folgt */}
                  <div
                    className={cn(
                      'absolute left-0 top-0 bottom-0 rounded-full pointer-events-none',
                      speedWarning
                        ? 'bg-warning/30'
                        : isReadyToRelease
                          ? 'bg-success/25'
                          : 'bg-accent/20',
                      !isDragging && 'transition-all duration-300'
                    )}
                    style={{ width: `${Math.min(100, Math.max(12, swipeProgress * 100))}%` }}
                  />

                  {/* Führungstext im Hintergrund */}
                  <div
                    className={cn(
                      'absolute inset-0 flex items-center justify-center pointer-events-none text-xs font-bold tracking-wide pl-12 pr-4 text-center',
                      speedWarning
                        ? 'text-warning-ink font-extrabold'
                        : isReadyToRelease
                          ? 'text-success-ink'
                          : 'text-accent-ink'
                    )}
                  >
                    {isRedeeming
                      ? 'Wird entwertet…'
                      : speedWarning
                        ? '⚠️ Zu schnell – bitte langsam nach rechts ziehen!'
                        : isReadyToRelease
                          ? 'Jetzt loslassen zum Entwerten!'
                          : swipeProgress > 0.15
                            ? `Weiter bis ganz nach rechts ziehen (${Math.round(swipeProgress * 100)}%)…`
                            : 'Regler links fassen & ganz nach rechts ziehen'}
                  </div>

                  {/* Verschiebbarer Schieberegler (Thumb) – NUR hier startet das Ziehen */}
                  <div
                    role="slider"
                    aria-label={`${token.title} entwerten`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(swipeProgress * 100)}
                    tabIndex={0}
                    onPointerDown={handleThumbPointerDown}
                    onPointerMove={handleThumbPointerMove}
                    onPointerUp={handleThumbPointerUp}
                    onPointerCancel={handleThumbPointerUp}
                    className={cn(
                      'relative z-10 size-11 rounded-full flex items-center justify-center shadow-md font-bold text-sm cursor-grab active:cursor-grabbing touch-none',
                      isReadyToRelease
                        ? 'bg-success text-success-fg ring-2 ring-success/40'
                        : 'bg-accent text-accent-fg',
                      !isDragging && 'transition-transform duration-300'
                    )}
                    style={{
                      transform: `translateX(${
                        sliderTrackRef.current
                          ? swipeProgress * (sliderTrackRef.current.clientWidth - 52)
                          : 0
                      }px)`,
                    }}
                  >
                    {isRedeeming ? (
                      <div className="size-4 animate-spin rounded-full border-2 border-accent-fg border-t-transparent" />
                    ) : isReadyToRelease ? (
                      <Check className="size-5" />
                    ) : (
                      <ChevronsRight className="size-5" />
                    )}
                  </div>
                </div>

                {speedWarning && (
                  <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-warning/15 border border-warning/30 px-3 py-1.5 text-xs font-medium text-warning-ink animate-in fade-up">
                    <span>⚠️ <strong>Zu schnell geschoben:</strong> Bitte den Knopf langsam und gleichmässig ganz nach rechts ziehen.</span>
                  </div>
                )}
              </>
              ) : (
                <div className="rounded-lg bg-bg-muted/30 border border-border/50 p-2.5 text-center text-xs text-fg-muted">
                  Gutschein ist am Festtag ab{' '}
                  <span className="font-semibold text-fg">{fmtTime(token.availableFrom)} Uhr</span>{' '}
                  (oder nach Schicht-Check-in) verfügbar.
                </div>
              )}
            </div>
          )}

          {/* MANUELLE NOTFALL-ENTWERTUNG FÜR DAS OK */}
          {isManager && token.status === 'AVAILABLE' && !token.isAvailableNow && (
            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={() => void handleRedeem()}
                className="text-[11px] text-accent-ink hover:underline font-semibold"
              >
                Als OK vorzeitig entwerten (Kulanz)
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
