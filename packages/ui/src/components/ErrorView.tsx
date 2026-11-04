'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Home,
  RefreshCw,
  Utensils,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { Button, buttonClasses } from './Button';
import { Badge } from './Badge';
import { CeviLogo } from './CeviLogo';
import { ThemeToggle } from '../theme/ThemeToggle';

export interface ErrorAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  external?: boolean;
}

export interface ErrorViewProps {
  /** Der aufgetretene Fehler */
  error?: Error & { digest?: string };
  /** Callback, um den Render-Versuch zu wiederholen (Next.js reset()) */
  reset?: () => void;
  /** Badge-Text (Standard: "⚠️ 500 · Rauch im Unterholz") */
  badge?: string;
  /** Haupttitel (Standard: "Da brennt etwas an...") */
  title?: string;
  /** Beschreibung */
  description?: string;
  /** Ziel für den Lagerplatz-Link (Standard: "/") */
  homeHref?: string;
  /** Beschriftung für den Lagerplatz-Link (Standard: "Zurück zum Lagerplatz") */
  homeLabel?: string;
  /** Name der Abteilung für Personalisierung (optional) */
  departmentName?: string;
  /** Logo-URL der Abteilung (optional) */
  departmentLogoUrl?: string | null;
  /** Zusätzliche Schnell-Aktionen */
  secondaryActions?: ErrorAction[];
  /** Soll der Zurück-Schritt (history.back) angeboten werden? (Standard: true) */
  showBackStep?: boolean;
  className?: string;
}

const KITCHEN_WISDOMS = [
  'Wenn die Gamelle anbrennt: Boden nicht abkratzen, mehr Maggi rein und behaupten, das gehöre zum Geheimrezept.',
  'Regel #2 der Lagerküche: Hunger ist der beste Koch, aber ein funktionierender Server schadet auch nicht.',
  'Pfadfinder-Tipp: Bei Systemabstürzen hilft tief durchatmen, Krawatte richten und beherzt auf «Nochmal versuchen» drücken.',
  'Wer den Kochlöffel schwingt, bestimmt die Musik – ausser der Server kocht über.',
  'Echte Cevianer*innen verlieren nie die Nerven – sie machen einfach ein kurzes Lagerfeuer-Päuschen.',
  'Selbst der beste Spähtrupp stolpert mal über eine Wurzel im Code.',
  'Schoggi-Banane heilt fast alles. Notfalls hilft auch ein Seiten-Reload.',
];

const STIR_REACTIONS = [
  'Einmal kräftig umgerührt! Vielleicht klappt es jetzt schon?',
  'Noch eine Prise Maggi... die geheime Zutat jedes Cevi-Lagers!',
  'Suppe blubbert munter weiter. Der Server holt tief Luft...',
  'Achtung, heisse Gamelle! Nicht die Finger verbrennen.',
  'Boden ist noch nicht angebrannt – wir sind guter Dinge!',
  'Das Küchenteam nickt anerkennend. Jetzt nochmal «Neu laden» probieren!',
  'Volle Kochstufe erreicht! Zeit für ein Festmahl!',
];

interface FloatingParticle {
  id: number;
  text: string;
  x: number;
}

/**
 * Coole, interaktive 500-Fehlerseite im Cevi-Lagerküchen-Stil.
 * Beinhaltet ein animiertes Dreibein mit kochender Gamelle,
 * «Suppe umrühren»-Easter-Egg, einen Retry-Button (reset())
 * sowie aufklappbare, kopierbare Fehlerdetails für den Support.
 */
