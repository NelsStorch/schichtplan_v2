'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LogIn,
  Flame,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  LifeBuoy,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
  Heart,
  Users,
} from 'lucide-react';
import {
  getLoginUrl,
  getLandingUrl,
  getDepartmentUrl,
  helpUrl,
  statusUrl,
  type UserDto,
} from '@schichtplan/shared';
import { CeviLogo } from '@/components/CeviLogo';
import { Avatar, Button, ThemeToggle, buttonClasses } from '@schichtplan/ui';
import { Campfire3DCanvas } from '@/components/Campfire3DCanvas';
import { Hero3DStage } from '@/components/Hero3DStage';
import { ComparisonTable } from '@/components/ComparisonTable';
import { Reveal } from '@/components/Reveal';
import { StepsTimeline } from '@/components/StepsTimeline';
import { CeviDbIsometricGraphic } from '@/components/CeviDbIsometricGraphic';
import { SubdomainIsometricGraphic } from '@/components/SubdomainIsometricGraphic';
import { MultiEventIsometricGraphic } from '@/components/MultiEventIsometricGraphic';
import { MobilePwaIsometricGraphic } from '@/components/MobilePwaIsometricGraphic';

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
      {/* 3D Atmospheric Canvas (Interactive Rising Campfire Embers) */}
      <Campfire3DCanvas />

      {/* Campfire Warmth Atmosphere Glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[640px] bg-campfire opacity-95 -z-10" />

      {/* Floating Glass Header */}
      <header className="sticky top-3 sm:top-4 z-header mx-auto w-full max-w-6xl px-3 sm:px-4">
        <div className="flex h-14 sm:h-16 items-center justify-between rounded-full border border-line/80 bg-surface/85 px-3.5 sm:px-6 backdrop-blur-xl shadow-soft">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group min-w-0">
            <CeviLogo className="size-8 sm:size-9 shrink-0 transition-transform duration-200 group-hover:scale-105" />
            <div className="flex flex-col min-w-0">
              <span className="font-display text-sm sm:text-base font-extrabold tracking-tight text-fg truncate">
                Cevi Schichtplan
              </span>
              <span className="hidden text-[11px] font-medium text-fg-subtle sm:block">
                Helfereinsätze einfach planen
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <ThemeToggle className="size-8 sm:size-9" />

            <a
              href={helpUrl()}
              className={buttonClasses({
                variant: 'ghost',
                size: 'sm',
                className: 'hidden gap-1.5 text-xs font-semibold sm:inline-flex',
              })}
            >
              <LifeBuoy className="size-3.5 text-fg-muted" />
              <span>Hilfe</span>
            </a>

            {me ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {me.homeDepartment && (
                  <a
                    href={getDepartmentUrl(me.homeDepartment.slug)}
                    className={buttonClasses({
                      variant: 'secondary',
                      size: 'sm',
                      className: 'hidden sm:inline-flex text-xs font-semibold gap-1.5 px-3',
                    })}
                  >
                    <span>{me.homeDepartment.name}</span>
                    <ArrowRight className="size-3 text-fg-subtle" />
                  </a>
                )}
                <Link
                  href="/profil"
                  className="flex items-center gap-1.5 sm:gap-2 rounded-full py-1 pl-1 pr-2.5 sm:pr-3 text-xs font-semibold text-fg transition hover:bg-surface-2"
                  aria-label="Dein Profil und Schichten"
                >
                  <Avatar name={me.ceviName || me.firstName} size="sm" highlight className="size-7 text-[10px]" />
                  <span className="max-w-20 sm:max-w-28 truncate">{me.ceviName || me.firstName}</span>
                </Link>
              </div>
            ) : (
              <Link
                href="/login"
                className={buttonClasses({
                  variant: 'primary',
                  size: 'sm',
                  className: 'gap-1.5 text-xs font-semibold px-3 sm:px-4',
                })}
              >
                <LogIn className="size-3.5" />
                <span>Anmelden</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              {/* Left Column: Value Proposition */}
              <div className="lg:col-span-7 flex flex-col items-start text-left">
                <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-2xs font-bold uppercase tracking-[0.16em] bg-accent/12 text-accent-ink border border-accent/25 mb-6 shadow-sm">
                  <Flame className="size-3 text-accent animate-pulse" />
                  <span>Cevi Schichtplan • Helferplanung für Chilbi, Lager &amp; Vereine</span>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-fg leading-[1.08] text-balance">
                  Genug Helfer*innen für jede Schicht.{' '}
                  <span className="bg-gradient-to-r from-accent via-rose-500 to-amber-500 bg-clip-text text-transparent">
                    Ohne Excel- und WhatsApp-Chaos.
                  </span>
                </h1>

                <p className="mt-5 text-base sm:text-lg text-fg-muted max-w-[54ch] leading-relaxed">
                  Schichten online erfassen, Direktlink teilen und Helfer*innen tragen sich in Sekunden selbst ein.
                  Das OK sieht jederzeit live alle Einteilungen. Die kostenlose Schweizer Lösung für Cevi-Abteilungen,
                  Pfadi, Jubla und Vereine – mit Cevi.DB-Login und ohne mühsame Excel-Tabellen.
                </p>

                {/* CTAs */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  {me ? (
                    me.homeDepartment ? (
                      <a
                        href={getDepartmentUrl(me.homeDepartment.slug)}
                        className={buttonClasses({
                          variant: 'primary',
                          size: 'md',
                          className: 'justify-center text-sm font-semibold h-12 px-6 gap-2 shadow-glow',
                        })}
                      >
                        <span>Zu deiner Abteilung ({me.homeDepartment.name})</span>
                        <ArrowRight className="size-4" />
                      </a>
                    ) : (
                      <Link
                        href="/profil"
                        className={buttonClasses({
                          variant: 'primary',
                          size: 'md',
                          className: 'justify-center text-sm font-semibold h-12 px-6 gap-2 shadow-glow',
                        })}
                      >
                        <span>Zu deinen Schichten ({me.ceviName || me.firstName})</span>
                        <ArrowRight className="size-4" />
                      </Link>
                    )
                  ) : (
                    <Link
                      href="/login"
                      className={buttonClasses({
                        variant: 'primary',
                        size: 'md',
                        className: 'justify-center text-sm font-semibold h-12 px-6 gap-2 shadow-glow',
                      })}
                    >
                      <LogIn className="size-4" />
                      <span>Schichtplan öffnen / Anmelden</span>
                    </Link>
                  )}

                  <a
                    href="#so-funktionierts"
                    className={buttonClasses({
                      variant: 'secondary',
                      size: 'md',
                      className: 'justify-center text-sm font-semibold h-12 gap-1.5',
                    })}
                  >
                    <span>So funktioniert's</span>
                    <ChevronDown className="size-4 text-fg-subtle" />
                  </a>
                </div>

                {/* Security & Access Guidance */}
                <div className="mt-6 pt-4 border-t border-line/60 w-full max-w-xl space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-fg-muted leading-relaxed">
                    <ShieldCheck className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-fg font-semibold">Schichtpläne sind geschützt:</strong> Um Helferdaten
                      vor unbefugten Zugriffen zu schützen, sind Schichtpläne nicht öffentlich aufgelistet. Den Link zu deinem Anlass
                      erhältst du direkt von deinem Leitungsteam per Mail oder WhatsApp.
                    </span>
                  </div>
                  <div className="text-fg-subtle pt-1">
                    Du leitest eine Cevi-Abteilung?{' '}
                    <button
                      type="button"
                      onClick={goCreateDepartment}
                      className="font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
                    >
                      Schichtplan für deine Abteilung einrichten <ArrowRight className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Proof Points Strip */}
                <div className="mt-8 pt-6 border-t border-line/60 w-full grid grid-cols-3 gap-2 sm:gap-4 text-left">
                  <div>
                    <div className="font-display text-lg sm:text-xl md:text-2xl font-extrabold text-fg tabular">
                      1 Link
                    </div>
                    <div className="text-[11px] sm:text-xs text-fg-subtle mt-0.5 leading-snug">
                      für alle Helfer*innen
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-lg sm:text-xl md:text-2xl font-extrabold text-fg">
                      Handy
                    </div>
                    <div className="text-[11px] sm:text-xs text-fg-subtle mt-0.5 leading-snug">
                      ohne App-Installation
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-lg sm:text-xl md:text-2xl font-extrabold text-fg tabular">
                      0 CHF
                    </div>
                    <div className="text-[11px] sm:text-xs text-fg-subtle mt-0.5 leading-snug">
                      für alle Cevi-Abteilungen
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Interactive Shift Stage */}
              <div className="lg:col-span-5">
                <Hero3DStage />
              </div>
            </div>
          </div>
        </section>

        {/* So funktioniert's: drei Schritte aus Sicht des OK */}
        <section id="so-funktionierts" className="scroll-mt-24 py-16 md:py-20 border-t border-line/60 relative">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                In drei Schritten zum vollen Schichtplan.
              </h2>
            </Reveal>
            <StepsTimeline />
          </div>
        </section>

        {/* Comparison Table: Cevi Schichtplan vs. Excel vs. WhatsApp */}
        <ComparisonTable />

        {/* Section 3: Zielgruppen & Was es euch bringt */}
        <section className="py-20 md:py-28 border-t border-line/60 bg-surface/30 relative">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="max-w-2xl mb-12 sm:mb-16">
              <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-2xs font-bold uppercase tracking-[0.16em] bg-surface-2 border border-line text-fg-subtle mb-3">
                <Sparkles className="size-3 text-accent" />
                Was es euch bringt
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                Gebaut für den Cevi-Alltag.
              </h2>
              <p className="mt-3 text-base text-fg-muted leading-relaxed">
                Ob du am Grill stehst, den Anlass organisierst oder die ganze Abteilung leitest – der Schichtplan
                nimmt euch die mühsame Organisation ab.
              </p>
            </Reveal>

            {/* Zielgruppen-Gliederung */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              <Reveal className="rounded-2xl border border-line bg-surface/70 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
                  <Heart className="size-3.5" />
                  <span>Für Helfer*innen</span>
                </div>
                <h3 className="font-display text-base font-bold text-fg mt-2">
                  In 10 Sekunden eingetragen
                </h3>
                <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                  Schicht direkt im Chat-Browser auswählen. Kein neues Passwort nötig und automatische Kalender-Erinnerung vor dem Einsatz.
                </p>
              </Reveal>

              <Reveal delay={100} className="rounded-2xl border border-line bg-surface/70 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-500">
                  <Users className="size-3.5" />
                  <span>Für das Anlass-OK</span>
                </div>
                <h3 className="font-display text-base font-bold text-fg mt-2">
                  Immer wissen, wer noch fehlt
                </h3>
                <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                  Live-Übersicht über alle Schichten, automatische Altersprüfung (z.&nbsp;B. Bar ab 18) und Vorlagen vom Vorjahr mit einem Klick.
                </p>
              </Reveal>

              <Reveal delay={200} className="rounded-2xl border border-line bg-surface/70 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-500">
                  <ShieldCheck className="size-3.5" />
                  <span>Für die Abteilungsleitung</span>
                </div>
                <h3 className="font-display text-base font-bold text-fg mt-2">
                  Eigene Adresse, Cevi.DB synchron
                </h3>
                <p className="mt-1.5 text-xs text-fg-muted leading-relaxed">
                  Feste Subdomain mit Logo und Farbe eurer Abteilung. Leitungsrechte werden direkt aus der Cevi.DB übernommen.
                </p>
              </Reveal>
            </div>

            {/* Asymmetrical Feature Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
              {/* Tile 1: Cevi.DB Single Sign-On (Large 7-cols) */}
              <Reveal className="md:col-span-7">
                <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                      Anmelden ohne neues Passwort
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[50ch]">
                      Leitende melden sich mit ihrem gewohnten Cevi.DB-Konto an – Name, Abteilung und Stufen sind sofort da.
                      Eltern, Ehemalige und Helfer*innen tragen sich einfach mit Cevi-Namen und Geburtsdatum ein.
                    </p>
                  </div>

                  {/* Clean Visual */}
                  <div className="my-5">
                    <CeviDbIsometricGraphic />
                  </div>

                  <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                    <span className="text-2xs text-emerald-500 font-semibold flex items-center gap-1.5 shrink-0">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      Mit Cevi.DB oder Cevi-Name
                    </span>
                    <span className="text-2xs text-fg-subtle">Einmal anmelden, auf allen Abteilungsseiten drin</span>
                  </div>
                </div>
              </Reveal>

              {/* Tile 2: Eigene Subdomain (5-cols) */}
              <Reveal delay={100} className="md:col-span-5">
                <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                      Eure eigene Adresse
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                      Eure Abteilung bekommt eine feste Webadresse mit Logo und Farbe. Einmal teilen, alle
                      Anlässe sind dort zu finden, Jahr für Jahr.
                    </p>
                  </div>

                  {/* Clean Visual */}
                  <div className="my-5">
                    <SubdomainIsometricGraphic />
                  </div>

                  <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
                    <span className="font-mono text-accent font-bold break-all sm:break-normal text-2xs sm:text-xs">
                      eure-abteilung.cevi-schichtplan.ch
                    </span>
                  </div>
                </div>
              </Reveal>

              {/* Tile 3: Multi-Event Unterstützung (5-cols) */}
              <Reveal className="md:col-span-5">
                <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                      Alle Anlässe an einem Ort
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                      Chilbi, PfiLa, Sommerlager oder Jubiläum gleichzeitig planen. Jedes OK hat Zugriff auf seinen Anlass,
                      und fürs nächste Jahr startet ihr mit der Vorlage von heute.
                    </p>
                  </div>

                  {/* Bespoke Architecture Graphic (Festzelt, Campfire, Jurte) */}
                  <div className="my-5">
                    <MultiEventIsometricGraphic className="max-h-[190px] sm:max-h-[200px]" />
                  </div>

                  <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                    <span className="font-semibold text-fg text-2xs sm:text-xs">Beliebig viele Anlässe</span>
                    <span className="text-2xs text-fg-subtle">Jedes OK sieht seinen Bereich</span>
                  </div>
                </div>
              </Reveal>

              {/* Tile 4: Mobil optimiert & PWA (7-cols) */}
              <Reveal delay={100} className="md:col-span-7">
                <div className="h-full rounded-card border border-line/80 bg-surface p-6 sm:p-8 shadow-soft hover:shadow-lift hover:border-line-strong transition-all duration-200 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-fg">
                      Gemacht fürs Handy
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[50ch]">
                      Eintragen dauert wenige Sekunden, direkt aus dem Chat heraus. Und das OK teilt auch am
                      Festzelt oder am Grill noch schnell jemanden ein. Auf iPhone und Android, ohne Installation.
                    </p>
                  </div>

                  {/* Smartphone Graphic */}
                  <div className="my-5">
                    <MobilePwaIsometricGraphic className="max-h-[200px] sm:max-h-[220px]" />
                  </div>

                  <div className="pt-4 border-t border-line/80 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                    <span className="flex items-center gap-1.5 sm:gap-2 text-emerald-500 font-semibold text-2xs sm:text-xs">
                      <CheckCircle2 className="size-3.5 sm:size-4 shrink-0" />
                      Mindestalter wird automatisch geprüft
                    </span>
                    <span className="text-2xs text-fg-subtle">z. B. Barbetrieb ab 18</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Strong Final Conversion & Help Section before Footer */}
        <section className="py-16 md:py-24 border-t border-line/60">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="rounded-card border border-line bg-surface/90 p-8 sm:p-12 shadow-soft relative overflow-hidden">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-wider bg-accent/12 text-accent-ink border border-accent/25 mb-4">
                  <Flame className="size-3 text-accent" />
                  <span>Bereit für den nächsten Anlass?</span>
                </div>
                <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-fg">
                  Schluss mit Excel-Chaos und unbesetzten Schichten.
                </h2>
                <p className="mt-3 text-sm sm:text-base text-fg-muted leading-relaxed">
                  Egal ob Chilbi, Sommerlager oder Jubiläum: Startet jetzt mit dem Cevi Schichtplan.
                  Fragen zur Bedienung oder Einrichtung beantwortet das Hilfe-Center Schritt für Schritt.
                </p>

                {/* Dynamic Bottom Button: Shows home department if present, or profile, or login if not */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {me ? (
                    me.homeDepartment ? (
                      <a
                        href={getDepartmentUrl(me.homeDepartment.slug)}
                        className={buttonClasses({
                          variant: 'primary',
                          size: 'md',
                          className: 'h-12 justify-center font-semibold text-sm px-6 gap-2 shadow-glow',
                        })}
                      >
                        <span>Zu deiner Abteilung ({me.homeDepartment.name})</span>
                        <ArrowRight className="size-4" />
                      </a>
                    ) : (
                      <Link
                        href="/profil"
                        className={buttonClasses({
                          variant: 'primary',
                          size: 'md',
                          className: 'h-12 justify-center font-semibold text-sm px-6 gap-2 shadow-glow',
                        })}
                      >
                        <span>Zu deinen Schichten ({me.ceviName || me.firstName})</span>
                        <ArrowRight className="size-4" />
                      </Link>
                    )
                  ) : (
                    <Link
                      href="/login"
                      className={buttonClasses({
                        variant: 'primary',
                        size: 'md',
                        className: 'h-12 justify-center font-semibold text-sm px-6 gap-2 shadow-glow',
                      })}
                    >
                      <LogIn className="size-4" />
                      <span>Jetzt anmelden</span>
                    </Link>
                  )}

                  <a
                    href={helpUrl()}
                    className={buttonClasses({
                      variant: 'secondary',
                      size: 'md',
                      className: 'h-12 justify-center font-semibold text-sm px-6 gap-2',
                    })}
                  >
                    <LifeBuoy className="size-4" />
                    <span>Zum Hilfe-Center</span>
                    <ExternalLink className="size-3.5 text-fg-subtle" />
                  </a>
                </div>

                <p className="mt-4 text-xs text-fg-subtle">
                  Ein ehrenamtliches Projekt · Kostenlos für alle Abteilungen des Cevi Schweiz.
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line/60 bg-surface/50 py-10 text-xs text-fg-subtle relative z-10">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <CeviLogo className="size-7 shrink-0" />
            <span>
              © {new Date().getFullYear()} Cevi Schichtplan · Ein ehrenamtliches Projekt für Cevi-Abteilungen
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 sm:gap-5">
            <a href={helpUrl()} className="hover:text-fg transition">
              Hilfe
            </a>
            <a href={statusUrl()} className="hover:text-fg transition">
              Status
            </a>
            <Link href="/datenschutz" className="hover:text-fg transition">
              Datenschutz
            </Link>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fg transition font-mono text-[11px]"
              title="Kontextdatei für KI-Agenten & Sprachmodelle"
            >
              llms.txt
            </a>
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
