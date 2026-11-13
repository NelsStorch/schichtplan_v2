'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  CalendarSync,
  Check,
  ChevronRight,
  Copy,
  Database,
  KeyRound,
  LayoutGrid,
  LogOut,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  PLACEHOLDER_LAST_NAME,
  STUFE_ROLES,
  SWISS_LOCALE,
  SWISS_TIMEZONE,
  formatZurichTimeRange,
  getDepartmentSetupUrl,
  getDepartmentUrl,
  isPlaceholderEmail,
  type OrganizationType,
  type UserDto,
} from '@schichtplan/shared';
import { Avatar } from './Display';
import { Badge } from './Badge';
import { Button, buttonClasses } from './Button';
import { Callout, useConfirm, useToast } from './Feedback';
import { Field, Input } from './Field';
import { NotificationSettings } from './NotificationSettings';
import { PasswordSettings } from './PasswordSettings';
import { TwoFactorSettings } from './TwoFactorSettings';
import { useOrganization } from './OrganizationContext';
import { cn } from '../utils/cn';

export const PROFILE_TABS = ['uebersicht', 'angaben', 'benachrichtigungen', 'sicherheit'] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

/** `short` passt auf dem Handy in vier gleich breite Tabs */
const TAB_META: Record<ProfileTab, { label: string; short: string; icon: typeof Bell }> = {
  uebersicht: { label: 'Übersicht', short: 'Übersicht', icon: LayoutGrid },
  angaben: { label: 'Angaben', short: 'Angaben', icon: UserRound },
  benachrichtigungen: { label: 'Benachrichtigungen', short: 'Mitteilungen', icon: Bell },
  sicherheit: { label: 'Sicherheit', short: 'Sicherheit', icon: KeyRound },
};

/** Ausschnitt aus GET /api/shifts/my (Schichten über alle Abteilungen) */
interface ProfileShift {
  signupId: string;
  title: string | null;
  taskTitle?: string | null;
  startTime: string;
  endTime: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  departmentOrganization?: OrganizationType;
  isResponsible?: boolean;
  responsibleRole?: string | null;
}

interface CalendarTokenData {
  token: string;
  webcalUrl: string;
  httpsUrl: string;
}

const dayFmt = new Intl.DateTimeFormat(SWISS_LOCALE, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: SWISS_TIMEZONE,
});

const SHIFT_PREVIEW = 3;

function readTabFromUrl(): ProfileTab {
  if (typeof window === 'undefined') return 'uebersicht';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return (PROFILE_TABS as readonly string[]).includes(tab ?? '') ? (tab as ProfileTab) : 'uebersicht';
}

export interface ProfileViewProps {
  user: UserDto;
  onUserChange: (user: UserDto) => void;
  /**
   * Slug der Abteilung, auf deren Subdomain die Seite läuft. Ohne Angabe läuft die Seite auf der
   * Startseite (Landing); dann verlinken wir in die Abteilungs-App der Heimabteilung.
   */
  currentDepartmentSlug?: string;
  /** Abmelden; ohne Angabe meldet die Komponente selbst ab und geht zur Startseite */
  onLogout?: () => void | Promise<void>;
}

/**
 * Gemeinsame Profilseite für die Startseite (cevi-schichtplan.ch/profil) und die Abteilungs-Apps
 * (<abteilung>.cevi-schichtplan.ch/profil). Inhalt in vier Tabs, der aktive Tab steht in `?tab=`.
 */
