'use client';

import React, { useState, useRef } from 'react';
import {
  Clock,
  Check,
  Plus,
  Sparkles,
  ShieldCheck,
  Users,
  Moon,
  Flame,
} from 'lucide-react';
import type { OrganizationConfig } from '@schichtplan/shared';
import { BrandLogo } from './BrandLogo';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
}

export function Hero3DStage({ org }: { org?: OrganizationConfig } = {}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const isPfadi = org?.slug === 'pfadi';
  const isJubla = org?.slug === 'jubla';
  const isVerein = org?.slug === 'verein';

  const badgeAuthText = isVerein
    ? 'Einfach mit E-Mail'
    : `Mit ${org?.authProviderShort ?? 'Cevi.DB'}`;

  const badgeUnitText = isPfadi
    ? 'St. Georg 2026'
    : isJubla
    ? 'Wohlen 2026'
    : isVerein
    ? 'Oberglatt 2026'
    : 'Illnau 2026';

  const initials = isPfadi ? 'SG' : isJubla ? 'JW' : isVerein ? 'TV' : 'IL';

  const eventTitle = isPfadi
    ? 'Pfadi Sommerlager 2026'
    : isJubla
    ? 'Jubla-Tag & Pfarreifest'
    : isVerein
    ? 'Dorfturnier 2026'
    : 'Chilbi Illnau 2026';

  const eventSubtitle = isPfadi
    ? 'Lagerküche & Posten • Pfadi St. Georg'
    : isJubla
    ? 'Festzelt & Spiele • Jubla Wohlen'
    : isVerein
    ? 'Festwirtschaft & Bar • TV Oberglatt'
    : 'Festzelt & Barbetrieb • Cevi Illnau';

  const logoUrl = org?.logoUrl ?? '/images/cevi-logo.svg';

  // Interactive state
  const [barEnrolled, setBarEnrolled] = useState(false);
  const [nightEnrolled, setNightEnrolled] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  const triggerConfetti = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const cardRect = cardRef.current.getBoundingClientRect();
    const originX = e.clientX - cardRect.left;
    const originY = e.clientY - cardRect.top;

    const colors = ['#e11d48', '#f59e0b', '#10b981', '#38bdf8', '#fbbf24'];
    const pieces: ConfettiPiece[] = Array.from({ length: 20 }).map((_, i) => ({
      id: Date.now() + i,
      x: originX + (Math.random() - 0.5) * 50,
      y: originY + (Math.random() - 0.5) * 25,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 5,
      angle: Math.random() * 360,
    }));
    setConfetti(pieces);
    setTimeout(() => setConfetti([]), 1100);
  };

  const handleBarClick = (e: React.MouseEvent) => {
    if (!barEnrolled) {
      triggerConfetti(e);
    }
    setBarEnrolled(!barEnrolled);
  };

  const handleNightClick = (e: React.MouseEvent) => {
    if (!nightEnrolled) {
      triggerConfetti(e);
    }
    setNightEnrolled(!nightEnrolled);
  };

  const totalFilled = 23 + (barEnrolled ? 1 : 0) + (nightEnrolled ? 1 : 0);
  const percent = Math.round((totalFilled / 28) * 100);

  return (
    <div className="relative w-full select-none">
      {/* Ambient Backlight Glow */}
      <div
        className="pointer-events-none absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-accent/30 via-amber-500/20 to-rose-600/15 blur-2xl opacity-75 -z-10"
        aria-hidden="true"
      />

      {/* Main Stage Plane */}
      <div className="relative rounded-[2rem] border border-line/80 bg-surface/90 p-2 sm:p-3 shadow-lift backdrop-blur-xl transition-all duration-300">
        {/* Floating Satellite Badge 1 (Top-Left) */}
        <div className="absolute -top-4 -left-3 sm:-left-5 z-20 hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/40 bg-surface-2/95 px-3 py-1 shadow-lift backdrop-blur-md">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-2xs font-bold text-fg">{badgeAuthText}</span>
          <ShieldCheck className="size-3.5 text-emerald-400" />
        </div>

        {/* Floating Satellite Badge 2 (Top-Right) */}
        <div className="absolute -top-3.5 right-2 sm:-top-4 sm:-right-4 z-20 flex items-center gap-1.5 sm:gap-2 rounded-full border border-line/80 bg-surface-2/95 px-2.5 sm:px-3 py-1 shadow-lift backdrop-blur-md">
          <BrandLogo logoUrl={logoUrl} className="size-4 shrink-0" alt="" />
          <span className="text-2xs font-bold text-fg-subtle">{badgeUnitText}</span>
        </div>

        {/* Inner Card Core */}
        <div
          ref={cardRef}
          className="rounded-[calc(2rem-0.5rem)] border border-line bg-surface p-4 sm:p-7 shadow-soft relative overflow-hidden"
        >
          {/* Header Row */}
          <div className="flex items-center justify-between pb-4 border-b border-line gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-tile bg-accent/15 text-accent-ink font-bold text-sm sm:text-base shadow-sm">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h3 className="font-display text-sm sm:text-base font-bold text-fg truncate">
                    {eventTitle}
                  </h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-2xs sm:text-xs text-fg-subtle truncate">
                  {eventSubtitle}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="font-mono text-xs font-bold text-fg tabular">
                {totalFilled}/28 belegt
              </div>
              <div className="text-[10px] text-fg-subtle hidden xs:block sm:block">
                {28 - totalFilled} freie Plätze
              </div>
            </div>
          </div>

          {/* Real-time Occupancy Gauge */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-fg flex items-center gap-1.5">
                <Users className="size-3.5 text-accent" />
                Live-Besetzung
              </span>
              <span className="font-mono text-accent-ink font-bold tabular transition-all">
                {percent}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-surface-2 overflow-hidden border border-line p-0.5">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-accent rounded-full transition-all duration-500 ease-out shadow-sm"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Interactive Shift Rows */}
          <div className="mt-5 space-y-2.5">
            {/* Shift 1: Grill & Pommes (Static Full) */}
            <div className="rounded-tile border border-line bg-surface-2/60 p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 pr-1">
                <div className="font-semibold text-fg truncate flex items-center gap-1.5">
                  <Flame className="size-3 text-amber-500 shrink-0" />
                  <span>Grill &amp; Pommes</span>
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

            {/* Shift 2: Barbetrieb (Interactive Clickable Slot 1) */}
            <div
              onClick={handleBarClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleBarClick(e as any);
              }}
              className={`relative rounded-tile border transition-all duration-200 cursor-pointer p-3 sm:p-3.5 flex items-center justify-between gap-2 text-xs select-none shadow-sm hover:shadow-md ${
                barEnrolled
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-accent/40 bg-accent/8 hover:bg-accent/15'
              }`}
            >
              <div className="min-w-0 pr-1">
                <div className="font-semibold text-fg flex items-center gap-1.5 sm:gap-2">
                  <span className="truncate">Barbetrieb &amp; Cocktails</span>
                  <span className="shrink-0 rounded bg-accent/20 text-accent-ink px-1.5 py-0.5 text-[10px] font-mono font-bold">
                    16+
                  </span>
                </div>
                <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                  <Clock className="size-3 shrink-0" />
                  <span className="shrink-0">21:00 · 00:00</span>
                  <span>•</span>
                  {barEnrolled ? (
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="truncate">Falk, Remo,</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.2 text-[10px] font-bold text-emerald-500 shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Du!
                      </span>
                    </span>
                  ) : (
                    <span className="font-medium text-accent truncate">
                      1 Platz frei
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {barEnrolled ? (
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-500/20 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-emerald-400 border border-emerald-500/30 animate-fade-in">
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

            {/* Shift 3: Nachtwache (Interactive Clickable Slot 2) */}
            <div
              onClick={handleNightClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleNightClick(e as any);
              }}
              className={`relative rounded-tile border transition-all duration-200 cursor-pointer p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs select-none shadow-sm hover:shadow-md ${
                nightEnrolled
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-warning/35 bg-warning/5 hover:bg-warning/10'
              }`}
            >
              <div className="min-w-0 pr-1">
                <div className="font-semibold text-fg truncate flex items-center gap-1.5">
                  <Moon className="size-3 text-warning shrink-0" />
                  <span>Nachtwache &amp; Zeltaufsicht</span>
                  <span className="shrink-0 rounded-full bg-warning/20 px-1.5 py-0.5 text-[9px] font-bold text-warning-ink">
                    Dringend
                  </span>
                </div>
                <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5 truncate">
                  <Clock className="size-3 shrink-0" />
                  <span className="shrink-0">02:00 · 06:00</span>
                  <span>•</span>
                  {nightEnrolled ? (
                    <span className="flex items-center gap-1 min-w-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.2 text-[10px] font-bold text-emerald-500 shrink-0">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Du!
                      </span>
                      <span className="text-fg-subtle truncate">+ 1 frei</span>
                    </span>
                  ) : (
                    <span className="text-warning-ink font-semibold truncate">0/2 belegt</span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {nightEnrolled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-emerald-400 border border-emerald-500/30">
                    <Check className="size-3 stroke-[2.5]" />
                    <span>Dabei!</span>
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-warning/20 px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-warning-ink hover:bg-warning/30 transition">
                    + Eintragen
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer Callout */}
          <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between gap-1.5 text-2xs text-fg-subtle">
            <span className="flex items-center gap-1.5 text-accent font-medium">
              <Sparkles className="size-3 shrink-0" />
              <span>Klicke auf eine Schicht zum Ausprobieren</span>
            </span>
            <span className="font-mono text-fg-subtle shrink-0">
              {barEnrolled || nightEnrolled ? '✓ Schicht gespeichert' : 'Interaktiv'}
            </span>
          </div>

          {/* Confetti Particle Burst Animation (Spawned at exact click coordinates) */}
          {confetti.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
              {confetti.map((c) => (
                <span
                  key={c.id}
                  className="absolute rounded-sm animate-ping"
                  style={{
                    left: `${c.x}px`,
                    top: `${c.y}px`,
                    width: `${c.size}px`,
                    height: `${c.size * 1.5}px`,
                    backgroundColor: c.color,
                    transform: `rotate(${c.angle}deg)`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Satellite Toast Notification */}
        {(barEnrolled || nightEnrolled) && (
          <div className="absolute -bottom-3.5 left-4 right-4 sm:left-auto sm:right-6 z-30 flex items-center justify-center sm:justify-start gap-2 rounded-full border border-emerald-500/50 bg-surface-2/95 px-3.5 py-1.5 shadow-lift backdrop-blur-md animate-fade-up">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="size-2.5 stroke-[3]" />
            </span>
            <span className="text-2xs font-bold text-fg truncate">
              {barEnrolled && nightEnrolled
                ? '2 Schichten gesichert! Kalender-Sync aktiv'
                : 'Schicht gesichert! Automatische Erinnerung aktiv'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
