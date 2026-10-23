'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Award,
  Compass,
  Flame,
  Home,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { Button, buttonClasses } from './Button';
import { Badge } from './Badge';
import { CeviLogo } from './CeviLogo';
import { ThemeToggle } from '../theme/ThemeToggle';

export interface NotFoundAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  external?: boolean;
}

export interface NotFoundViewProps {
  /** Optionaler Badge-Text (Standard: "🧭 404 · Wegmarkierung verloren") */
  badge?: string;
  /** Haupttitel (Standard: "Pfad verloren im Dickicht?") */
  title?: string;
  /** Beschreibungstext */
  description?: string;
  /** Ziel für den Hauptbutton (Standard: "/") */
  homeHref?: string;
  /** Beschriftung für den Hauptbutton (Standard: "Zurück zum Lagerplatz") */
  homeLabel?: string;
  /** Name der Abteilung für Personalisierung (optional) */
  departmentName?: string;
  /** Logo-URL der Abteilung (optional) */
  departmentLogoUrl?: string | null;
  /** Zusätzliche Schnell-Aktionen */
  secondaryActions?: NotFoundAction[];
  /** Soll der Zurück-Schritt (history.back) angeboten werden? (Standard: true) */
  showBackStep?: boolean;
  className?: string;
}

const SCOUT_WISDOMS = [
  '«De Rauch gaht immer zum Schönschte!» – Unumstössliches Cevi-Naturgesetz seit 1855.',
  'Wenn du dich im Wald verirrst: Krawatte geraderücken, Schoggi essen und warten, bis jemand mit einer Fackel kommt.',
  'Regel #1 an der Chilbi: Kein Schichtplan überlebt den ersten Ansturm am Samstagabend unversehrt.',
  'Der Kompass zeigt immer nach Norden – ausser du hältst dein Taschenmesser daneben.',
  'Im Zweifelsfall immer dem Duft von frisch gebratenen Bratwürsten oder Crêpes folgen.',
  'Echte Cevianer*innen verirren sich nicht – sie erkunden nur unerschlossene Nebenpfade.',
  'Der Knoten hält bombenfest. Niemand weiss zwar genau welcher Knoten es ist, aber er hält.',
  'Das K-Weg Liederbuch hat über 200 Lieder. Gesungen werden am Lagerfeuer trotzdem immer dieselben drei.',
  'Wer zu spät zur Schicht antritt, muss beim Zeltabbau die krummen Heringe geradedrücken.',
  'Es gibt kein schlechtes Wetter für Helfer*innen – nur zu dünne Regenpellerinen.',
  'Tipp der Lagerleitung: Immer den roten Kreidemarkierungen an den Bäumen nachgehen.',
  'Die beste Schicht ist diejenige, bei der es am Schluss Gratis-Kuchen und heissen Tee gibt.',
];

const FIRE_REACTIONS = [
  'Herrlich warm! Aber der gesuchte Link ist wohl im Rauch aufgegangen.',
  'Stockbrot ist fast durch – nimm dir gern einen Platz am Feuer!',
  '«De Rauch gaht immer zum Schönschte!» – Da musst wohl du gemeint sein.',
  'Achtung Funkenflug! Gut, dass alle Zelte vorschriftsmässig im Abstand stehen.',
  'Lagerleiter ruft: «Wer hat denn den Schichtplan ins Feuer geworfen?!»',
  'Funken fliegen bis zum Polarstern... der gesuchte Pfad bleibt leider verschollen.',
  'K-Weg Liederbuch aufgeschlagen: «Zäme am Füür...»',
  'Megastufe erreicht! Zeit für Marshmallows und Schoggibananen am Feuer.',
];

interface FloatingParticle {
  id: number;
  text: string;
  x: number;
}

/**
 * Coole, interaktive 404-Seite im Cevi-Lagerfeuer-Stil.
 * Beinhaltet ein animiertes SVG-Lagerfeuer, interaktives «Holz nachlegen» mit
 * Funkenflug-Easter-Egg, rotierende Cevi-Überlebensweisheiten und klare Wegweiser.
 */
