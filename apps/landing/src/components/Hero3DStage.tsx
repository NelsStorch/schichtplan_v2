'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  Clock,
  Check,
  Plus,
  Sparkles,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { CeviLogo } from './CeviLogo';

export function Hero3DStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [glare, setGlare] = useState<{ x: number; y: number; opacity: number }>({
    x: 50,
    y: 50,
    opacity: 0,
  });

  // Simulator interactive state
  const [enrolled, setEnrolled] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Subtle 3D tilt angles
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;

    setTilt({ x: rotateX, y: rotateY });
    setGlare({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.18,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setGlare((prev) => ({ ...prev, opacity: 0 }));
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full [perspective:1200px] select-none"
    >
      {/* 3D Ambient Backlight Bloom */}
      <div
        className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-accent/30 via-amber-500/20 to-rose-600/15 blur-2xl opacity-70 transition-opacity duration-500 -z-10"
        style={{
          transform: `translate3d(${tilt.y * 1.5}px, ${-tilt.x * 1.5}px, -20px)`,
        }}
      />

      {/* Main 3D Stage Plane */}
      <div
        className="relative rounded-[2rem] border border-line/80 bg-surface/85 p-2 sm:p-3 shadow-lift backdrop-blur-2xl transition-transform duration-200 ease-out will-change-transform"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`,
        }}
      >
        {/* Specular Glare Reflection */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[2rem] transition-opacity duration-300 z-30"
          style={{
            opacity: glare.opacity,
            background: `radial-gradient(circle 420px at ${glare.x}% ${glare.y}%, rgba(255, 255, 255, 0.22) 0%, transparent 75%)`,
          }}
          aria-hidden="true"
        />

        {/* Floating 3D Satellite Badge 1 (Top-Left: Cevi.DB Live Sync) */}
        <div
          className="absolute -top-5 -left-4 sm:-left-6 z-40 hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/40 bg-surface-2/95 px-3.5 py-1.5 shadow-lift backdrop-blur-xl transition-transform duration-200"
          style={{
            transform: `translateZ(65px) translate3d(${tilt.y * 0.8}px, ${-tilt.x * 0.8}px, 0)`,
          }}
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-2xs font-bold text-fg">Mit Cevi.DB</span>
          <ShieldCheck className="size-3.5 text-emerald-400" />
        </div>

        {/* Floating 3D Satellite Badge 2 (Top-Right: Authentic Cevi Orb) */}
        <div
          className="absolute -top-3.5 right-2 sm:-top-4 sm:-right-5 z-40 flex items-center gap-1.5 sm:gap-2 rounded-full border border-line/80 bg-surface-2/95 px-2.5 sm:px-3 py-1 shadow-lift backdrop-blur-xl"
          style={{
            transform: `translateZ(55px) translate3d(${tilt.y * 0.6}px, ${-tilt.x * 0.6}px, 0)`,
          }}
        >
          <CeviLogo className="size-4 shrink-0" />
          <span className="text-2xs font-bold text-fg-subtle">Illnau 2026</span>
        </div>

        {/* Inner Card Core (Level 1: Stage Deck) */}
        <div
          className="rounded-[calc(2rem-0.5rem)] border border-line bg-surface p-4 sm:p-7 shadow-inset-hi"
          style={{
            transform: 'translateZ(25px)',
          }}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between pb-4 border-b border-line gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-tile bg-accent/15 text-accent-ink font-bold text-sm sm:text-base shadow-sm">
                IL
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h3 className="font-display text-sm sm:text-base font-bold text-fg truncate">
                    Chilbi Illnau 2026
                  </h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-2xs sm:text-xs text-fg-subtle truncate">
                  Festzelt & Barbetrieb • Cevi Illnau
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="font-mono text-xs font-bold text-fg tabular">
                {enrolled ? '24/28 belegt' : '23/28 belegt'}
              </div>
              <div className="text-[10px] text-fg-subtle hidden xs:block sm:block">Freie Slots vorhanden</div>
            </div>
          </div>

          {/* Real-time Occupancy Gauge */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-fg flex items-center gap-1.5">
                <Users className="size-3.5 text-accent" />
                Helfer-Besetzung
              </span>
              <span className="font-mono text-accent-ink font-bold tabular">
                {enrolled ? '86%' : '82%'}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-2 overflow-hidden border border-line p-0.5">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-accent rounded-full transition-all duration-500 ease-out"
                style={{ width: enrolled ? '86%' : '82%' }}
              />
            </div>
          </div>

          {/* Interactive Shift Rows (Level 2: Z=45px) */}
          <div className="mt-5 space-y-2.5">
            {/* Shift 1: Grill & Pommes (Full) */}
            <div className="rounded-tile border border-line bg-surface-2/60 p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 pr-1">
                <div className="font-semibold text-fg truncate flex items-center gap-1.5">
                  <span>Grill & Pommes</span>
                  <span className="text-[10px] text-fg-subtle shrink-0">🔥 Heiss</span>
                </div>
                <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5 truncate">
                  <Clock className="size-3 shrink-0" />
                  <span className="shrink-0">18:00 · 21:00</span>
                  <span>•</span>
                  <span className="truncate">Falk, Remo</span>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-surface-3 px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-fg-muted">
                2/2 Voll
              </span>
            </div>

            {/* Shift 2: Barbetrieb (Interactive 3D Clickable Slot) */}
            <div
              onClick={() => setEnrolled(!enrolled)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setEnrolled(!enrolled);
              }}
              className={`rounded-tile border transition-all duration-200 cursor-pointer p-3 sm:p-3.5 flex items-center justify-between gap-2 text-xs select-none shadow-sm hover:shadow-md ${
                enrolled
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-accent/50 bg-accent/8 hover:bg-accent/15'
              }`}
              style={{
                transform: 'translateZ(15px)',
              }}
            >
              <div className="min-w-0 pr-1">
                <div className="font-semibold text-fg flex items-center gap-1.5 sm:gap-2">
                  <span className="truncate">Barbetrieb & Ausschank</span>
                  <span className="shrink-0 rounded bg-accent/20 text-accent-ink px-1.5 py-0.2 text-[10px] font-mono font-bold">
                    16+
                  </span>
                </div>
                <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                  <Clock className="size-3 shrink-0" />
                  <span className="shrink-0">21:00 · 00:00</span>
                  <span>•</span>
                  <span className="font-medium truncate">
                    {enrolled ? 'Du angemeldet!' : '1 frei'}
                  </span>
                </div>
              </div>

              <div className="shrink-0">
                {enrolled ? (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-500/20 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-emerald-400 border border-emerald-500/30">
                    <Check className="size-3 sm:size-3.5 stroke-[2.5]" />
                    <span>Dabei!</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-accent px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-accent-fg shadow-glow hover:brightness-110 active:scale-95 transition-all">
                    <Plus className="size-3 sm:size-3.5 stroke-[2.5]" />
                    <span>Eintragen</span>
                  </span>
                )}
              </div>
            </div>

            {/* Shift 3: Nachtwache (Urgent) */}
            <div className="rounded-tile border border-warning/35 bg-warning/5 p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 pr-1">
                <div className="font-semibold text-fg truncate flex items-center gap-1.5">
                  <span>Nachtwache & Zeltaufsicht</span>
                  <span className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.2 text-[9px] font-bold text-warning-ink">
                    Dringend
                  </span>
                </div>
                <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5 truncate">
                  <Clock className="size-3 shrink-0" />
                  <span className="shrink-0">02:00 · 06:00</span>
                  <span>•</span>
                  <span className="text-warning-ink font-semibold truncate">0/2 belegt</span>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-warning/20 px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-warning-ink">
                2 Plätze frei
              </span>
            </div>
          </div>

          {/* Footer Callout */}
          <div className="mt-4 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-1.5 text-2xs text-fg-subtle">
            <span className="flex items-center gap-1.5 text-accent-ink font-medium">
              <Sparkles className="size-3 shrink-0" />
              <span>Interaktiver Simulator · Klicke zum Testen</span>
            </span>
            <span className="font-mono flex items-center gap-1 shrink-0">
              <Zap className="size-3 text-amber-400" />
              <span>Sofort synchron</span>
            </span>
          </div>
        </div>

        {/* Floating 3D Satellite Badge 3 (Bottom Toast Notification) */}
        {enrolled && (
          <div
            className="absolute -bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:-bottom-5 z-40 flex items-center justify-center sm:justify-start gap-2 rounded-full border border-emerald-500/50 bg-surface-2/95 px-3.5 sm:px-4 py-1.5 sm:py-2 shadow-lift backdrop-blur-xl animate-fade-up"
            style={{
              transform: `translateZ(75px) translate3d(${tilt.y * 0.9}px, ${-tilt.x * 0.9}px, 0)`,
            }}
          >
            <span className="flex size-4 sm:size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="size-2.5 sm:size-3 stroke-[3]" />
            </span>
            <span className="text-2xs font-bold text-fg truncate">
              Schicht gesichert! Kalendereintrag bereit
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
