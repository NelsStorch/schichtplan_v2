'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  LifeBuoy,
  LogIn,
  LogOut,
  Smartphone,
  Ticket,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  CeviLogo,
  Dialog,
  NotificationSettings,
  ThemeToggle,
  buttonClasses,
  cn,
  useConfirm,
  useOrganization,
  useToast,
} from '@schichtplan/ui';
import {
  departmentRoleLabel,
  getLandingUrl,
  getRootDomain,
  helpUrl,
  privacyUrl,
  statusUrl,
  type MyHoursSummaryDto,
} from '@schichtplan/shared';
import { api, useDepartmentSetupHref, useLoginHref } from '@/lib/api';
import { displayName, usePortal } from '@/lib/portal';
import { clearOfflineData, useInstallPrompt } from '@/lib/offline';
import { CommandPaletteButton } from './command';
import { OfflineBanner } from './OfflineBanner';

const NAV = [
  { href: '/', label: 'Anlässe', icon: CalendarDays, match: (p: string) => p === '/' || p.startsWith('/events') },
  { href: '/meine-schichten', label: 'Meine Schichten', icon: Ticket, match: (p: string) => p.startsWith('/meine-schichten') },
];

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  const { department, user } = usePortal();
  const org = useOrganization();
  const [accountOpen, setAccountOpen] = useState(false);
  const loginHref = useLoginHref();
  const departmentSetupHref = useDepartmentSetupHref();

  return (
    <div className="grain flex min-h-[100dvh] flex-col bg-campfire bg-no-repeat">
      <header className="sticky top-0 z-header border-b border-line/70 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-full pr-2">
            <CeviLogo className="size-9" logoUrl={department?.logoUrl} alt="" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-bold tracking-tight text-fg">
                {department?.name ?? org.name}
              </span>
              <span className="block text-2xs font-medium text-fg-subtle">Schichtplan</span>
            </span>
          </Link>

          <nav aria-label="Hauptnavigation" className="ml-6 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <CommandPaletteButton />
            {actions}
            <ThemeToggle className="hidden md:flex" />
            {user ? (
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="hidden items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 transition hover:bg-surface-2 md:flex"
                aria-label="Konto öffnen"
              >
                <Avatar name={displayName(user)} size="sm" highlight />
                <span className="max-w-32 truncate text-sm font-semibold text-fg">{displayName(user)}</span>
              </button>
            ) : (
              <a href={loginHref} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'hidden md:inline-flex' })}>
                <LogIn /> Anmelden
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Offline-Hinweis mit Stand-Zeitstempel: wird nur gerendert wenn offline */}
      <OfflineBanner />

      {user?.needsDepartmentSetup && (
        <div className="border-b border-warning/25 bg-warning/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <p className="text-fg">
              <span className="font-semibold">Zu welcher Abteilung gehörst du?</span>{' '}
              <span className="text-fg-muted">Manche Anlässe sind nur für eine Abteilung oder Stufe.</span>
            </p>
            <a href={departmentSetupHref} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
              <Building2 /> Abteilung angeben
            </a>
          </div>
        </div>
      )}

      <main className="flex-1 pb-12 md:pb-20">{children}</main>

      {/* Mobil Platz für die fixe Tab-Leiste lassen, damit Hilfe/Datenschutz erreichbar bleiben */}
      <footer className="border-t border-line/70 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-6 text-xs text-fg-subtle md:px-6">
          <p>
            © {new Date().getFullYear()} {department?.name ?? org.orgName}
          </p>
          <div className="flex items-center gap-5">
            <a href={helpUrl('/', org.domain)} className="transition hover:text-fg">
              Hilfe
            </a>
            <a href={statusUrl('/', org.domain)} className="transition hover:text-fg">
              Status
            </a>
            <a href={privacyUrl(org.domain)} className="transition hover:text-fg">
              Datenschutz
            </a>
            <a
              href={getLandingUrl('/', org.domain)}
              className="transition hover:text-fg"
            >
              {typeof window !== 'undefined' && window.location.hostname.includes('.')
                ? getRootDomain(window.location.hostname)
                : org.domain}
            </a>
          </div>
        </div>
      </footer>

      {/* Mobile Tab-Leiste: Daumen-Zone statt Hamburger-Menü */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-header border-t border-line/70 bg-canvas/85 pb-safe-b backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-2xs font-semibold transition-colors',
                  active ? 'text-fg' : 'text-fg-subtle'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-accent/14 text-accent-ink'
                  )}
                >
                  <Icon className="size-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
          {user ? (
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="flex flex-col items-center justify-center gap-1 text-2xs font-semibold text-fg-subtle"
            >
              <span className="flex h-7 w-12 items-center justify-center">
                <Avatar name={displayName(user)} size="sm" className="size-6 text-[9px]" />
              </span>
              Konto
            </button>
          ) : (
            <a href={loginHref} className="flex flex-col items-center justify-center gap-1 text-2xs font-semibold text-fg-subtle">
              <span className="flex h-7 w-12 items-center justify-center">
                <UserRound className="size-5" />
              </span>
              Anmelden
            </a>
          )}
        </div>
      </nav>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser, department, logout } = usePortal();
  const org = useOrganization();
  const departmentSetupHref = useDepartmentSetupHref();
  const confirm = useConfirm();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const { canInstall, install } = useInstallPrompt();
  const [showIosGuide, setShowIosGuide] = useState(false);

  // Helfer-Stunden-Zusammenfassung direkt und leichtgewichtig vom Backend laden
  const [stats, setStats] = useState<MyHoursSummaryDto | null>(null);
  const [loadingHours, setLoadingHours] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    setLoadingHours(true);

    api<MyHoursSummaryDto>('/api/shifts/my/summary')
      .then((data) => {
        if (active) {
          setStats(data);
          setLoadingHours(false);
        }
      })
      .catch(() => {
        if (active) setLoadingHours(false);
      });

    return () => {
      active = false;
    };
  }, [open, user]);

  if (!user) return null;
  const role =
    user.isGlobalAdmin && user.departmentRole !== 'ADMIN'
      ? 'Plattform-Admin'
      : departmentRoleLabel({
          isLeader: user.departmentRole === 'ADMIN',
          permissions: user.departmentPermissions ?? [],
          isHomeDepartment:
            user.homeDepartment?.id === department?.id ||
            Boolean(user.joinedDepartments?.some((d) => d.id === department?.id && d.counts)),
        });

  const handleDeleteAccount = async () => {
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
      toast({
        title: 'Konto gelöscht',
        description: 'Dein Konto wurde erfolgreich gelöscht.',
        tone: 'success',
      });
      await clearOfflineData();
      onClose();
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
      <Dialog open={open} onClose={onClose} size="md" title="Dein Konto">
        <div className="space-y-4">
          {/* Benutzerprofil Kopfbereich */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2 p-4 shadow-2xs">
            <div className="flex items-center gap-3.5 min-w-0">
              <Avatar name={displayName(user)} size="lg" highlight className="size-14 text-base shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="truncate font-display text-lg font-bold text-fg">
                    {displayName(user)}
                  </h3>
                  <Badge tone="accent">
                    {role}
                  </Badge>
                </div>
                <p className="truncate text-sm text-fg-muted">
                  {user.firstName} {user.lastName}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap text-xs text-fg-subtle mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="size-3 inline" />
                    {user.homeDepartment ? user.homeDepartment.name : user.needsDepartmentSetup ? 'Abteilung fehlt' : 'Keine Abteilung'}
                  </span>
                  {user.joinedDepartments?.map((d) => (
                    <span
                      key={d.id}
                      title={d.counts ? 'Zusätzlich beigetreten' : 'Beitritt noch nicht bestätigt'}
                      className={cn(
                        'rounded-full border border-line px-2 py-0.5 text-[11px] font-medium',
                        d.counts ? 'bg-surface-elevated text-fg-muted' : 'border-dashed text-fg-subtle'
                      )}
                    >
                      + {d.name}
                    </span>
                  ))}
                  {user.stufen?.map((s) => (
                    <span key={s.stufeId} className="rounded-full bg-surface-elevated border border-line px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-line/60">
              <span className="text-2xs font-semibold uppercase tracking-wider text-fg-subtle mb-1">
                Design
              </span>
              <ThemeToggle />
            </div>
          </div>

          {/* ⭐ Helfer-Stunden-Konto (Hero-Karte) */}
          <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-surface to-surface-subtle p-4 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                  <Clock className="size-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-fg flex items-center gap-1.5">
                    Dein Helfer-Stunden-Konto
                  </h4>
                  <p className="text-[11px] text-fg-subtle">
                    Über alle Anlässe &amp; Abteilungen (inkl. Schichtleitung)
                  </p>
                </div>
              </div>

              <Link
                href="/meine-schichten"
                onClick={onClose}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline shrink-0"
              >
                <span>Meine Schichten</span>
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            {loadingHours ? (
              <div className="py-6 text-center">
                <div className="inline-block size-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <p className="text-xs text-fg-subtle mt-2">Helferstunden werden berechnet…</p>
              </div>
            ) : stats && stats.shiftCount > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center rounded-xl bg-surface border border-line/60 p-3 shadow-2xs">
                  <div>
                    <div className="font-mono text-2xl font-bold text-fg">
                      {stats.totalHours} <span className="text-xs font-normal text-fg-muted">Std.</span>
                    </div>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-fg-subtle mt-0.5">
                      Gesamtzeit
                    </div>
                  </div>

                  <div className="border-x border-line/60 px-1">
                    <div className="font-mono text-2xl font-bold text-fg">
                      {stats.shiftCount}
                    </div>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-fg-subtle mt-0.5">
                      {stats.shiftCount === 1 ? 'Einsatz' : 'Einsätze'}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-2xl font-bold text-fg">
                      {stats.eventCount}
                    </div>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-fg-subtle mt-0.5">
                      {stats.eventCount === 1 ? 'Anlass' : 'Anlässe'}
                    </div>
                  </div>
                </div>

                {/* Status-Balken: Abgeschlossen vs. Geplant */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-success">
                      <CheckCircle2 className="size-3.5 inline" />
                      {stats.completedHours} Std. bereits geleistet
                    </span>
                    <span className="flex items-center gap-1.5 text-accent-ink">
                      <Clock className="size-3.5 inline" />
                      {stats.upcomingHours} Std. geplant
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line/70 flex">
                    {stats.totalHours > 0 ? (
                      <>
                        <div
                          className="h-full bg-success transition-all duration-500"
                          style={{
                            width: `${Math.round((stats.completedHours / stats.totalHours) * 100)}%`,
                          }}
                        />
                        <div
                          className="h-full bg-accent transition-all duration-500"
                          style={{
                            width: `${Math.round((stats.upcomingHours / stats.totalHours) * 100)}%`,
                          }}
                        />
                      </>
                    ) : (
                      <div className="h-full w-full bg-line" />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-surface border border-line/60 p-4 text-center">
                <p className="text-xs text-fg-muted">
                  Du hast bisher noch keine Schichten eingetragen.
                </p>
                <Link
                  href="/"
                  onClick={onClose}
                  className={buttonClasses({ size: 'sm', variant: 'secondary', className: 'mt-2 text-xs' })}
                >
                  Anlässe durchstöbern & mithelfen
                </Link>
              </div>
            )}
          </div>

          {/* Menügruppen */}
          <div className="space-y-3">
            {/* Gruppe 1: Einsätze & Abteilungen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Link href="/meine-schichten" onClick={onClose} className={buttonClasses({ variant: 'secondary', className: 'justify-start' })}>
                <Ticket className="size-4 text-accent" />
                <span>Meine Schichten</span>
              </Link>
              <a href={departmentSetupHref} className={buttonClasses({ variant: 'secondary', className: 'justify-start' })}>
                <Building2 className="size-4 text-accent" />
                <span>Abteilung &amp; Stufen</span>
              </a>
            </div>

            {/* Gruppe 2: Profil & Benachrichtigungen */}
            <div className="rounded-2xl border border-line bg-surface p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-fg-subtle">
                  Schicht-Erinnerungen
                </span>
                <Link href="/profil?tab=benachrichtigungen" onClick={onClose} className="text-xs font-semibold text-accent-ink hover:underline">
                  Profil bearbeiten
                </Link>
              </div>
              <NotificationSettings user={user} onUserChange={(u) => setUser(u)} compact />
            </div>

            {/* Gruppe 3: App-Tools & Hilfe */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {canInstall && (
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={async () => {
                    await install();
                  }}
                >
                  <Smartphone className="size-4 text-accent" /> App installieren
                </Button>
              )}
              <a href={helpUrl('/', org.domain)} className={buttonClasses({ variant: 'secondary', className: 'justify-start' })}>
                <LifeBuoy className="size-4 text-accent" /> Hilfe &amp; Anleitungen
              </a>
            </div>
          </div>

          {/* Footer Aktionen: Abmelden & Konto löschen */}
          <div className="pt-2 border-t border-line/70 flex items-center justify-between gap-2">
            {user.canSelfDelete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="text-danger-ink hover:bg-danger/10 hover:text-danger-ink text-xs"
              >
                <Trash2 className="size-3.5" aria-hidden />
                {deleting ? 'Löschen…' : 'Konto löschen'}
              </Button>
            ) : (
              <span />
            )}

            <Button variant="ghost" size="sm" onClick={logout} disabled={deleting} className="text-xs">
              <LogOut className="size-3.5" /> Abmelden
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showIosGuide} onClose={() => setShowIosGuide(false)} size="sm" title="Zum Home-Bildschirm hinzufügen">
        <div className="space-y-4 text-sm text-fg-muted">
          <p>So fügst du den Schichtplan als App auf deinem Home-Bildschirm hinzu:</p>
          <ol className="list-decimal space-y-2 pl-5 text-fg">
            <li>Tippe in Safari unten in der Leiste auf das <strong>Teilen-Symbol</strong> (Viereck mit Pfeil nach oben).</li>
            <li>Scrolle im Menü etwas nach unten und wähle <strong>«Zum Home-Bildschirm»</strong>.</li>
            <li>Tippe oben rechts auf <strong>«Hinzufügen»</strong>.</li>
          </ol>
          <p className="text-xs text-fg-subtle">
            Der Schichtplan ist anschliessend wie eine native App startbar und funktioniert auch im Flugmodus oder Funkloch mit deinen gecachten Schichten.
          </p>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setShowIosGuide(false)}>Verstanden</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