export function NotFoundView({
  badge = '🧭 404 · Wegmarkierung verloren',
  title = 'Pfad verloren im Dickicht?',
  description = 'Hier brennt zwar ein gemütliches Feuer, aber Schichten oder Seiten gibt es an dieser Weggabelung keine. Vielleicht ist der Link veraltet oder der Posten wurde abgebaut.',
  homeHref = '/',
  homeLabel = 'Zurück zum Lagerplatz',
  departmentName,
  departmentLogoUrl,
  secondaryActions = [],
  showBackStep = true,
  className,
}: NotFoundViewProps) {
  const [logs, setLogs] = useState(0);
  const [isFirePumping, setIsFirePumping] = useState(false);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [wisdomIndex, setWisdomIndex] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // Zufällige Weisheit beim Laden
    setWisdomIndex(Math.floor(Math.random() * SCOUT_WISDOMS.length));
    setCanGoBack(typeof window !== 'undefined' && window.history.length > 1);
  }, []);

  const currentFireReaction = useMemo(() => {
    if (logs === 0) return null;
    return FIRE_REACTIONS[(logs - 1) % FIRE_REACTIONS.length];
  }, [logs]);

  const addWood = useCallback(() => {
    setLogs((prev) => prev + 1);
    setIsFirePumping(true);
    setTimeout(() => setIsFirePumping(false), 400);

    const particleTexts = ['+1 Scheit 🪵', 'Knister! ✨', '🔥 Warm!', 'Funkenflug! 🌟', 'Gemütlich ⛺'];
    const text = logs === 9 ? '🎖️ Feuermeister!' : particleTexts[Math.floor(Math.random() * particleTexts.length)];
    const id = Date.now() + Math.random();
    const x = Math.floor(Math.random() * 80) - 40;

    setParticles((prev) => [...prev.slice(-4), { id, text, x }]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1200);
  }, [logs]);

  const nextWisdom = () => {
    setWisdomIndex((prev) => (prev + 1) % SCOUT_WISDOMS.length);
  };

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  return (
    <div className={cn('grain relative flex min-h-[100dvh] flex-col bg-canvas text-fg selection:bg-accent selection:text-white', className)}>
      {/* Lokale Scoped-Styles für die Lagerfeuer-Animationen */}
      <style>{`
        @keyframes cevi-flame-1 {
          0%, 100% { transform: scale(1) rotate(-1deg); opacity: 0.95; }
          30% { transform: scale(1.06, 0.96) rotate(1.5deg); opacity: 1; }
          70% { transform: scale(0.96, 1.04) rotate(-2deg); opacity: 0.9; }
        }
        @keyframes cevi-flame-2 {
          0%, 100% { transform: scale(1) rotate(1.5deg); }
          40% { transform: scale(0.95, 1.05) rotate(-1.5deg); }
          80% { transform: scale(1.05, 0.97) rotate(1deg); }
        }
        @keyframes cevi-flame-core {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.12, 1.08) translateY(-1px); opacity: 1; }
        }
        @keyframes cevi-ember {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 1; }
          50% { opacity: 0.8; }
          100% { transform: translateY(-42px) translateX(var(--drift, 8px)) scale(0.2); opacity: 0; }
        }
        @keyframes cevi-star {
          0%, 100% { opacity: 0.25; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes cevi-particle-float {
          0% { transform: translateY(0) scale(0.85); opacity: 1; }
          100% { transform: translateY(-55px) scale(1.08); opacity: 0; }
        }
        .animate-flame-1 { animation: cevi-flame-1 2.2s ease-in-out infinite; transform-origin: 50% 90%; }
        .animate-flame-2 { animation: cevi-flame-2 1.8s ease-in-out infinite; transform-origin: 50% 90%; }
        .animate-flame-core { animation: cevi-flame-core 1.2s ease-in-out infinite; transform-origin: 50% 90%; }
        .animate-star { animation: cevi-star 3s ease-in-out infinite; }
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
            <span className="text-2xs font-medium text-fg-subtle">Lagerplatz & Schichten</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Hauptbereich */}
      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 py-6 sm:py-12 text-center">
        {/* Hinterer sanfter Lichtkegel */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[380px] w-[380px] sm:h-[480px] sm:w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-500/15 via-rose-500/10 to-transparent blur-3xl"
        />

        {/* 1. Lagerfeuer- und Zeltlager-Szene */}
        <div className="relative mb-4 flex flex-col items-center">
          {/* Schwebende Klick-Partikel ("+1 Holzscheit") */}
          <div className="pointer-events-none absolute -top-8 z-30 flex justify-center">
            {particles.map((p) => (
              <span
                key={p.id}
                style={{
                  transform: `translateX(${p.x}px)`,
                  animation: 'cevi-particle-float 1.2s ease-out forwards',
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
            onClick={addWood}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                addWood();
              }
            }}
            title="Klick aufs Feuer, um Holz nachzulegen!"
            aria-label="Lagerfeuer: Klick um Holz nachzulegen"
            className={cn(
              'group relative cursor-pointer select-none rounded-card p-2 outline-none transition-[transform,filter] duration-300',
              isFirePumping ? 'scale-105' : 'hover:scale-[1.02]',
              'focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas'
            )}
          >
            <svg
              viewBox="0 0 420 220"
              className="h-44 w-auto sm:h-56 drop-shadow-soft"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Farbverläufe Flammen */}
                <linearGradient id="flameOuter" x1="210" y1="160" x2="210" y2="85" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#dc2626" />
                  <stop offset="45%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient id="flameMid" x1="210" y1="160" x2="210" y2="105" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ea580c" />
                  <stop offset="60%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#fde047" />
                </linearGradient>
                <linearGradient id="flameCore" x1="210" y1="165" x2="210" y2="125" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>

                {/* Glühender Boden */}
                <radialGradient id="hearthGlow" cx="210" cy="175" r="70" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
                  <stop offset="50%" stopColor="#dc2626" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
                </radialGradient>

                {/* Zelt-Beleuchtung Innen */}
                <radialGradient id="tentGlow" cx="85" cy="155" r="30" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Sternenhimmel */}
              <g className="text-fg/40 dark:text-amber-200/50">
                <circle cx="35" cy="35" r="1.5" fill="currentColor" className="animate-star" style={{ animationDelay: '0.2s' }} />
                <circle cx="95" cy="22" r="1.2" fill="currentColor" className="animate-star" style={{ animationDelay: '1.1s' }} />
                <circle cx="150" cy="40" r="1" fill="currentColor" className="animate-star" style={{ animationDelay: '0.7s' }} />
                <circle cx="210" cy="18" r="1.5" fill="currentColor" className="animate-star" style={{ animationDelay: '2.1s' }} />
                <circle cx="270" cy="32" r="1" fill="currentColor" className="animate-star" style={{ animationDelay: '1.4s' }} />
                <circle cx="340" cy="25" r="1.8" fill="currentColor" className="animate-star" style={{ animationDelay: '0.4s' }} />
                <circle cx="390" cy="45" r="1.2" fill="currentColor" className="animate-star" style={{ animationDelay: '1.8s' }} />

                {/* Polarstern / Leuchtkreuz */}
                <path
                  d="M310 16 L312 21 L317 23 L312 25 L310 30 L308 25 L303 23 L308 21 Z"
                  fill="currentColor"
                  className="animate-star text-amber-400 dark:text-amber-300"
                  style={{ animationDelay: '0.9s' }}
                />
              </g>

              {/* Tannenwald-Silhouette im Hintergrund */}
              <g className="text-surface-3 opacity-60">
                {/* Bäume links */}
                <polygon points="40,165 30,145 35,145 25,125 32,125 20,105 45,105 38,125 45,125 35,145 42,145 50,165" fill="currentColor" />
                <polygon points="125,165 118,148 122,148 114,130 119,130 110,115 130,115 124,130 129,130 122,148 126,148 135,165" fill="currentColor" />
                {/* Bäume rechts */}
                <polygon points="295,165 288,148 292,148 284,130 289,130 280,115 300,115 294,130 299,130 292,148 296,148 305,165" fill="currentColor" />
                <polygon points="360,165 352,145 356,145 348,125 353,125 342,108 368,108 362,125 367,125 358,145 364,145 372,165" fill="currentColor" />
              </g>

              {/* Bodenlinie / Waldlichtung */}
              <path
                d="M10 178 Q110 170 210 173 T410 176"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="text-line-strong"
              />

              {/* Cevi-Zelt (A-Frame / Firstzelt links) */}
              <g id="scout-tent" className="transition-transform duration-300">
                {/* Zeltstoff */}
                <polygon points="50,174 85,112 120,174" className="fill-surface-2 stroke-line-strong" strokeWidth="2" strokeLinejoin="round" />
                {/* Zelt-Firststange oben */}
                <line x1="85" y1="108" x2="85" y2="114" className="stroke-amber-800" strokeWidth="3" strokeLinecap="round" />
                {/* Zelteingang (Dreiecksöffnung) */}
                <polygon points="72,174 85,130 98,174" className="fill-surface-3 stroke-line" strokeWidth="1.5" />
                {/* Zeltinnenschein */}
                <polygon points="75,174 85,135 95,174" fill="url(#tentGlow)" />
                {/* Zeltleinen & Heringe */}
                <line x1="85" y1="112" x2="38" y2="175" className="stroke-line-strong" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="85" y1="112" x2="132" y2="175" className="stroke-line-strong" strokeWidth="1.5" strokeDasharray="3 2" />
                <circle cx="38" cy="175" r="2" className="fill-amber-700" />
                <circle cx="132" cy="175" r="2" className="fill-amber-700" />
              </g>

              {/* Wegweiser (Holzpfosten rechts) */}
              <g id="trail-post" className="transition-transform duration-300">
                {/* Holzpfosten */}
                <rect x="330" y="128" width="6" height="48" rx="2" className="fill-amber-900/80 stroke-amber-950/40" strokeWidth="1" />
                {/* Schild 1: 404 Weg */}
                <g transform="rotate(-7 333 136)">
                  <path d="M312 130 L350 130 L358 136 L350 142 L312 142 Z" className="fill-surface-2 stroke-line-strong" strokeWidth="1.5" />
                  <text x="318" y="138" fontSize="7.5" fontWeight="bold" fontFamily="monospace" className="fill-rose-500">404 ?</text>
                </g>
                {/* Schild 2: Lagerplatz */}
                <g transform="rotate(4 333 148)">
                  <path d="M310 144 L348 144 L356 150 L348 156 L310 156 Z" className="fill-accent/15 stroke-accent" strokeWidth="1.5" />
                  <text x="316" y="152" fontSize="6.5" fontWeight="bold" className="fill-accent-ink">Lager ➜</text>
                </g>
              </g>

              {/* Glühschein am Boden unter dem Lagerfeuer */}
              <ellipse cx="210" cy="175" rx="65" ry="18" fill="url(#hearthGlow)" />

              {/* Steinkranz um das Feuer */}
              <g id="hearth-stones">
                <ellipse cx="178" cy="173" rx="7" ry="4" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
                <ellipse cx="192" cy="176" rx="8" ry="4.5" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
                <ellipse cx="208" cy="177" rx="8.5" ry="5" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
                <ellipse cx="225" cy="176" rx="8" ry="4.5" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
                <ellipse cx="240" cy="173" rx="7" ry="4" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
                <ellipse cx="185" cy="169" rx="6" ry="3.5" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
                <ellipse cx="233" cy="169" rx="6" ry="3.5" className="fill-surface-3 stroke-line-strong" strokeWidth="1" />
              </g>

              {/* Holzscheite (gekreuzt) */}
              <g id="campfire-logs">
                {/* Linker Scheit */}
                <g transform="rotate(-22 210 167)">
                  <rect x="180" y="163" width="60" height="9" rx="4" className="fill-amber-950 stroke-amber-900" strokeWidth="1" />
                  <ellipse cx="182" cy="167.5" rx="3.5" ry="4" className="fill-amber-700" />
                  <circle cx="182" cy="167.5" r="1.8" className="fill-amber-900" />
                </g>
                {/* Rechter Scheit */}
                <g transform="rotate(22 210 167)">
                  <rect x="180" y="163" width="60" height="9" rx="4" className="fill-amber-950 stroke-amber-900" strokeWidth="1" />
                  <ellipse cx="238" cy="167.5" rx="3.5" ry="4" className="fill-amber-700" />
                  <circle cx="238" cy="167.5" r="1.8" className="fill-amber-900" />
                </g>
              </g>

              {/* Das animierte Lagerfeuer */}
              <g id="fire-flames" className="transition-transform duration-200">
                {/* Äussere Hauptflamme */}
                <path
                  d="M210 82 C222 105 238 120 236 142 C234 160 220 166 210 166 C200 166 186 160 184 142 C182 120 198 105 210 82 Z"
                  fill="url(#flameOuter)"
                  className="animate-flame-1 drop-shadow-glow"
                />

                {/* Mittlere Züngelflamme */}
                <path
                  d="M212 100 C221 116 230 128 227 146 C225 159 217 165 210 165 C203 165 195 159 193 146 C190 128 203 116 212 100 Z"
                  fill="url(#flameMid)"
                  className="animate-flame-2"
                />

                {/* Weisser/Gelber Flammenkern */}
                <path
                  d="M210 122 C216 133 222 142 220 152 C218 161 213 164 210 164 C207 164 202 161 200 152 C198 142 204 133 210 122 Z"
                  fill="url(#flameCore)"
                  className="animate-flame-core"
                />
              </g>

              {/* Aufsteigende Funken */}
              <g id="fire-embers">
                <circle
                  cx="205"
                  cy="100"
                  r="2"
                  className="fill-amber-400"
                  style={{ animation: 'cevi-ember 2s linear infinite', '--drift': '-10px' } as any}
                />
                <circle
                  cx="214"
                  cy="92"
                  r="2.5"
                  className="fill-yellow-300"
                  style={{ animation: 'cevi-ember 2.4s linear infinite 0.6s', '--drift': '12px' } as any}
                />
                <circle
                  cx="210"
                  cy="80"
                  r="1.8"
                  className="fill-orange-400"
                  style={{ animation: 'cevi-ember 1.8s linear infinite 1.1s', '--drift': '-4px' } as any}
                />
                <circle
                  cx="218"
                  cy="86"
                  r="1.5"
                  className="fill-amber-300"
                  style={{ animation: 'cevi-ember 2.2s linear infinite 1.5s', '--drift': '8px' } as any}
                />
              </g>
            </svg>
          </div>

          {/* Interaktions-Leiste für das Lagerfeuer */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={addWood}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition',
                'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg border border-line active:scale-95'
              )}
            >
              <Flame className="size-3.5 text-amber-500 fill-amber-500 animate-pulse" />
              <span>Holz nachlegen</span>
              {logs > 0 && (
                <span className="tabular font-mono text-2xs rounded-full bg-accent/15 px-1.5 py-0.2 text-accent-ink font-bold">
                  {logs}
                </span>
              )}
            </button>

            {logs >= 10 && (
              <Badge tone="success" className="animate-scale-in">
                <Award className="size-3 mr-1" />
                Ehren-Feuermeister*in!
              </Badge>
            )}
          </div>

          {/* Rückmeldung des Lagerfeuers bei Interaktion */}
          {currentFireReaction && (
            <p className="mt-2 max-w-md animate-fade-in text-xs font-medium italic text-amber-600 dark:text-amber-400">
              {currentFireReaction}
            </p>
          )}
        </div>

        {/* 2. Titel & Badge */}
        <div className="animate-fade-up">
          <Badge tone="accent" className="mb-3 px-3 py-1 text-xs font-semibold tracking-wide">
            {badge}
          </Badge>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl lg:text-5xl text-balance">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-fg-muted text-balance">
            {description}
          </p>
        </div>

        {/* 3. Klare Wege / Aktionen */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={homeHref}
            className={buttonClasses({
              variant: 'primary',
              size: 'lg',
              className: 'shadow-glow',
            })}
          >
            <Compass className="size-5" />
            <span>{homeLabel}</span>
          </Link>

          {showBackStep && canGoBack && (
            <Button
              variant="secondary"
              size="lg"
              onClick={handleBack}
              aria-label="Zur vorherigen Seite zurückkehren"
            >
              <ArrowLeft className="size-5" />
              <span>Einen Schritt zurück</span>
            </Button>
          )}
        </div>

        {/* Weitere Schnell-Links (falls angegeben) */}
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

        {/* 4. Cevi-Überlebensweisheit (interaktives Kärtchen) */}
        <div className="mt-10 w-full max-w-md animate-fade-up">
          <div className="relative rounded-card border border-dashed border-line-strong bg-surface/75 p-4 sm:p-5 text-left backdrop-blur-sm transition">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-accent-ink">
                <Sparkles className="size-3.5 text-amber-500" />
                Cevi-Überlebensweisheit #{wisdomIndex + 1}
              </span>
              <button
                type="button"
                onClick={nextWisdom}
                title="Nächster Tipp"
                aria-label="Nächste Weisheit anzeigen"
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold text-fg-subtle hover:bg-surface-2 hover:text-fg transition active:rotate-180 duration-200"
              >
                <RefreshCw className="size-3" />
                <span className="hidden sm:inline">Nächster</span>
              </button>
            </div>
            <p className="mt-3 text-xs sm:text-sm leading-relaxed text-fg-muted italic">
              {SCOUT_WISDOMS[wisdomIndex]}
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
