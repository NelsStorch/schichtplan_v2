'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ArrowRight,
  Plus,
  Check,
  ShieldCheck,
  Calendar,
  Smartphone,
  Globe,
  LogIn,
  Users,
  Flame,
  Clock,
  Sparkles,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import type { RegisterDepartmentInput } from '@schichtplan/shared';
import { CeviLogo } from '@/components/CeviLogo';
import { Button, buttonClasses, Dialog, Input } from '@schichtplan/ui';

interface DepartmentItem {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  activeEventsCount?: number;
}

export default function LandingPage() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [search, setSearch] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Interactive Live-Shift Simulator State (Right side of Hero)
  const [simEnrolled, setSimEnrolled] = useState(false);

  // Register Form State
  const [formData, setFormData] = useState<Partial<RegisterDepartmentInput>>({
    departmentName: '',
    slug: '',
    adminFirstName: '',
    adminLastName: '',
    adminCeviName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [registerStatus, setRegisterStatus] = useState<{
    loading: boolean;
    error?: string;
    success?: string;
  }>({
    loading: false,
  });

  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await fetch('/api/departments');
        if (res.ok) {
          const data = await res.json();
          setDepartments(data);
        }
      } catch (err) {
        console.error('Fehler beim Laden der Abteilungen:', err);
      } finally {
        setLoadingDepts(false);
      }
    }
    loadDepts();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus({ loading: true });

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registrierung fehlgeschlagen');
      }

      setRegisterStatus({
        loading: false,
        success: `Abteilung erfolgreich erstellt! Weiterleitung zu ${data.department.slug}...`,
      });

      setTimeout(() => {
        const domain = window.location.hostname.includes('localhost')
          ? `http://${data.department.slug}.localhost:3000`
          : `https://${data.department.slug}.cevi-schichtplan.ch`;
        window.location.href = domain;
      }, 1500);
    } catch (err: any) {
      setRegisterStatus({ loading: false, error: err.message });
    }
  };

  const filteredDepartments = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-canvas text-fg selection:bg-accent selection:text-white">
      {/* Campfire Warmth Atmosphere Glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-campfire opacity-90 -z-10" />

      {/* Floating Header */}
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
            <Link
              href="/login"
              className={buttonClasses({
                variant: 'ghost',
                size: 'sm',
                className: 'hidden sm:inline-flex gap-1.5 text-xs font-semibold',
              })}
            >
              <LogIn className="size-3.5 text-fg-muted" />
              <span>Anmelden</span>
            </Link>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowRegisterModal(true)}
              className="text-xs font-semibold"
            >
              <Plus className="size-3.5" />
              <span>Abteilung anlegen</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section: Asymmetric Split (Left Content + Right Live Shift Simulator) */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
          <div className="mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
              {/* Left Column: Value Proposition */}
              <div className="lg:col-span-7 flex flex-col items-start text-left">
                <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-2xs font-bold uppercase tracking-[0.16em] bg-accent/12 text-accent-ink border border-accent/25 mb-6">
                  <Flame className="size-3 text-accent animate-pulse" />
                  <span>VEREINSORGANISATION V2</span>
                </div>

                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-fg leading-[1.08] text-balance">
                  Schichtplanung für den Cevi, so wie sie sein sollte.
                </h1>

                <p className="mt-5 text-base sm:text-lg text-fg-muted max-w-[54ch] leading-relaxed">
                  Freiwilligeneinsätze an Chilbi, PfiLa und Lagern ohne Excel-Chaos koordinieren.
                  Jede Abteilung auf ihrer eigenen Subdomain, mit Cevi.DB Login und Mobil-Ansicht.
                </p>

                {/* CTAs */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <a
                    href="#abteilungen"
                    className="group inline-flex items-center justify-between sm:justify-center gap-3 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-fg shadow-glow hover:brightness-110 active:scale-[0.98] transition"
                  >
                    <span>Abteilung finden</span>
                    <span className="flex size-7 items-center justify-center rounded-full bg-white/20 transition-transform duration-200 group-hover:translate-x-0.5">
                      <ArrowRight className="size-4" />
                    </span>
                  </a>

                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setShowRegisterModal(true)}
                    className="justify-center text-sm font-semibold h-12"
                  >
                    <span>Neue Abteilung anlegen</span>
                  </Button>
                </div>

                {/* Proof Points Strip */}
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
                      Feste Adresse pro Abteilung
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-xl sm:text-2xl font-extrabold text-fg">
                      Schweiz
                    </div>
                    <div className="text-2xs sm:text-xs text-fg-subtle mt-0.5">
                      Sicher gehostet
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: The Interactive Live Shift Simulator (Double-Bezel Architecture) */}
              <div className="lg:col-span-5">
                <div className="relative group">
                  {/* Subtle Background Glow behind Card */}
                  <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-accent/20 to-amber-500/10 blur-xl opacity-75 group-hover:opacity-100 transition duration-500 -z-10" />

                  {/* Outer Bezel (Double-Bezel Shell) */}
                  <div className="rounded-card border border-line/70 bg-surface/50 p-2 shadow-lift">
                    {/* Inner Core */}
                    <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-5 sm:p-6 shadow-inset-hi">
                      {/* Simulator Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-line">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-tile bg-accent/15 text-accent-ink font-bold text-sm">
                            IL
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-display text-sm font-bold text-fg">
                                Chilbi Illnau 2026
                              </h3>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                                LIVE
                              </span>
                            </div>
                            <p className="text-xs text-fg-subtle">
                              Festzelt, Bar & Grill • Cevi Illnau
                            </p>
                          </div>
                        </div>

                        <span className="font-mono text-2xs text-fg-subtle tabular">
                          {simEnrolled ? '24/28 belegt' : '23/28 belegt'}
                        </span>
                      </div>

                      {/* Interactive Occupancy Meter */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-fg">Gesamtbelegung</span>
                          <span className="font-mono text-accent-ink font-bold tabular">
                            {simEnrolled ? '86%' : '82%'}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden border border-line">
                          <div
                            className="h-full bg-accent transition-all duration-500 ease-out-expo rounded-full"
                            style={{ width: simEnrolled ? '86%' : '82%' }}
                          />
                        </div>
                      </div>

                      {/* Shift Rows Preview */}
                      <div className="mt-5 space-y-2.5">
                        {/* Row 1: Grill (Full) */}
                        <div className="rounded-tile border border-line bg-surface-2/60 p-3 flex items-center justify-between text-xs">
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-fg truncate">
                              Grill & Pommes
                            </div>
                            <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                              <Clock className="size-3" />
                              <span>18:00 · 21:00</span>
                              <span>•</span>
                              <span>Falk, Remo</span>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface-3 px-2.5 py-1 text-[11px] font-semibold text-fg-muted">
                            2/2 Voll
                          </span>
                        </div>

                        {/* Row 2: Barbetrieb (Interactive Slot) */}
                        <div
                          onClick={() => setSimEnrolled(!simEnrolled)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') setSimEnrolled(!simEnrolled);
                          }}
                          className={`rounded-tile border transition-all duration-200 cursor-pointer p-3 flex items-center justify-between text-xs select-none ${
                            simEnrolled
                              ? 'border-emerald-500/40 bg-emerald-500/10'
                              : 'border-accent/40 bg-accent/5 hover:bg-accent/10'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-fg flex items-center gap-1.5">
                              <span>Barbetrieb & Ausschank</span>
                              <span className="rounded bg-accent/20 text-accent-ink px-1.5 py-0.2 text-[10px] font-mono">
                                16+
                              </span>
                            </div>
                            <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                              <Clock className="size-3" />
                              <span>21:00 · 00:00</span>
                              <span>•</span>
                              <span>{simEnrolled ? 'Lukas, Sarah, Du (Gast)' : 'Lukas, Sarah'}</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {simEnrolled ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                                <Check className="size-3.5" />
                                Eingetragen!
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-fg shadow-sm hover:scale-105 active:scale-95 transition-transform">
                                <Plus className="size-3" />
                                Eintragen
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 3: Nachtwache (Urgent) */}
                        <div className="rounded-tile border border-warning/30 bg-warning/5 p-3 flex items-center justify-between text-xs">
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-fg truncate">
                              Nachtwache & Zeltaufsicht
                            </div>
                            <div className="font-mono text-2xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                              <Clock className="size-3" />
                              <span>02:00 · 06:00</span>
                              <span>•</span>
                              <span className="text-warning-ink font-semibold">Dringend gesucht!</span>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-warning/20 px-2.5 py-1 text-[11px] font-bold text-warning-ink">
                            0/2 Plätze
                          </span>
                        </div>
                      </div>

                      {/* Simulator Footer Hint */}
                      <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-2xs text-fg-subtle">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="size-3 text-accent" />
                          Tippe auf die Bar-Schicht zum Ausprobieren
                        </span>
                        <span className="font-mono">Live Demo</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Bento Grid (Asymmetric Rhythm & Texture Diversity) */}
        <section className="py-20 md:py-28 border-t border-line/60 bg-surface/30">
          <div className="mx-auto max-w-6xl px-4">
            <div className="max-w-2xl mb-12 sm:mb-16">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                Gebaut für den Cevi-Alltag.
              </h2>
              <p className="mt-3 text-base text-fg-muted leading-relaxed">
                Alles was Leiterteams und Helfer für entspannte Events brauchen.
                Keine verschollenen Listen, keine doppelt eingetragenen Schichten.
              </p>
            </div>

            {/* Asymmetrical Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Tile 1: Cevi.DB Single Sign-On (Large 7-cols) */}
              <div className="md:col-span-7 rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft">
                <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex size-11 items-center justify-center rounded-tile bg-emerald-500/12 text-emerald-400 mb-5">
                      <ShieldCheck className="size-6" />
                    </div>
                    <h3 className="font-display text-xl font-bold text-fg">
                      Cevi.DB Single Sign-On
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[48ch]">
                      Kein neues Passwort merken: Helfer und Leitende melden sich direkt mit ihrem bestehenden
                      Cevi.DB Konto (Hitobito) an. Cevi-Name, Stammdaten und Abteilungszugehörigkeit werden
                      automatisch übernommen.
                    </p>
                  </div>

                  {/* UI Illustration inside Card */}
                  <div className="mt-6 pt-5 border-t border-line/80 flex items-center justify-between rounded-tile bg-surface-2 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg font-bold text-xs">
                        INF
                      </div>
                      <div>
                        <div className="text-xs font-bold text-fg">Nels Storch v/o Inferno</div>
                        <div className="text-2xs text-fg-subtle">Cevi Illnau-Effretikon · Abteilungsleitung</div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-2xs font-semibold text-emerald-400">
                      <Check className="size-3" /> Verifiziert
                    </span>
                  </div>
                </div>
              </div>

              {/* Tile 2: Eigene Subdomain (5-cols) */}
              <div className="md:col-span-5 rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft">
                <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex size-11 items-center justify-center rounded-tile bg-accent/12 text-accent-ink mb-5">
                      <Globe className="size-6" />
                    </div>
                    <h3 className="font-display text-xl font-bold text-fg">
                      Eigene Subdomain
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                      Deine Abteilung erhält eine feste Schweizer Adresse. Einmal im Flyer oder WhatsApp teilen,
                      dauerhaft gültig.
                    </p>
                  </div>

                  {/* Interactive Address Bar Mock */}
                  <div className="mt-6 rounded-tile border border-line bg-surface-2 p-3 flex items-center gap-2 font-mono text-xs">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="text-fg-subtle">https://</span>
                    <span className="text-accent-ink font-bold">uster</span>
                    <span className="text-fg-muted">.cevi-schichtplan.ch</span>
                  </div>
                </div>
              </div>

              {/* Tile 3: Multi-Event Unterstützung (5-cols) */}
              <div className="md:col-span-5 rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft">
                <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex size-11 items-center justify-center rounded-tile bg-indigo-500/12 text-indigo-400 mb-5">
                      <Calendar className="size-6" />
                    </div>
                    <h3 className="font-display text-xl font-bold text-fg">
                      Multi-Event Management
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                      Chilbi, PfiLa, Sommerlager oder Jubiläum parallel verwalten, ohne jemals eine neue Tabelle
                      oder Datenbank anzulegen.
                    </p>
                  </div>

                  {/* Tags cluster */}
                  <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-line/80">
                    <span className="rounded-full bg-surface-2 border border-line px-3 py-1 text-2xs font-semibold text-fg">
                      Chilbi 2026
                    </span>
                    <span className="rounded-full bg-surface-2 border border-line px-3 py-1 text-2xs font-semibold text-fg">
                      Sommerlager
                    </span>
                    <span className="rounded-full bg-surface-2 border border-line px-3 py-1 text-2xs font-semibold text-fg">
                      PfiLa
                    </span>
                    <span className="rounded-full bg-surface-2 border border-line px-3 py-1 text-2xs font-semibold text-fg">
                      Cevi-Tag
                    </span>
                  </div>
                </div>
              </div>

              {/* Tile 4: Mobil optimiert & PWA (7-cols) */}
              <div className="md:col-span-7 rounded-card border border-line/80 bg-surface/80 p-2 shadow-soft">
                <div className="rounded-[calc(1.5rem-0.375rem)] border border-line bg-surface p-6 sm:p-8 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex size-11 items-center justify-center rounded-tile bg-amber-500/12 text-amber-400 mb-5">
                      <Smartphone className="size-6" />
                    </div>
                    <h3 className="font-display text-xl font-bold text-fg">
                      Mobil optimiert & PWA
                    </h3>
                    <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-[48ch]">
                      Direkt am Festzelt oder am Lagerfeuer neue Helfer einteilen. Funktioniert auf iOS und Android
                      flüssig ohne Installation aus dem App Store.
                    </p>
                  </div>

                  <div className="mt-6 pt-5 border-t border-line/80 flex items-center justify-between text-xs text-fg-muted">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-400" />
                      Offline-fähig für Schlechtwetter-Einsätze
                    </span>
                    <span className="font-mono text-2xs text-fg-subtle">Kein App-Download</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Abteilungen im Überblick (Directory & Live Search) */}
        <section id="abteilungen" className="py-20 md:py-28 border-t border-line/60 bg-canvas">
          <div className="mx-auto max-w-5xl px-4">
            <div className="text-center max-w-xl mx-auto mb-10">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-fg">
                Abteilung finden
              </h2>
              <p className="mt-2 text-sm sm:text-base text-fg-muted">
                Wähle deine Cevi-Abteilung und gelange direkt zum Schichtplan deiner nächsten Anlässe.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative mb-8 max-w-xl mx-auto">
              <Search className="size-5 text-fg-subtle absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Name oder Ort suchen (z. B. Illnau, Uster, Winterthur)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-10 py-3.5 bg-surface border border-line rounded-full text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 transition shadow-soft"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-fg"
                  aria-label="Suche zurücksetzen"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Department Directory Grid */}
            {loadingDepts ? (
              <div className="text-center py-12 text-sm text-fg-subtle">
                Abteilungen werden geladen...
              </div>
            ) : filteredDepartments.length === 0 ? (
              <div className="rounded-card border border-line/80 bg-surface/50 p-8 text-center max-w-lg mx-auto">
                <p className="text-sm text-fg-muted mb-4">
                  Keine Cevi-Abteilung mit dem Suchbegriff «{search}» gefunden.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowRegisterModal(true)}
                >
                  <Plus className="size-3.5" />
                  <span>Jetzt {search ? `«${search}»` : 'neue Abteilung'} anlegen</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredDepartments.map((dept) => {
                  const href = window?.location?.hostname?.includes('localhost')
                    ? `http://${dept.slug}.localhost:3000`
                    : `https://${dept.slug}.cevi-schichtplan.ch`;

                  return (
                    <a
                      key={dept.id}
                      href={href}
                      className="group rounded-card border border-line bg-surface p-2 hover:border-line-strong transition shadow-soft flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3.5 p-3 min-w-0">
                        <div
                          className="size-11 rounded-tile flex items-center justify-center font-bold text-white text-base shadow-sm shrink-0"
                          style={{ backgroundColor: dept.primaryColor || '#e11d48' }}
                        >
                          {dept.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-display text-sm font-bold text-fg group-hover:text-accent-ink transition truncate">
                            {dept.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 font-mono text-2xs text-fg-subtle">
                            <span>{dept.slug}.cevi-schichtplan.ch</span>
                            {dept.activeEventsCount !== undefined && dept.activeEventsCount > 0 && (
                              <span className="rounded-full bg-surface-2 px-1.5 py-0.2 text-[10px] text-fg-muted font-sans">
                                {dept.activeEventsCount} {dept.activeEventsCount === 1 ? 'Event' : 'Events'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pr-4 shrink-0">
                        <span className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-fg-subtle group-hover:bg-accent group-hover:text-accent-fg group-hover:translate-x-0.5 transition-all">
                          <ArrowRight className="size-4" />
                        </span>
                      </div>
                    </a>
                  );
                })}

                {/* "Eigene Abteilung anlegen" Action Card */}
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="rounded-card border border-dashed border-line hover:border-accent/60 bg-surface/30 hover:bg-accent/5 p-5 text-left transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="size-11 rounded-tile border border-dashed border-line flex items-center justify-center text-fg-muted group-hover:border-accent group-hover:text-accent-ink transition shrink-0">
                      <Plus className="size-5" />
                    </div>
                    <div>
                      <h4 className="font-display text-sm font-bold text-fg group-hover:text-accent-ink transition">
                        Deine Abteilung fehlt?
                      </h4>
                      <p className="text-2xs text-fg-subtle mt-0.5">
                        In 2 Minuten kostenlos und unverbindlich anlegen
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-fg-subtle group-hover:translate-x-1 group-hover:text-accent transition" />
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Accessible Registration Dialog */}
      <Dialog
        open={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Neue Cevi-Abteilung registrieren"
        description="Erstelle in wenigen Schritten den Schichtplan für deine Abteilung."
        size="md"
      >
        {registerStatus.error && (
          <div className="p-3 mb-4 rounded-tile bg-danger/10 text-danger-ink text-xs border border-danger/25 flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{registerStatus.error}</span>
          </div>
        )}

        {registerStatus.success && (
          <div className="p-3 mb-4 rounded-tile bg-success/10 text-success-ink text-xs border border-success/25 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{registerStatus.success}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Name der Cevi-Abteilung
            </label>
            <Input
              type="text"
              required
              placeholder="z. B. Cevi Uster"
              value={formData.departmentName}
              onChange={(e) => {
                const name = e.target.value;
                const autoSlug = name
                  .toLowerCase()
                  .replace(/[^a-z0-9]/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-|-$/g, '');
                setFormData({ ...formData, departmentName: name, slug: autoSlug });
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Gewünschte Subdomain
            </label>
            <div className="flex items-center">
              <input
                type="text"
                required
                placeholder="uster"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({ ...formData, slug: e.target.value.toLowerCase() })
                }
                className="flex-1 h-12 px-4 rounded-l-field border border-r-0 border-line bg-surface-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent focus:bg-surface"
              />
              <span className="h-12 flex items-center px-3.5 bg-surface-3 border border-line text-xs text-fg-subtle rounded-r-field font-mono select-none">
                .cevi-schichtplan.ch
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-line">
            <h4 className="text-xs font-bold text-fg mb-3">
              Hauptverantwortliche Person (Admin)
            </h4>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Input
                type="text"
                required
                placeholder="Vorname"
                value={formData.adminFirstName}
                onChange={(e) =>
                  setFormData({ ...formData, adminFirstName: e.target.value })
                }
              />
              <Input
                type="text"
                required
                placeholder="Nachname"
                value={formData.adminLastName}
                onChange={(e) =>
                  setFormData({ ...formData, adminLastName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2.5">
              <Input
                type="text"
                placeholder="Cevi-Name (optional, z. B. Falk)"
                value={formData.adminCeviName}
                onChange={(e) =>
                  setFormData({ ...formData, adminCeviName: e.target.value })
                }
              />
              <Input
                type="email"
                required
                placeholder="E-Mail-Adresse"
                value={formData.adminEmail}
                onChange={(e) =>
                  setFormData({ ...formData, adminEmail: e.target.value })
                }
              />
              <Input
                type="password"
                required
                placeholder="Sicheres Passwort (mind. 8 Zeichen)"
                value={formData.adminPassword}
                onChange={(e) =>
                  setFormData({ ...formData, adminPassword: e.target.value })
                }
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-line">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRegisterModal(false)}
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={registerStatus.loading}
            >
              Abteilung anlegen
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-line/60 bg-surface/50 py-10 text-xs text-fg-subtle">
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
