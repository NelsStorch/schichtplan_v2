'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  LogIn,
  Flame,
  ExternalLink,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  getLoginUrl,
  getLandingUrl,
  type UserDto,
} from '@schichtplan/shared';
import { CeviLogo } from '@/components/CeviLogo';
import { Avatar, Button, buttonClasses } from '@schichtplan/ui';
import { Campfire3DCanvas } from '@/components/Campfire3DCanvas';
import { Card3DTilt } from '@/components/Card3DTilt';
import { Hero3DStage } from '@/components/Hero3DStage';
import { CeviDbIsometricGraphic } from '@/components/CeviDbIsometricGraphic';
import { SubdomainIsometricGraphic } from '@/components/SubdomainIsometricGraphic';
import { MultiEventIsometricGraphic } from '@/components/MultiEventIsometricGraphic';
import { MobilePwaIsometricGraphic } from '@/components/MobilePwaIsometricGraphic';
import { CampsiteNightGraphic } from '@/components/CampsiteNightGraphic';

export default function LandingPage() {
  // Angemeldete Person (Cookie gilt für alle Subdomains): Name statt «Anmelden» im Kopf
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  /** Abteilung anlegen passiert im Login-Portal (nur Abteilungsleitung mit Cevi.DB) */
  const goCreateDepartment = () => {
    window.location.href = getLoginUrl(getLandingUrl(), '/abteilung-erstellen');
  };

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-canvas text-fg selection:bg-accent selection:text-white overflow-x-hidden">
      {/* 3D Atmospheric Canvas (Interactive Rising Campfire Embers & Parallax) */}
      <Campfire3DCanvas />

      {/* Campfire Warmth Atmosphere Glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[640px] bg-campfire opacity-95 -z-10" />

      {/* Floating Glass Header */}
      <header className="sticky top-4 z-header mx-auto w-full max-w-6xl px-4">
        <div className="flex h-16 items-center justify-between rounded-full border border-line/80 bg-surface/85 px-4 sm:px-6 backdrop-blur-xl shadow-soft">
          <Link href="/" className="flex items-center gap-3 group">
            <CeviLogo className="size-9 transition-transform duration-200 group-hover:scale-105" />
            <div className="flex flex-col">
              <span className="font-display text-base font-extrabold tracking-tight text-fg">
                Cevi Schichtplan
              </span>
              <span className="text-[11px] font-medium text-fg-subtle">
                Ehrenamtlich & Open Source
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {me ? (
              <Link
                href="/profil"
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold text-fg transition hover:bg-surface-2"
                aria-label="Dein Profil"
              >
                <Avatar name={me.ceviName || me.firstName} size="sm" highlight className="size-7 text-[10px]" />
                <span className="max-w-28 truncate">{me.ceviName || me.firstName}</span>
              </Link>
            ) : (
              <Link
                href="/login"
                className={buttonClasses({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'gap-1.5 text-xs font-semibold',
                })}
              >
                <LogIn className="size-3.5 text-fg-muted" />
                <span className="hidden sm:inline">Anmelden</span>
              </Link>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={goCreateDepartment}
              className="text-xs font-semibold"
            >
              <Plus className="size-3.5" />
              <span>Abteilung anlegen</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {/* Hero Section: Asymmetric Split (Left Content + Right 3D Interactive Stage) */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              {/* Left Column: Value Proposition */}
              <div className="lg:col-span-7 flex flex-col items-start text-left">
                <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-2xs font-bold uppercase tracking-[0.16em] bg-accent/12 text-accent-ink border border-accent/25 mb-6 shadow-sm">
                  <Flame className="size-3 text-accent animate-pulse" />
                  <span>VEREINSORGANISATION V2</span>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-fg leading-[1.08] text-balance">
                  Schichtplanung für den Cevi, so wie sie sein sollte.
                </h1>

                <p className="mt-5 text-base sm:text-lg text-fg-muted max-w-[54ch] leading-relaxed">
                  Freiwilligeneinsätze an Chilbi, PfiLa und Lagern ohne Excel-Chaos koordinieren.
                  Jede Abteilung auf ihrer eigenen Subdomain, mit Cevi.DB Login und nativer Mobil-Ansicht.
                </p>

                {/* CTAs */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={goCreateDepartment}
                    className="justify-center text-sm font-semibold h-12"
                  >
                    <span>Neue Abteilung anlegen</span>
                  </Button>
                </div>

                {/* Proof Points Strip (Accurate & Zero False Claims) */}
                <div className="mt-10 pt-8 border-t border-line/60 w-full grid grid-cols-3 gap-4 text-left">
                  <div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-fg tabular">
                      100%
                    </div>
                    <div className="text-2xs sm:text-xs text-fg-subtle mt-0.5">
                      Cevi.DB kompatibel
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-fg">
                      Subdomain
                    </div>
                    <div className="text-2xs sm:text-xs text-fg-subtle mt-0.5">
                      Feste eigene Adresse
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-fg tabular">
                      0 CHF
                    </div>
                    <div className="text-2xs sm:text-xs text-fg-subtle mt-0.5">
                      Frei & Open Source
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: The Epic 3D Interactive Stage */}
              <div className="lg:col-span-5">
                <Hero3DStage />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Bento Grid with Bespoke 3D Isometric Graphics & Tilt Physics */}
        <section className="py-20 md:py-28 border-t border-line/60 bg-surface/30 relative">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl mb-12 sm:mb-16">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-2xs font-bold uppercase tracking-[0.16em] bg-surface-2 border border-line text-fg-subtle mb-3">
                <Sparkles className="size-3 text-accent" />
                Funktionen im Detail
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                Gebaut für den Cevi-Alltag.
              </h2>
              <p className="mt-3 text-base text-fg-muted leading-relaxed">
                Alles was Leiterteams und Helfer für reibungslose Einsätze brauchen.
                Keine verschollenen Tabellen, keine Doppelbelegungen, keine unbesetzten Posten.
              </p>
            </div>

            {/* Asymmetrical Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Tile 1: Cevi.DB Single Sign-On (Large 7-cols) with 3D Isometric Graphic */}
              <div className="md:col-span-7">
                <Card3DTilt className="h-full rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft hover:border-line-strong transition-colors">
                  <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-fg">
                        Cevi.DB Single Sign-On
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[50ch]">
                        Kein neues Passwort merken: Helfer und Leitende melden sich direkt mit ihrem bestehenden
                        Cevi.DB Konto (Hitobito) an. Cevi-Name, Stammdaten und Abteilungszugehörigkeit werden
                        automatisch übernommen.
                      </p>
                    </div>

                    {/* Bespoke 3D Isometric Illustration */}
                    <div className="my-4">
                      <CeviDbIsometricGraphic className="max-h-[220px]" />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex items-center justify-between text-xs text-fg-muted">
                      <span className="font-mono text-2xs text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                        Hitobito OAuth 2.0 Integration
                      </span>
                      <span className="text-2xs text-fg-subtle">Sicher & Passwortlos</span>
                    </div>
                  </div>
                </Card3DTilt>
              </div>

              {/* Tile 2: Eigene Subdomain (5-cols) with 3D Isometric Graphic */}
              <div className="md:col-span-5">
                <Card3DTilt className="h-full rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft hover:border-line-strong transition-colors">
                  <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-fg">
                        Eigene Subdomain
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                        Deine Abteilung erhält eine feste eigene Webadresse. Einmal im Flyer oder WhatsApp teilen,
                        dauerhaft gültig.
                      </p>
                    </div>

                    {/* Bespoke 3D Isometric Server & DNS Graphic */}
                    <div className="my-4">
                      <SubdomainIsometricGraphic className="max-h-[200px]" />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex items-center justify-between font-mono text-xs text-fg-subtle">
                      <span className="text-accent-ink font-bold">*.cevi-schichtplan.ch</span>
                      <span className="text-emerald-400 font-semibold">SSL Wildcard aktiv</span>
                    </div>
                  </div>
                </Card3DTilt>
              </div>

              {/* Tile 3: Multi-Event Unterstützung (5-cols) with 3D Isometric Graphic */}
              <div className="md:col-span-5">
                <Card3DTilt className="h-full rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft hover:border-line-strong transition-colors">
                  <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-fg">
                        Multi-Event Management
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                        Chilbi, PfiLa, Sommerlager oder Jubiläumsfeste parallel verwalten, ohne jemals eine neue
                        Tabelle oder Datenbank anzulegen.
                      </p>
                    </div>

                    {/* Bespoke 3D Isometric Architecture Graphic (Festzelt, Campfire, Jurte) */}
                    <div className="my-4">
                      <MultiEventIsometricGraphic className="max-h-[200px]" />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex items-center justify-between text-xs text-fg-muted">
                      <span className="font-semibold text-fg">Beliebig viele Anlässe</span>
                      <span className="text-2xs font-mono text-fg-subtle">Separate Rollen & Rechte</span>
                    </div>
                  </div>
                </Card3DTilt>
              </div>

              {/* Tile 4: Mobil optimiert & PWA (7-cols) with 3D Isometric Smartphone Mockup */}
              <div className="md:col-span-7">
                <Card3DTilt className="h-full rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft hover:border-line-strong transition-colors">
                  <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-bold text-fg">
                        Mobil optimiert & PWA
                      </h3>
                      <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[50ch]">
                        Direkt am Festzelt, am Grill oder am Lagerfeuer neue Helfer einteilen. Funktioniert auf iOS
                        und Android flüssig ohne Installation aus dem App Store.
                      </p>
                    </div>

                    {/* Bespoke 3D Isometric Smartphone Mockup */}
                    <div className="my-4">
                      <MobilePwaIsometricGraphic className="max-h-[220px]" />
                    </div>

                    <div className="pt-4 border-t border-line/80 flex items-center justify-between text-xs text-fg-muted">
                      <span className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 className="size-4" />
                        Offline-fähig für Schlechtwetter-Einsätze
                      </span>
                      <span className="font-mono text-2xs text-fg-subtle">Kein App Store Zwang</span>
                    </div>
                  </div>
                </Card3DTilt>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Epic Panoramic Campsite Night Visual */}
        <section className="relative border-y border-line/60 bg-canvas overflow-hidden">
          <CampsiteNightGraphic />
          <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-canvas/80 pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center pointer-events-none">
            <div className="max-w-xl backdrop-blur-md bg-surface/40 p-6 rounded-[2rem] border border-line/60 shadow-lift">
              <span className="font-mono text-2xs tracking-widest text-accent uppercase font-bold">
                Cevi Lager- & Festkultur
              </span>
              <p className="font-display text-lg sm:text-xl font-bold text-fg mt-1">
                «Vom ersten Zeltaufbau bis zur letzten Schicht am Sonntagmorgen.»
              </p>
              <p className="text-xs text-fg-subtle mt-1">
                Entwickelt mit Herzblut für Cevi-Leitende und Freiwillige.
              </p>
            </div>
          </div>
        </section>

      </main>


      {/* Footer */}
      <footer className="border-t border-line/60 bg-surface/50 py-10 text-xs text-fg-subtle relative z-10">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CeviLogo className="size-7" />
            <span>
              © {new Date().getFullYear()} Cevi Schichtplan · Ein ehrenamtliches Open-Source-Projekt für Cevi-Abteilungen
            </span>
          </div>

          <div className="flex items-center gap-5">
            <a
              href="https://github.com/NelsStorch/schichtplan_v2"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fg transition inline-flex items-center gap-1"
            >
              <span>GitHub</span>
              <ExternalLink className="size-3" />
            </a>
            <Link href="/login" className="hover:text-fg transition">
              Zentraler Login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