export function ErrorView({
  error,
  reset,
  badge = '⚠️ 500 · Rauch im Unterholz',
  title = 'Da brennt etwas an...',
  description = 'Ein unerwarteter Fehler hat diesen Posten lahmgelegt. Keine Sorge – deine Schichten und Daten sind sicher im Rucksack verstaut.',
  homeHref = '/',
  homeLabel = 'Zurück zum Lagerplatz',
  departmentName,
  departmentLogoUrl,
  secondaryActions = [],
  showBackStep = true,
  className,
}: ErrorViewProps) {
  const [stirs, setStirs] = useState(0);
  const [isPotBumping, setIsPotBumping] = useState(false);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [wisdomIndex, setWisdomIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setWisdomIndex(Math.floor(Math.random() * KITCHEN_WISDOMS.length));
    setCanGoBack(typeof window !== 'undefined' && window.history.length > 1);
  }, []);

  const currentStirReaction = useMemo(() => {
    if (stirs === 0) return null;
    return STIR_REACTIONS[(stirs - 1) % STIR_REACTIONS.length];
  }, [stirs]);

  const stirPot = useCallback(() => {
    setStirs((prev) => prev + 1);
    setIsPotBumping(true);
    setTimeout(() => setIsPotBumping(false), 350);

    const particleTexts = ['Blubber! 🫧', '+1 Prise Maggi 🧂', 'Umgerührt! 🥄', 'Lecker 🍲', 'Zisch! 💨'];
    const text = stirs === 9 ? '🎖️ Küchenprofi!' : particleTexts[Math.floor(Math.random() * particleTexts.length)];
    const id = Date.now() + Math.random();
    const x = Math.floor(Math.random() * 80) - 40;

    setParticles((prev) => [...prev.slice(-4), { id, text, x }]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1200);
  }, [stirs]);

  const copyErrorDetails = useCallback(() => {
    const details = [
      `Fehler: ${error?.name || 'Error'}: ${error?.message || 'Unbekannter Fehler'}`,
      error?.digest ? `Digest: ${error.digest}` : null,
      typeof window !== 'undefined' ? `URL: ${window.location.href}` : null,
      `Zeitpunkt: ${new Date().toISOString()}`,
      error?.stack ? `\nStacktrace:\n${error.stack}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [error]);

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  return (
    <div className={cn('grain relative flex min-h-[100dvh] flex-col bg-canvas text-fg selection:bg-accent selection:text-white', className)}>
      {/* Lokale Scoped-Styles für Dreibein & Dampf-Animationen */}
      <style>{`
        @keyframes cevi-steam-1 {
          0% { transform: translateY(0) scale(0.7); opacity: 0; }
          30% { opacity: 0.7; }
          100% { transform: translateY(-40px) translateX(6px) scale(1.3); opacity: 0; }
        }
        @keyframes cevi-steam-2 {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          40% { opacity: 0.8; }
          100% { transform: translateY(-45px) translateX(-8px) scale(1.4); opacity: 0; }
        }
        @keyframes cevi-pot-swing {
          0%, 100% { transform: rotate(-1.5deg); }
          50% { transform: rotate(1.5deg); }
        }
        @keyframes cevi-spark-pop {
          0% { transform: translateY(0) scale(0.85); opacity: 1; }
          100% { transform: translateY(-50px) scale(1.05); opacity: 0; }
        }
        .animate-steam-1 { animation: cevi-steam-1 2.4s ease-out infinite; }
        .animate-steam-2 { animation: cevi-steam-2 2.8s ease-out infinite 0.7s; }
        .animate-pot-swing { animation: cevi-pot-swing 3.2s ease-in-out infinite; transform-origin: 210px 48px; }
      `}</style>

      {/* Kopfzeile */}
      <header className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-8">
        <Link
          href={homeHref}
          className="group inline-flex items-center gap-3 transition hover:opacity-90 focus-visible:outline-none"
        >
          <CeviLogo logoUrl={departmentLogoUrl} size="sm" alt="Cevi Schichtplan Logo" />
          <div className="flex flex-col">
            <span className="font-display text-sm font-bold tracking-tight text-fg group-hover:text-accent-ink transition-colors">
              {departmentName || 'Cevi Schichtplan'}
            </span>
            <span className="text-2xs font-medium text-fg-subtle">Lagerküche & Technik</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Hauptbereich */}
      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-6 sm:py-12 text-center">
        {/* Hinterer sanfter Lichtschein (in Alarm-Orange/Rot) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[380px] w-[380px] sm:h-[480px] sm:w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-warning/20 via-danger/10 to-transparent blur-3xl"
        />

        {/* 1. Lagerküchen-Dreibein-Grafik */}
        <div className="relative mb-4 flex flex-col items-center">
          {/* Schwebende Klick-Partikel ("Blubber!") */}
          <div className="pointer-events-none absolute -top-8 z-30 flex justify-center">
            {particles.map((p) => (
              <span
                key={p.id}
                style={{
                  transform: `translateX(${p.x}px)`,
                  animation: 'cevi-spark-pop 1.2s ease-out forwards',
                }}
                className="absolute whitespace-nowrap rounded-full bg-surface-2/95 px-2.5 py-0.5 text-xs font-bold text-amber-500 shadow-lift border border-amber-500/30"
              >
                {p.text}
              </span>
            ))}
          </div>

          {/* Interaktive SVG-Grafik */}
          <div
            role="button"
            tabIndex={0}
            onClick={stirPot}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                stirPot();
              }
            }}
            title="Klick auf die Gamelle, um umzurühren!"
            aria-label="Kochende Gamelle: Klick um die Suppe umzurühren"
            className={cn(
              'group relative cursor-pointer select-none rounded-card p-2 outline-none transition-[transform,filter] duration-300',
              isPotBumping ? 'scale-105' : 'hover:scale-[1.02]',
              'focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-4 focus-visible:ring-offset-canvas'
            )}
          >
            <svg
              viewBox="0 0 420 220"
              className="h-44 w-auto sm:h-56 drop-shadow-soft"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="fireWarm" x1="210" y1="180" x2="210" y2="140" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#dc2626" />
                  <stop offset="50%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
                <radialGradient id="steamGlow" cx="210" cy="115" r="35" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Tannenwald & Berge im Hintergrund */}
              <g className="text-surface-3 opacity-50">
                <polygon points="30,175 22,155 26,155 18,135 24,135 15,118 35,118 28,135 34,135 26,155 31,155 40,175" fill="currentColor" />
                <polygon points="100,175 92,150 96,150 88,130 93,130 84,112 106,112 100,130 105,130 96,150 101,150 110,175" fill="currentColor" />
                <polygon points="320,175 312,150 316,150 308,130 313,130 304,112 326,112 320,130 325,130 316,150 321,150 330,175" fill="currentColor" />
                <polygon points="380,175 372,155 376,155 368,135 374,135 365,118 385,118 378,135 384,135 376,155 381,155 390,175" fill="currentColor" />
              </g>

              {/* Bodenlinie */}
              <path
                d="M10 180 Q110 174 210 176 T410 178"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="text-line-strong"
              />

              {/* Dreibein-Stangen (aus Holz/Ästen gebunden) */}
              {/* Hintere Stange */}
              <line x1="210" y1="46" x2="210" y2="176" className="stroke-amber-950/70" strokeWidth="4" strokeLinecap="round" />
              {/* Linke Stange */}
              <line x1="210" y1="46" x2="135" y2="178" className="stroke-amber-900" strokeWidth="5.5" strokeLinecap="round" />
              {/* Rechte Stange */}
              <line x1="210" y1="46" x2="285" y2="178" className="stroke-amber-900" strokeWidth="5.5" strokeLinecap="round" />

              {/* Bundstelle oben (Schnur-Wicklung / Achterknoten) */}
              <rect x="204" y="42" width="12" height="10" rx="3" className="fill-amber-700 stroke-amber-900" strokeWidth="1" />
              <line x1="205" y1="45" x2="215" y2="45" className="stroke-amber-300" strokeWidth="1.2" />
              <line x1="205" y1="49" x2="215" y2="49" className="stroke-amber-300" strokeWidth="1.2" />

              {/* Kette & Haken (schwingt sanft) */}
              <g className="animate-pot-swing">
                <line x1="210" y1="52" x2="210" y2="92" className="stroke-line-strong" strokeWidth="2" strokeDasharray="3 3" />
                {/* Haken */}
                <path d="M210 92 C210 96 214 98 214 100 C214 103 210 104 207 102" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-line-strong" />

                {/* Kochtopf / Gamelle */}
                <g id="cooking-pot">
                  {/* Henkel */}
                  <path d="M185 110 C185 96 235 96 235 110" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-zinc-600 dark:text-zinc-400" />
                  {/* Topf-Körper (schwarz/anthrazit matt) */}
                  <path
                    d="M180 110 L240 110 C242 135 235 148 210 148 C185 148 178 135 180 110 Z"
                    className="fill-zinc-800 dark:fill-zinc-900 stroke-zinc-950"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  {/* Topf-Rand oben */}
                  <ellipse cx="210" cy="110" rx="30" ry="5" className="fill-zinc-700 dark:fill-zinc-800 stroke-zinc-950" strokeWidth="1.5" />
                  {/* Kochender Inhalt (Suppe) */}
                  <ellipse cx="210" cy="110" rx="27" ry="3.5" className="fill-amber-500/80" />

                  {/* Kochlöffel / Holzlöffel ragt heraus */}
                  <line x1="222" y1="110" x2="238" y2="88" className="stroke-amber-700" strokeWidth="3" strokeLinecap="round" />
                  <ellipse cx="239" cy="87" rx="3.5" ry="2.5" className="fill-amber-600" transform="rotate(-30 239 87)" />
                </g>

                {/* Aufsteigende Dampfwolken */}
                <g className="text-amber-200/60 dark:text-amber-100/40">
                  <circle cx="204" cy="100" r="4.5" fill="currentColor" className="animate-steam-1" />
                  <circle cx="215" cy="98" r="6" fill="currentColor" className="animate-steam-2" />
                  <circle cx="210" cy="90" r="5" fill="currentColor" className="animate-steam-1" style={{ animationDelay: '1.2s' }} />
                </g>
              </g>

              {/* Feuerstelle unter dem Topf */}
              {/* Steinkranz */}
              <ellipse cx="188" cy="174" rx="7" ry="4" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
              <ellipse cx="202" cy="176" rx="7.5" ry="4" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
              <ellipse cx="218" cy="176" rx="7.5" ry="4" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
              <ellipse cx="232" cy="174" rx="7" ry="4" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />

              {/* Holzscheite */}
              <line x1="185" y1="172" x2="235" y2="167" className="stroke-amber-950" strokeWidth="6" strokeLinecap="round" />
              <line x1="185" y1="167" x2="235" y2="172" className="stroke-amber-950" strokeWidth="6" strokeLinecap="round" />

              {/* Kleine Flamme unter dem Topf */}
              <path
                d="M210 148 C216 156 222 163 218 171 C215 174 205 174 202 171 C198 163 204 156 210 148 Z"
                fill="url(#fireWarm)"
                className="animate-pulse"
              />
            </svg>
          </div>

          {/* Interaktions-Button für die Gamelle */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={stirPot}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition',
                'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg border border-line active:scale-95'
              )}
            >
              <Utensils className="size-3.5 text-amber-500 animate-pulse" />
              <span>Suppe umrühren</span>
              {stirs > 0 && (
                <span className="tabular font-mono text-2xs rounded-full bg-warning/20 px-1.5 py-0.2 text-warning-ink font-bold">
                  {stirs}
                </span>
              )}
            </button>

            {stirs >= 10 && (
              <Badge tone="warning" className="animate-scale-in">
                <Award className="size-3 mr-1" />
                Meisterkoch der Lagerküche!
              </Badge>
            )}
          </div>

          {/* Rückmeldung beim Umrühren */}
          {currentStirReaction && (
            <p className="mt-2 max-w-md animate-fade-in text-xs font-medium italic text-warning-ink">
              {currentStirReaction}
            </p>
          )}
        </div>

        {/* 2. Titel & Badge */}
        <div className="animate-fade-up">
          <Badge tone="warning" className="mb-3 px-3 py-1 text-xs font-semibold tracking-wide">
            {badge}
          </Badge>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl lg:text-5xl text-balance">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-fg-muted text-balance">
            {description}
          </p>
        </div>

        {/* 3. Aktionen: Retry & Navigation */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {reset && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => reset()}
              className="shadow-glow"
            >
              <RefreshCw className="size-5" />
              <span>Nochmal versuchen</span>
            </Button>
          )}

          <Link
            href={homeHref}
            className={buttonClasses({
              variant: reset ? 'secondary' : 'primary',
              size: 'lg',
            })}
          >
            <Home className="size-5" />
            <span>{homeLabel}</span>
          </Link>

          {showBackStep && canGoBack && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleBack}
              aria-label="Zur vorherigen Seite zurückkehren"
            >
              <ArrowLeft className="size-5" />
              <span>Einen Schritt zurück</span>
            </Button>
          )}
        </div>

        {/* Weitere Schnell-Aktionen */}
        {secondaryActions.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {secondaryActions.map((act, i) => {
              if (act.href) {
                return act.external ? (
                  <a
                    key={i}
                    href={act.href}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                      'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg border border-line'
                    )}
                  >
                    {act.icon}
                    <span>{act.label}</span>
                  </a>
                ) : (
                  <Link
                    key={i}
                    href={act.href}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                      'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg border border-line'
                    )}
                  >
                    {act.icon}
                    <span>{act.label}</span>
                  </Link>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={act.onClick}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                    'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg border border-line'
                  )}
                >
                  {act.icon}
                  <span>{act.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 4. Aufklappbare Fehlerdetails für den Support */}
        {error && (
          <div className="mt-8 w-full max-w-lg text-left">
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="inline-flex w-full items-center justify-between rounded-field border border-line bg-surface-2 px-4 py-2.5 text-xs font-semibold text-fg-muted hover:bg-surface-3 hover:text-fg transition"
            >
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="size-3.5 text-warning" />
                Fehlerdetails für Support & Technik
              </span>
              {showDetails ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {showDetails && (
              <div className="mt-2 rounded-field border border-line bg-surface p-4 text-xs font-mono animate-fade-in shadow-soft">
                <div className="flex items-center justify-between border-b border-line pb-2 mb-2">
                  <span className="text-2xs font-sans font-bold uppercase tracking-wider text-fg-subtle">
                    Fehler-Protokoll
                  </span>
                  <button
                    type="button"
                    onClick={copyErrorDetails}
                    className="inline-flex items-center gap-1 text-2xs font-sans font-semibold text-accent-ink hover:underline"
                  >
                    {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                    <span>{copied ? 'Kopiert!' : 'Kopieren'}</span>
                  </button>
                </div>

                <div className="space-y-1.5 overflow-x-auto text-fg-muted">
                  <p>
                    <strong className="text-danger-ink">Meldung:</strong> {error.message || 'Unbekannter Fehler'}
                  </p>
                  {error.digest && (
                    <p>
                      <strong className="text-fg">Digest-Code:</strong> {error.digest}
                    </p>
                  )}
                  {error.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-2xs text-fg-subtle hover:text-fg">
                        Stacktrace anzeigen
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-surface-2 p-2 text-[11px] leading-tight text-fg-subtle">
                        {error.stack}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Cevi-Küchenweisheit */}
        <div className="mt-8 w-full max-w-md animate-fade-up">
          <div className="rounded-card border border-dashed border-line-strong bg-surface/75 p-4 text-left backdrop-blur-sm">
            <span className="text-2xs font-bold uppercase tracking-wider text-warning-ink block pb-1 border-b border-line">
              ⛺ Lagerküchen-Regel
            </span>
            <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-fg-muted italic">
              «{KITCHEN_WISDOMS[wisdomIndex]}»
            </p>
          </div>
        </div>
      </main>

      {/* Fusszeile */}
      <footer className="relative z-10 py-5 text-center text-xs text-fg-subtle">
        <p>
          Cevi Schichtplan ·{' '}
          <a
            href="https://cevi-schichtplan.ch"
            className="underline hover:text-fg transition-colors"
          >
            cevi-schichtplan.ch
          </a>
        </p>
      </footer>
    </div>
  );
}