export function ProfileView({ user, onUserChange, currentDepartmentSlug, onLogout }: ProfileViewProps) {
  const org = useOrganization();
  const [tab, setTab] = useState<ProfileTab>('uebersicht');

  useEffect(() => {
    setTab(readTabFromUrl());
    const onPop = () => setTab(readTabFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const selectTab = (next: ProfileTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'uebersicht') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  const logout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  };

  const name = user.nickname || user.ceviName || user.firstName;
  const fullName = [user.firstName, user.lastName === PLACEHOLDER_LAST_NAME ? '' : user.lastName].join(' ').trim();
  const hasRealEmail = Boolean(user.email && !isPlaceholderEmail(user.email));

  const home = user.homeDepartment;
  const onHomeDepartment = Boolean(home && currentDepartmentSlug && home.slug === currentDepartmentSlug);
  /** Abteilungs-App, in der Push auch auf dem iPhone geht (installierbar) */
  const appUrl =
    !currentDepartmentSlug && home ? getDepartmentUrl(home.slug, '/profil?tab=benachrichtigungen', home.organization) : undefined;

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
        <Avatar name={name} size="lg" highlight />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-extrabold tracking-tight">{name}</h1>
          <p className="truncate text-sm text-fg-muted">
            {[fullName !== name ? fullName : '', home?.name ?? ''].filter(Boolean).join(' · ')}
          </p>
          {user.hasCeviDb && (
            <Badge size="sm" className="mt-2">
              <Database className="size-3" /> {org.authProviderShort || 'Verband'}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Abmelden" className="shrink-0">
          <LogOut /> <span className="hidden sm:inline">Abmelden</span>
        </Button>
      </section>

      <div
        aria-label="Profilbereiche"
        role="tablist"
        className="grid grid-cols-4 gap-1 rounded-card border border-line bg-surface p-1 sm:flex sm:rounded-full"
      >
        {PROFILE_TABS.map((key) => {
          const { label, short, icon: Icon } = TAB_META[key];
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`profil-tab-${key}`}
              aria-selected={active}
              aria-controls={`profil-panel-${key}`}
              onClick={() => selectTab(key)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-field px-1 py-2 text-[11px] font-semibold transition',
                'sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3.5 sm:text-sm',
                active ? 'bg-accent/15 text-accent-ink' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="max-w-full truncate sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`profil-panel-${tab}`} aria-labelledby={`profil-tab-${tab}`} className="space-y-5">
        {tab === 'uebersicht' && (
          <OverviewTab
            user={user}
            currentDepartmentSlug={currentDepartmentSlug}
            onHomeDepartment={onHomeDepartment}
            hasRealEmail={hasRealEmail}
            onSelectTab={selectTab}
          />
        )}
        {tab === 'angaben' && <DetailsTab user={user} onUserChange={onUserChange} />}
        {tab === 'benachrichtigungen' && (
          <NotificationSettings user={user} onUserChange={onUserChange} appUrl={appUrl} />
        )}
        {tab === 'sicherheit' && <SecurityTab user={user} onUserChange={onUserChange} />}
      </div>
    </div>
  );
}

function ProfileCard({
  title,
  icon: Icon,
  action,
  description,
  children,
  className,
}: {
  title: ReactNode;
  icon?: typeof Bell;
  action?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-fg">
            {Icon && <Icon className="size-4 text-accent-ink" aria-hidden />}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/* ---------------------------------- Übersicht ---------------------------------- */

function OverviewTab({
  user,
  currentDepartmentSlug,
  onHomeDepartment,
  hasRealEmail,
  onSelectTab,
}: {
  user: UserDto;
  currentDepartmentSlug?: string;
  onHomeDepartment: boolean;
  hasRealEmail: boolean;
  onSelectTab: (tab: ProfileTab) => void;
}) {
  const org = useOrganization();
  const toast = useToast();
  const [shifts, setShifts] = useState<ProfileShift[] | null>(null);
  const [calData, setCalData] = useState<CalendarTokenData | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/shifts/my', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProfileShift[]) => !cancelled && setShifts(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setShifts([]));
    fetch('/api/calendar/token', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && data && setCalData(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const home = user.homeDepartment;
  const upcoming = (shifts ?? [])
    .filter((s) => new Date(s.endTime).getTime() > Date.now())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const allShiftsHref = currentDepartmentSlug
    ? '/meine-schichten'
    : home
      ? getDepartmentUrl(home.slug, '/meine-schichten', home.organization)
      : undefined;
  const setupHref = getDepartmentSetupUrl(typeof window === 'undefined' ? undefined : window.location.href);

  const copyCalendarUrl = async () => {
    if (!calData?.httpsUrl) return;
    try {
      await navigator.clipboard.writeText(calData.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: 'Abo-Link kopiert', description: 'Füge den Link in deiner Kalender-App ein.' });
    } catch {
      toast({ title: 'Kopieren fehlgeschlagen', description: 'Kopiere den Link von Hand.', tone: 'error' });
    }
  };

  /** Offene Punkte, die das Profil vervollständigen */
  const todos: { key: string; text: string; tab?: ProfileTab; href?: string }[] = [];
  if (user.needsDepartmentSetup) {
    todos.push({ key: 'dept', text: `${org.unitTerm} angeben`, href: setupHref });
  }
  if (!hasRealEmail) {
    todos.push({ key: 'email', text: 'E-Mail-Adresse eintragen', tab: 'angaben' });
  } else if (!user.emailVerified) {
    todos.push({ key: 'verify', text: 'E-Mail-Adresse bestätigen', tab: 'angaben' });
  }
  if ((user.pushSubscriptionCount ?? 0) === 0) {
    todos.push({ key: 'push', text: 'Push-Erinnerungen aufs Handy einschalten', tab: 'benachrichtigungen' });
  }

  return (
    <>
      <ProfileCard
        title="Deine nächsten Schichten"
        icon={CalendarDays}
        action={
          calData && (
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen((v) => !v)}
            >
              <CalendarPlus /> Kalender abonnieren
            </Button>
          )
        }
      >
        {calData && calendarOpen && (
          <div className="mb-4 space-y-2 rounded-field border border-line bg-surface-1 p-3">
            <p className="text-xs text-fg-muted">
              Deine Schichten erscheinen automatisch in deinem Kalender und bleiben aktuell.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calData.webcalUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <CalendarPlus /> Google Kalender
              </a>
              <a href={calData.webcalUrl} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                <CalendarSync /> Apple / Outlook
              </a>
              <Button variant="ghost" size="sm" onClick={() => void copyCalendarUrl()}>
                {copied ? <Check className="text-success-ink" /> : <Copy />} Link kopieren
              </Button>
            </div>
          </div>
        )}

        {shifts === null ? (
          <div className="h-16 animate-pulse rounded-field bg-surface-2" aria-busy />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-fg-muted">Keine kommenden Schichten.</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {upcoming.slice(0, SHIFT_PREVIEW).map((s) => {
              const title = s.title || s.taskTitle || s.eventTitle;
              return (
                <li key={s.signupId}>
                  <a
                    href={getDepartmentUrl(s.departmentSlug, `/events/${s.eventSlug}`, s.departmentOrganization)}
                    className="flex items-center justify-between gap-3 py-2.5 transition hover:text-accent-ink"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {title}
                          {s.taskTitle && s.taskTitle !== title ? ` · ${s.taskTitle}` : ''}
                        </span>
                        {s.isResponsible && (
                          <Badge tone="accent" size="sm" className="shrink-0">
                            {s.responsibleRole || 'Leitung'}
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {dayFmt.format(new Date(s.startTime))}, {formatZurichTimeRange(s.startTime, s.endTime)} ·{' '}
                        {s.eventTitle}
                        {s.departmentSlug !== currentDepartmentSlug ? ` · ${s.departmentName}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {allShiftsHref && shifts !== null && (
          <a
            href={allShiftsHref}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline"
          >
            {upcoming.length > SHIFT_PREVIEW ? `Alle ${upcoming.length} Schichten ansehen` : 'Meine Schichten'}
            <ChevronRight className="size-4" />
          </a>
        )}
      </ProfileCard>

      <ProfileCard
        title={`${org.unitTerm} & Stufen`}
        icon={Building2}
        action={
          <div className="flex flex-wrap gap-2">
            {home && !onHomeDepartment && (
              <a
                href={getDepartmentUrl(home.slug, '/', home.organization)}
                className={buttonClasses({ size: 'sm', variant: 'secondary' })}
              >
                Zum Schichtplan <ArrowUpRight />
              </a>
            )}
            <a href={setupHref} className={buttonClasses({ size: 'sm', variant: 'ghost' })}>
              Ändern
            </a>
          </div>
        }
      >
        <p className="text-base font-semibold">
          {home?.name ?? (user.needsDepartmentSetup ? 'Noch nicht angegeben' : `Keine ${org.unitTerm}`)}
        </p>
        {user.stufen && user.stufen.length > 0 && (
          <p className="mt-0.5 text-sm text-fg-muted">
            {user.stufen.map((s) => `${s.name} (${STUFE_ROLES[s.role]})`).join(', ')}
          </p>
        )}
        {user.homeDepartmentFromCeviDb && (
          <p className="mt-1 text-xs text-fg-subtle">
            Aus {org.authProviderShort || 'der Verbands-DB'} übernommen.
          </p>
        )}
      </ProfileCard>

      {todos.length > 0 && (
        <ProfileCard title="Noch offen" className="border-dashed">
          <ul className="-my-1 divide-y divide-line">
            {todos.map((t) => {
              const inner = (
                <>
                  <span>{t.text}</span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                </>
              );
              const cls =
                'flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm font-medium transition hover:text-accent-ink';
              return (
                <li key={t.key}>
                  {t.href ? (
                    <a href={t.href} className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <button type="button" className={cls} onClick={() => t.tab && onSelectTab(t.tab)}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </ProfileCard>
      )}
    </>
  );
}

/* ---------------------------------- Angaben ---------------------------------- */

function DetailsTab({ user, onUserChange }: { user: UserDto; onUserChange: (user: UserDto) => void }) {
  const org = useOrganization();
  const provider = org.authProviderShort || 'der Verbands-DB';
  const hasRealEmail = Boolean(user.email && !isPlaceholderEmail(user.email));
  // Wie canChangeOwnEmail im Backend: ohne echte Adresse, oder selbst eingetragen und noch unbestätigt
  const emailEditable = !hasRealEmail || Boolean(!user.emailVerified && !user.hasPassword && !user.hasCeviDb);
  // Geburtsdatum aus Cevi.DB zählt für Altersgrenzen: nur dort änderbar
  const birthDateFromCeviDb = Boolean(user.hasCeviDb && user.birthDate);

  const [form, setForm] = useState(() => ({
    firstName: user.firstName ?? '',
    lastName: user.lastName === PLACEHOLDER_LAST_NAME ? '' : (user.lastName ?? ''),
    phone: user.phone ?? '',
    // Unbestätigte, selbst eingetragene Adresse vorausfüllen, damit sich ein Tippfehler korrigieren lässt
    email: hasRealEmail && emailEditable ? (user.email ?? '') : '',
    birthDate: user.birthDate ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const resendVerification = async () => {
    if (!user.email) return;
    setResending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Fehler beim Senden.');
      setMessage({ tone: 'success', text: data.message || 'Neuer Bestätigungslink gesendet.' });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Fehler beim Senden.' });
    } finally {
      setResending(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const payload: Record<string, string> = {};
    if (form.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.birthDate && !birthDateFromCeviDb) payload.birthDate = form.birthDate;
    if (emailEditable && form.email.trim() && form.email.trim().toLowerCase() !== user.email) {
      payload.email = form.email.trim();
    }
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Speichern hat nicht geklappt.');
      onUserChange(data as UserDto);
      setMessage({ tone: 'success', text: 'Angaben gespeichert.' });
    } catch (err) {
      setMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Speichern hat nicht geklappt.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileCard
      title="Deine Angaben"
      icon={UserRound}
      description={
        user.hasCeviDb
          ? `Manche Anlässe brauchen sie für die Eintragung. Name, E-Mail und Geburtsdatum kommen bei jedem Login aus ${provider}.`
          : 'Manche Anlässe brauchen sie für die Eintragung.'
      }
    >
      <form onSubmit={save} className="space-y-5">
        {message && <Callout tone={message.tone}>{message.text}</Callout>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vorname">
            <Input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Nachname">
            <Input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              autoComplete="family-name"
            />
          </Field>
          <Field label="Handynummer">
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              autoComplete="tel"
              placeholder="+41 79 000 00 00"
            />
          </Field>
          <Field label="Geburtsdatum" hint={birthDateFromCeviDb ? `Aus ${provider}, nur dort änderbar` : undefined}>
            <Input
              type="date"
              value={form.birthDate}
              disabled={birthDateFromCeviDb}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              autoComplete="bday"
            />
          </Field>
          {!emailEditable ? (
            <div className="sm:col-span-2">
              <div className="text-xs font-medium text-fg-subtle">E-Mail</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-fg">{user.email}</span>
                {user.emailVerified ? (
                  <Badge tone="success" size="sm">
                    <Check className="size-3" /> Bestätigt
                  </Badge>
                ) : (
                  <>
                    <Badge tone="warning" size="sm">
                      Nicht bestätigt
                    </Badge>
                    <button
                      type="button"
                      onClick={() => void resendVerification()}
                      disabled={resending}
                      className="text-xs font-medium text-accent-ink underline-offset-4 hover:underline"
                    >
                      {resending ? 'Wird gesendet …' : 'Bestätigungslink anfordern'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Field
                label="E-Mail"
                hint={
                  hasRealEmail ? 'Noch nicht bestätigt. Du kannst die Adresse korrigieren, bis du sie bestätigt hast.' : undefined
                }
              >
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </Field>
              {hasRealEmail && (
                <button
                  type="button"
                  onClick={() => void resendVerification()}
                  disabled={resending}
                  className="mt-1.5 text-xs font-medium text-accent-ink underline-offset-4 hover:underline"
                >
                  {resending ? 'Wird gesendet …' : `Bestätigungslink an ${user.email} anfordern`}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">
            Deine Adresse speichern wir nicht. Braucht ein OK sie, fragt es beim Anlass danach.
          </p>
          <Button type="submit" loading={saving} className="shrink-0">
            Speichern
          </Button>
        </div>
      </form>
    </ProfileCard>
  );
}

/* ---------------------------------- Sicherheit ---------------------------------- */

function SecurityTab({ user, onUserChange }: { user: UserDto; onUserChange: (user: UserDto) => void }) {
  const org = useOrganization();
  const confirm = useConfirm();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Konto wirklich löschen?',
      description:
        'Möchtest du dein Konto wirklich unwiderruflich löschen? Alle deine Schichteintragungen und Verknüpfungen werden dabei vollständig entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Mein Konto endgültig löschen',
      cancelLabel: 'Abbrechen',
      tone: 'danger',
      countdownSeconds: 7,
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Löschen hat nicht geklappt.');
      toast({ title: 'Konto gelöscht', tone: 'success' });
      window.location.href = '/';
    } catch (err) {
      toast({
        title: 'Fehler beim Löschen',
        description: err instanceof Error ? err.message : 'Löschen hat nicht geklappt.',
        tone: 'error',
      });
      setDeleting(false);
    }
  };

  return (
    <>
      <PasswordSettings user={user} onUserChange={onUserChange} />
      <TwoFactorSettings user={user} onUserChange={onUserChange} />
      {user.canSelfDelete && (
        <section className="rounded-card border border-danger/30 bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-danger-ink">Konto löschen</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Löscht dein Konto und alle deine Eintragungen und Verknüpfungen unwiderruflich aus dem {org.name}.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => void deleteAccount()} disabled={deleting} className="shrink-0">
              <Trash2 aria-hidden />
              {deleting ? 'Wird gelöscht …' : 'Konto löschen'}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
