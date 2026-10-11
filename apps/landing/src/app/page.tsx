'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ArrowRight,
  Plus,
  LogIn,
  Flame,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';
import type { RegisterDepartmentInput } from '@schichtplan/shared';
import { CeviLogo } from '@/components/CeviLogo';
import { Button, buttonClasses, Dialog, Input } from '@schichtplan/ui';
import { Campfire3DCanvas } from '@/components/Campfire3DCanvas';
import { Card3DTilt } from '@/components/Card3DTilt';
import { Hero3DStage } from '@/components/Hero3DStage';
import { CeviDbIsometricGraphic } from '@/components/CeviDbIsometricGraphic';
import { SubdomainIsometricGraphic } from '@/components/SubdomainIsometricGraphic';
import { MultiEventIsometricGraphic } from '@/components/MultiEventIsometricGraphic';
import { MobilePwaIsometricGraphic } from '@/components/MobilePwaIsometricGraphic';
import { CampsiteNightGraphic } from '@/components/CampsiteNightGraphic';

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

        {/* Section 4: Abteilungen im Überblick (Directory & Live Search) */}
        <section id="abteilungen" className="py-20 md:py-28 bg-canvas relative">
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
                  const href = typeof window !== 'undefined' && window.location.hostname.includes('localhost')
                    ? `http://${dept.slug}.localhost:3000`
                    : `https://${dept.slug}.cevi-schichtplan.ch`;

                  return (
                    <Card3DTilt key={dept.id} maxTilt={4} glare={false}>
                      <a
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
                    </Card3DTilt>
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
