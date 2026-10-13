'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Database,
  ExternalLink,
  FileJson,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CeviLogo,
  Skeleton,
  ThemeToggle,
  buttonClasses,
  cn,
} from '@schichtplan/ui';
import type { CeviDbDebugResponseDto, CeviDbRoleDto } from '@schichtplan/shared';

function calculateAge(birthDateString?: string | null): number | null {
  if (!birthDateString) return null;
  const birth = new Date(birthDateString);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return '–';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '–';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function FactRow({
  label,
  value,
  field,
  icon: Icon,
  badge,
}: {
  label: string;
  value?: React.ReactNode;
  field: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
}) {
  const isPresent = value !== null && value !== undefined && value !== '' && value !== '–';
  return (
    <div className="flex flex-col gap-1 border-b border-line/50 py-3 sm:flex-row sm:items-center sm:justify-between last:border-b-0">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        {Icon && <Icon className="size-4 shrink-0 text-fg-subtle" />}
        <span className="font-medium text-fg">{label}</span>
        <code className="text-2xs text-fg-subtle font-mono">({field})</code>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {isPresent ? (
          <span className="font-semibold text-fg break-all">{value}</span>
        ) : (
          <span className="italic text-fg-subtle">nicht vorhanden (null)</span>
        )}
        {badge && (
          <Badge tone="accent" className="text-2xs">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function CeviDbDataPage() {
  const [data, setData] = useState<CeviDbDebugResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRawJson, setShowRawJson] = useState(true);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/cevidb/debug-profile', {
        headers: { Accept: 'application/json' },
      });

      if (res.status === 401) {
        // Nicht angemeldet
        setData(null);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const resData = (await res.json()) as CeviDbDebugResponseDto;
      setData(resData);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Cevi.DB-Daten');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleCopyJson = () => {
    if (!data?.ceviDbData) return;
    navigator.clipboard.writeText(JSON.stringify(data.ceviDbData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rawJson = data?.ceviDbData || null;
  const profile = rawJson;
  const age = calculateAge(profile?.birthday);

  const roles = (profile?.roles || []) as CeviDbRoleDto[];

  // Filtered JSON view
  const filteredJsonString = useMemo(() => {
    if (!rawJson) return '';
    if (!searchQuery.trim()) {
      return JSON.stringify(rawJson, null, 2);
    }
    const q = searchQuery.toLowerCase();
    const filtered: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawJson)) {
      if (
        key.toLowerCase().includes(q) ||
        JSON.stringify(val).toLowerCase().includes(q)
      ) {
        filtered[key] = val;
      }
    }
    return JSON.stringify(filtered, null, 2);
  }, [rawJson, searchQuery]);

  return (
    <div className="grain flex min-h-[100dvh] flex-col bg-campfire bg-no-repeat">
      {/* Header */}
      <header className="sticky top-0 z-header border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className={buttonClasses({
                variant: 'ghost',
                size: 'sm',
                className: 'gap-1.5 text-xs text-fg-muted hover:text-fg',
              })}
            >
              <ArrowLeft className="size-4" />
              Zurück
            </Link>
            <span className="h-4 w-px bg-line/80" />
            <div className="flex items-center gap-2">
              <CeviLogo className="size-7" alt="" />
              <span className="font-display text-[15px] font-bold tracking-tight text-fg">
                Cevi.DB Daten-Inspektor
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {data?.user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/';
                }}
                className="text-xs text-fg-muted"
              >
                <LogOut className="size-3.5" />
                Abmelden
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 md:py-12">
        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        ) : error ? (
          <Callout tone="danger" className="my-6">
            <p className="font-medium">Fehler: {error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchProfile}
              className="mt-3"
            >
              <RefreshCw className="size-3.5" /> Erneut versuchen
            </Button>
          </Callout>
        ) : !data?.user ? (
          /* Nicht angemeldet */
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Database className="size-8" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Cevi.DB Daten einsehen
            </h1>
            <p className="mt-3 text-base text-fg-muted">
              Melde dich mit deinem Cevi.DB (Hitobito) Account an, um alle Felder, Rollen,
              Berechtigungen und Rohdaten zu sehen, die Cevi.DB über die OAuth 2.0 Schnittstelle bereitstellt.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/api/auth/cevidb/login?returnTo=/cevidb-daten"
                className={buttonClasses({
                  variant: 'primary',
                  size: 'lg',
                  className: 'w-full gap-2 sm:w-auto',
                })}
              >
                <Database className="size-4" />
                Mit Cevi.DB anmelden & Daten abrufen
              </a>
              <Link
                href="/"
                className={buttonClasses({
                  variant: 'secondary',
                  size: 'lg',
                  className: 'w-full sm:w-auto',
                })}
              >
                Zurück zur Anmeldung
              </Link>
            </div>

            <div className="mt-12 rounded-2xl border border-line/70 bg-surface-1 p-6 text-left shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
                <Sparkles className="size-4 text-accent" />
                Was liefert die Cevi.DB?
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-fg-muted">
                <li>
                  <strong className="text-fg">Scopes:</strong> <code>email name with_roles</code>
                </li>
                <li>
                  <strong className="text-fg">Basisdaten:</strong> Cevi-Name (nickname), Vorname, Nachname, E-Mail, Geburtsdatum, Geschlecht, Stammgruppe
                </li>
                <li>
                  <strong className="text-fg">Rollen & Gruppen:</strong> Alle aktiven Gruppenleitungen, Abteilungsleitungen und Verbandsrollen
                </li>
                <li>
                  <strong className="text-fg">Adresse:</strong> Strasse, PLZ, Ort, Land (falls in Cevi.DB gepflegt)
                </li>
              </ul>
            </div>
          </div>
        ) : !data.hasCeviDb || !data.ceviDbData ? (
          /* Angemeldet, aber nicht mit Cevi.DB */
          <div className="mx-auto max-w-xl text-center">
            <Callout tone="info" className="text-left">
              <p className="font-semibold text-fg">
                Aktuell angemeldet als: {data.user.ceviName || data.user.firstName} ({data.user.email || 'keine E-Mail'})
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                Dieses Konto wurde mit <strong>Passwort</strong> oder <strong>Cevi-Name Schnell-Login</strong> registriert und ist noch nicht mit Cevi.DB verknüpft. Daher liegen aktuell keine Cevi.DB Rohdaten vor.
              </p>
            </Callout>

            <div className="mt-6">
              <a
                href="/api/auth/cevidb/login?returnTo=/cevidb-daten"
                className={buttonClasses({
                  variant: 'primary',
                  size: 'lg',
                  className: 'gap-2',
                })}
              >
                <Database className="size-4" />
                Jetzt mit Cevi.DB anmelden & Daten verknüpfen
              </a>
            </div>
          </div>
        ) : (
          /* Vollständige Cevi.DB Datenanzeige */
          <div className="space-y-8 animate-fade-in">
            {/* Top Card: Profil Header */}
            <div className="flex flex-col gap-6 rounded-3xl border border-line/70 bg-surface-1 p-6 shadow-sm md:flex-row md:items-center md:justify-between md:p-8">
              <div className="flex items-center gap-4">
                <Avatar
                  name={profile?.nickname || `${profile?.first_name} ${profile?.last_name}`}
                  size="lg"
                  highlight
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                      {profile?.nickname || `${profile?.first_name} ${profile?.last_name}`}
                    </h1>
                    <Badge tone="accent" className="gap-1">
                      <ShieldCheck className="size-3" /> Cevi.DB verifiziert
                    </Badge>
                    {data.user.isGlobalAdmin && (
                      <Badge tone="accent">Globaler Admin</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    {profile?.first_name} {profile?.last_name}
                    {profile?.id && (
                      <span className="ml-2 inline-flex items-center gap-1 font-mono text-xs text-fg-subtle">
                        ID: #{profile.id}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-2xs text-fg-subtle">
                    Zuletzt synchronisiert:{' '}
                    <span className="font-medium text-fg">
                      {formatDateTime(data.user.ceviDbSyncedAt || (profile?._meta as any)?.fetchedAt)}
                    </span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyJson}
                  className="gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" /> Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" /> JSON kopieren
                    </>
                  )}
                </Button>
                <a
                  href="/api/auth/cevidb/login?returnTo=/cevidb-daten"
                  className={buttonClasses({
                    variant: 'primary',
                    size: 'sm',
                    className: 'gap-1.5',
                  })}
                >
                  <RefreshCw className="size-3.5" /> Neu von Cevi.DB abrufen
                </a>
                {profile?.id && (
                  <a
                    href={`https://db.cevi.ch/people/${profile.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClasses({
                      variant: 'ghost',
                      size: 'sm',
                      className: 'gap-1.5 text-fg-subtle hover:text-fg',
                    })}
                  >
                    In Cevi.DB öffnen <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Bento KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <User className="size-3.5 text-accent" /> Cevi-Name
                </span>
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">
                  {profile?.nickname || '–'}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Offizieller Pfadiname / Spitzname
                </p>
              </Card>

              <Card className="p-5">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <Calendar className="size-3.5 text-accent" /> Alter & Geburtstag
                </span>
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">
                  {age !== null ? `${age} Jahre` : '–'}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Geboren am {formatDate(profile?.birthday)}
                </p>
              </Card>

              <Card className="p-5">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <Users className="size-3.5 text-accent" /> Gruppen & Rollen
                </span>
                <p className="mt-2 text-2xl font-bold tracking-tight text-fg">
                  {roles.length} {roles.length === 1 ? 'Rolle' : 'Rollen'}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Stammgruppe ID: #{profile?.primary_group_id ?? '–'}
                </p>
              </Card>

              <Card className="p-5">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                  <KeyRound className="size-3.5 text-accent" /> OAuth Scope
                </span>
                <p className="mt-2 truncate font-mono text-sm font-bold text-fg">
                  {(profile?._meta as any)?.grantedScopes || 'with_roles'}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Token: {(profile?._meta as any)?.tokenType || 'Bearer'}
                </p>
              </Card>
            </div>

            {/* Detail Grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Box 1: Persönliche Angaben */}
              <div className="rounded-2xl border border-line/70 bg-surface-1 p-6 shadow-sm">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-fg">
                  <User className="size-5 text-accent" /> Persönliche Angaben
                </h2>
                <p className="mt-1 text-xs text-fg-muted">
                  Profilfelder aus dem Cevi.DB Hitobito Datensatz.
                </p>
                <div className="mt-4">
                  <FactRow
                    label="Cevi-Name"
                    field="nickname"
                    value={profile?.nickname}
                  />
                  <FactRow
                    label="Vorname"
                    field="first_name / given_name"
                    value={profile?.first_name || profile?.given_name}
                  />
                  <FactRow
                    label="Nachname"
                    field="last_name / family_name"
                    value={profile?.last_name || profile?.family_name}
                  />
                  <FactRow
                    label="E-Mail"
                    field="email"
                    icon={Mail}
                    value={profile?.email}
                  />
                  <FactRow
                    label="Geburtsdatum"
                    field="birthday"
                    icon={Calendar}
                    value={profile?.birthday ? `${formatDate(profile.birthday)} (${age} Jahre)` : null}
                    badge={age !== null && age >= 18 ? 'Volljährig (18+)' : undefined}
                  />
                  <FactRow
                    label="Geschlecht"
                    field="gender"
                    value={profile?.gender}
                  />
                  <FactRow
                    label="Primäre Gruppe ID"
                    field="primary_group_id"
                    value={profile?.primary_group_id ? `#${profile.primary_group_id}` : null}
                  />
                  <FactRow
                    label="Sprache / Locale"
                    field="language, locale"
                    value={profile?.language || profile?.locale}
                  />
                  <FactRow
                    label="Cevi.DB Person ID"
                    field="id"
                    value={profile?.id ? `#${profile.id}` : null}
                  />
                </div>
              </div>

              {/* Box 2: Kontakt & Anschrift */}
              <div className="rounded-2xl border border-line/70 bg-surface-1 p-6 shadow-sm">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-fg">
                  <MapPin className="size-5 text-accent" /> Adresse & Organisation
                </h2>
                <p className="mt-1 text-xs text-fg-muted">
                  Wohnadresse und Firma aus Cevi.DB.
                </p>
                <div className="mt-4">
                  <FactRow
                    label="Strasse / Adresse"
                    field="address"
                    value={profile?.address}
                  />
                  <FactRow
                    label="Postleitzahl"
                    field="zip_code"
                    value={profile?.zip_code}
                  />
                  <FactRow
                    label="Ort / Stadt"
                    field="town"
                    value={profile?.town}
                  />
                  <FactRow
                    label="Land"
                    field="country"
                    value={profile?.country}
                  />
                  <FactRow
                    label="Firma / Unternehmen"
                    field="company_name"
                    value={profile?.company_name}
                  />
                  <FactRow
                    label="Ist Firma"
                    field="company"
                    value={profile?.company !== undefined ? String(profile.company) : null}
                  />
                </div>

                <div className="mt-6 rounded-xl border border-line/50 bg-surface-2 p-4 text-xs text-fg-muted">
                  <p className="font-semibold text-fg">💡 Verwendung im Schichtplan:</p>
                  <p className="mt-1">
                    Cevi-Name und Name werden automatisch für Schichtanmeldungen hinterlegt. Das Geburtsdatum wird serverseitig für Schichten mit Mindestalter (z. B. Bar ab 18 Jahren) geprüft.
                  </p>
                </div>
              </div>
            </div>

            {/* Box 3: Rollen & Gruppen (roles) */}
            <div className="rounded-2xl border border-line/70 bg-surface-1 p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold text-fg">
                    <Users className="size-5 text-accent" /> Rollen & Berechtigungen in Cevi-Gruppen
                  </h2>
                  <p className="mt-1 text-xs text-fg-muted">
                    Geliefert über den OAuth-Scope <code>with_roles</code> von Hitobito.
                  </p>
                </div>
                <Badge tone="accent">
                  {roles.length} {roles.length === 1 ? 'Rolle' : 'Rollen'} gefunden
                </Badge>
              </div>

              {roles.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-line p-8 text-center text-sm text-fg-muted">
                  Keine Gruppen-Rollen zurückgegeben.
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {roles.map((role, idx) => (
                    <div
                      key={`${role.group_id}-${role.role_name}-${idx}`}
                      className="flex flex-col justify-between rounded-xl border border-line/60 bg-surface-2 p-4 transition hover:border-line"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-base font-bold text-fg">
                            {role.group_name || `Gruppe #${role.group_id}`}
                          </h3>
                          <Badge tone="accent" className="shrink-0 text-2xs">
                            ID #{role.group_id}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-accent">
                          {role.role_name}
                        </p>
                        {(role.role_class || role.role) && (
                          <p className="mt-0.5 font-mono text-2xs text-fg-subtle">
                            {role.role_class || role.role}
                          </p>
                        )}
                      </div>

                      {role.permissions && role.permissions.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-line/40">
                          <p className="text-2xs font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                            Berechtigungen:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {role.permissions.map((perm) => (
                              <span
                                key={perm}
                                className="inline-flex items-center rounded-md bg-surface-3 px-2 py-0.5 font-mono text-2xs text-fg-muted"
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Box 4: Vollständige Rohdaten (JSON-Viewer) */}
            <div className="rounded-2xl border border-line/70 bg-surface-1 p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold text-fg">
                    <FileJson className="size-5 text-accent" /> Vollständige Rohdaten (Raw JSON)
                  </h2>
                  <p className="mt-1 text-xs text-fg-muted">
                    Exakte JSON-Antwort von <code>/oauth/profile</code> und <code>/oauth/userinfo</code>.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyJson}
                    className="gap-1.5"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" /> Kopiert!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" /> Kopieren
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="gap-1 text-xs"
                  >
                    {showRawJson ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    {showRawJson ? 'Einklappen' : 'Ausklappen'}
                  </Button>
                </div>
              </div>

              {showRawJson && (
                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                    <input
                      type="text"
                      placeholder="Im JSON suchen (z. B. email, role, id)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface-2 py-2 pl-9 pr-4 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="relative overflow-hidden rounded-xl border border-line/70 bg-[#0d1117] p-4 text-xs">
                    <pre className="max-h-[500px] overflow-auto font-mono text-[#c9d1d9] leading-relaxed select-all">
                      {filteredJsonString}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
