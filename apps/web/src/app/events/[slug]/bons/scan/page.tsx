'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  CupSoda,
  KeyRound,
  LogOut,
  QrCode,
  Sparkles,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import type { PhysicalCardScanResultDto } from '@schichtplan/shared';
import { Badge, Button, Card, Input, buttonClasses, cn, useToast } from '@schichtplan/ui';
import { ApiError, api, errorMessage, useLoginHref } from '@/lib/api';

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

export default function BonScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center p-4">
          <div className="size-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      }
    >
      <BonScanContent />
    </Suspense>
  );
}

function BonScanContent() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const code = searchParams.get('code') || '';
  const toast = useToast();
  const loginHref = useLoginHref();

  const pinStorageKey = `sp_staff_pin_${slug}`;

  const [pin, setPin] = useState<string>('');
  /** Erst laden, wenn der gespeicherte PIN gelesen ist (sonst kommt zuerst ein unnötiges 401) */
  const [pinReady, setPinReady] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [needsPin, setNeedsPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [eventTitle, setEventTitle] = useState('');

  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<PhysicalCardScanResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemingAll, setRedeemingAll] = useState(false);

  // Gespeicherten PIN beim Laden abrufen
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPin = localStorage.getItem(pinStorageKey) || '';
      setPin(savedPin);
    }
    setPinReady(true);
  }, [pinStorageKey]);

  // Bon-Daten abrufen
  const loadCard = async (currentPin = pin) => {
    if (!code) {
      setError('Kein Bon-Code im Scan-Link übergeben.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (currentPin) {
        headers['x-staff-pin'] = currentPin;
      }
      const data = await api<PhysicalCardScanResultDto>(
        `/api/events/${slug}/catering-scan?code=${encodeURIComponent(code)}`,
        { headers }
      );
      setCard(data);
      setEventTitle(data.eventTitle);
      setNeedsPin(false);
      setNeedsLogin(false);
      setPinError(null);
    } catch (err) {
      const data = err instanceof ApiError ? err.data : {};
      if (typeof data.eventTitle === 'string') setEventTitle(data.eventTitle);
      if (data.needsLogin) {
        setNeedsLogin(true);
        setNeedsPin(false);
      } else if (data.needsPin) {
        setNeedsPin(true);
        // Ein falscher gespeicherter PIN wird vergessen
        if (currentPin) {
          localStorage.removeItem(pinStorageKey);
          setPin('');
          setPinError(errorMessage(err));
        }
      } else {
        setError(errorMessage(err) || 'Bon nicht gefunden oder ungültig.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pinReady) void loadCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, code, pin, pinReady]);

  // PIN absenden & dauerhaft speichern (der Effekt oben lädt den Bon danach neu)
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.trim();
    if (!clean) return;
    localStorage.setItem(pinStorageKey, clean);
    setPinError(null);
    setPinInput('');
    if (clean === pin) void loadCard(clean);
    else setPin(clean);
  };

  // PIN manuell zurücksetzen / abmelden
  const handleLogoutPin = () => {
    localStorage.removeItem(pinStorageKey);
    setPin('');
    setNeedsPin(true);
    setCard(null);
    toast({ title: 'Stand-PIN abgemeldet', tone: 'info' });
  };

  // Artikel entwerten
  const handleRedeem = async (tokenId?: string, all = false) => {
    if (redeemingId || redeemingAll || !card) return;
    if (all) setRedeemingAll(true);
    else if (tokenId) setRedeemingId(tokenId);

    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([100, 50, 120]);
        } catch {}
      }

      const headers: Record<string, string> = {};
      if (pin) headers['x-staff-pin'] = pin;

      const updated = await api<PhysicalCardScanResultDto>(
        `/api/events/${slug}/catering-scan/redeem`,
        {
          method: 'POST',
          headers,
          json: {
            code,
            tokenId,
            redeemAll: all,
            staffPin: pin || undefined,
          },
        }
      );

      setCard(updated);
      toast({
        title: all ? 'Alle Artikel entwertet' : 'Artikel entwertet',
        description: 'En Guete und vielen Dank fürs Helfen!',
        tone: 'success',
      });
    } catch (err) {
      // PIN inzwischen geändert: neu eingeben lassen
      if (err instanceof ApiError && err.data.needsPin) {
        localStorage.removeItem(pinStorageKey);
        setPin('');
        setPinError(errorMessage(err));
        setNeedsPin(true);
        return;
      }
      toast({
        title: 'Entwertung fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setRedeemingId(null);
      setRedeemingAll(false);
    }
  };

  const availableItems = card?.items.filter((i) => i.status === 'AVAILABLE') ?? [];
  const allRedeemed = Boolean(card && card.items.every((i) => i.status === 'REDEEMED'));

  return (
    <div className="min-h-screen bg-bg-muted/30 text-fg flex flex-col justify-between p-4 sm:p-6">
      <div className="mx-auto w-full max-w-md space-y-4">
        {/* KOPFZEILE */}
        <div className="text-center space-y-1">
          <Badge tone="accent" size="sm" className="font-bold uppercase tracking-wider">
            Feststand &amp; Bar-Kasse
          </Badge>
          <h1 className="font-display text-xl font-extrabold text-fg truncate">
            {card?.eventTitle || eventTitle || 'Cevi Schichtplan'}
          </h1>
        </div>

        {/* 1. PIN-EINGABE (falls erforderlich) */}
        {needsPin && (
          <Card className="p-5 sm:p-6 text-center space-y-4 shadow-md border-accent/40 animate-in fade-in">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent-ink">
              <KeyRound className="size-6" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-fg">Stand-PIN erforderlich</h2>
              <p className="text-xs text-fg-muted mt-1">
                Bitte tippe den 4-stelligen PIN der Standkasse ein. Er bleibt für diese Schicht auf diesem Gerät gespeichert.
              </p>
            </div>
            <form onSubmit={handlePinSubmit} className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="z. B. 4821"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                className="text-center text-xl font-mono tracking-widest font-bold h-12"
              />
              {pinError && <p className="text-xs font-semibold text-danger-ink">{pinError}</p>}
              <Button type="submit" variant="primary" className="w-full h-11" disabled={!pinInput.trim()}>
                PIN bestätigen &amp; Bon öffnen
              </Button>
            </form>
            <p className="text-xs text-fg-muted">
              Im OK?{' '}
              <a href={loginHref} className="font-semibold text-accent-ink hover:underline">
                Anmelden
              </a>{' '}
              geht auch ohne PIN.
            </p>
          </Card>
        )}

        {/* 1b. ANMELDUNG (kein Stand-PIN gesetzt) */}
        {needsLogin && (
          <Card className="p-5 sm:p-6 text-center space-y-4 shadow-md border-accent/40 animate-in fade-in">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent-ink">
              <KeyRound className="size-6" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-fg">Anmeldung nötig</h2>
              <p className="text-xs text-fg-muted mt-1">
                Bons entwerten kann nur das OK. Wer ohne Konto am Stand arbeitet, braucht einen Stand-PIN. Den legt das
                OK in den Einstellungen unter «Verpflegung &amp; Bons» fest.
              </p>
            </div>
            <a href={loginHref} className={buttonClasses({ className: 'w-full h-11' })}>
              Anmelden
            </a>
          </Card>
        )}

        {/* 2. LADE-ZUSTAND */}
        {loading && !needsPin && !needsLogin && (
          <div className="p-12 text-center space-y-3">
            <div className="size-8 mx-auto animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-xs text-fg-muted">Bon wird geprüft…</p>
          </div>
        )}

        {/* 3. FEHLER-ZUSTAND */}
        {error && !loading && !needsPin && !needsLogin && (
          <Card className="p-6 text-center space-y-3 border-danger/40 bg-danger/5 shadow-md animate-in fade-in">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger text-danger-fg shadow-md shadow-danger/20">
              <Ban className="size-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-fg">Ungültiger Bon</h2>
            <p className="text-xs text-fg-muted">{error}</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadCard()}
              className="mt-2"
            >
              Erneut versuchen
            </Button>
          </Card>
        )}

        {/* 4. BON-DETAILS */}
        {card && !loading && !needsPin && !needsLogin && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Status-Banner */}
            <div
              className={cn(
                'rounded-xl border p-4 text-center space-y-1 shadow-sm',
                card.isBlocked
                  ? 'border-danger bg-danger/10 text-danger-ink'
                  : allRedeemed
                    ? 'border-line bg-surface-2 text-fg-muted'
                    : 'border-success/40 bg-success/10 text-success-ink'
              )}
            >
              <div className="flex items-center justify-center gap-1.5 font-extrabold text-sm uppercase tracking-wider">
                {card.isBlocked ? (
                  <>
                    <Ban className="size-4" /> Bon gesperrt
                  </>
                ) : allRedeemed ? (
                  <>
                    <Check className="size-4" /> Vollständig eingelöst
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4 text-success" /> Gültiger Helfer-Bon
                  </>
                )}
              </div>
              <p className="text-xs opacity-90 font-medium">
                {card.batchTitle} · Karte #{card.cardNumber?.toString().padStart(3, '0') || '001'}
              </p>
            </div>

            {/* Artikel-Liste */}
            <div className="space-y-2.5">
              {card.items.map((item) => {
                const isAvail = item.status === 'AVAILABLE' && !card.isBlocked;
                const isRedeemed = item.status === 'REDEEMED';
                const isBlocked = item.status === 'BLOCKED' || card.isBlocked;

                return (
                  <Card
                    key={item.id}
                    className={cn(
                      'p-4 transition-all flex flex-col justify-between gap-3',
                      isAvail
                        ? 'border-accent/40 bg-surface shadow-sm ring-1 ring-accent/20'
                        : 'border-line bg-surface-2/60 opacity-80'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-lg',
                            isAvail ? 'bg-accent/15 text-accent-ink' : 'bg-fg-muted/15 text-fg-muted'
                          )}
                        >
                          {getTokenIcon(item.title)}
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-fg">{item.title}</h3>
                          <p className="text-xs text-fg-muted">
                            {isRedeemed && item.redeemedAt
                              ? `Entwertet um ${new Date(item.redeemedAt).toLocaleTimeString('de-CH', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })} Uhr`
                              : isBlocked
                                ? 'Gesperrt'
                                : 'Einlösbar'}
                          </p>
                        </div>
                      </div>

                      <Badge
                        tone={isAvail ? 'success' : isRedeemed ? 'neutral' : 'danger'}
                        className="text-xs shrink-0"
                      >
                        {isAvail ? 'Offen' : isRedeemed ? 'Eingelöst' : 'Gesperrt'}
                      </Badge>
                    </div>

                    {/* Entwertungs-Button für einzelnen Artikel */}
                    {isAvail && (
                      <Button
                        type="button"
                        variant="primary"
                        loading={redeemingId === item.id}
                        disabled={redeemingAll || Boolean(redeemingId)}
                        onClick={() => handleRedeem(item.id)}
                        className="w-full h-11 text-sm font-bold"
                      >
                        <Check className="size-4 mr-1.5" />
                        «{item.title}» jetzt entwerten
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Sammel-Entwertung (falls mehr als 1 Artikel offen) */}
            {availableItems.length > 1 && !card.isBlocked && (
              <Button
                type="button"
                variant="secondary"
                loading={redeemingAll}
                disabled={Boolean(redeemingId)}
                onClick={() => handleRedeem(undefined, true)}
                className="w-full h-11 text-xs font-bold"
              >
                <Sparkles className="size-3.5 mr-1 text-accent-ink" />
                Alle {availableItems.length} offenen Artikel auf einmal entwerten
              </Button>
            )}
          </div>
        )}
      </div>

      {/* FUSSZEILE: STAND-PIN STATUS & ABMELDEN */}
      {pin && (
        <div className="mx-auto w-full max-w-md pt-6 pb-2 text-center text-xs text-fg-subtle flex items-center justify-between border-t border-line mt-6">
          <span className="flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-accent-ink" /> Stand-PIN aktiv gemerkt
          </span>
          <button
            type="button"
            onClick={handleLogoutPin}
            className="text-danger-ink hover:underline font-semibold inline-flex items-center gap-1"
          >
            <LogOut className="size-3" /> PIN ändern
          </button>
        </div>
      )}
    </div>
  );
}
