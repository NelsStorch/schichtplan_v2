'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, CalendarDays, Database, LifeBuoy, LogIn, LogOut, Ticket, Trash2, UserRound } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  CeviLogo,
  Dialog,
  ThemeToggle,
  buttonClasses,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { getLandingUrl, helpUrl } from '@schichtplan/shared';
import { departmentSetupUrl, useLoginHref } from '@/lib/api';
import { displayName, usePortal } from '@/lib/portal';

const NAV = [
  { href: '/', label: 'Anlässe', icon: CalendarDays, match: (p: string) => p === '/' || p.startsWith('/events') },
  { href: '/meine-schichten', label: 'Meine Schichten', icon: Ticket, match: (p: string) => p.startsWith('/meine-schichten') },
];

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname();
  const { department, user } = usePortal();
  const [accountOpen, setAccountOpen] = useState(false);
  const loginHref = useLoginHref();

  return (
    <div className="grain flex min-h-[100dvh] flex-col bg-campfire bg-no-repeat">
      <header className="sticky top-0 z-header border-b border-line/70 bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-full pr-2">
            <CeviLogo className="size-9" logoUrl={department?.logoUrl} alt="" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-bold tracking-tight text-fg">
                {department?.name ?? 'Cevi Schichtplan'}
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

      {user?.needsDepartmentSetup && (
        <div className="border-b border-warning/25 bg-warning/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <p className="text-fg">
              <span className="font-semibold">Zu welcher Abteilung gehörst du?</span>{' '}
              <span className="text-fg-muted">Manche Anlässe sind nur für eine Abteilung oder Stufe.</span>
            </p>
            <a href={departmentSetupUrl()} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
              <Building2 /> Abteilung angeben
            </a>
          </div>
        </div>
      )}

      <main className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-20">{children}</main>

      <footer className="hidden border-t border-line/70 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6 text-xs text-fg-subtle">
          <p>
            © {new Date().getFullYear()} {department?.name ?? 'Cevi'}
          </p>
          <div className="flex items-center gap-5">
            <a href={helpUrl()} className="transition hover:text-fg">
              Hilfe
            </a>
            <a href="https://cevi-schichtplan.ch" className="transition hover:text-fg">
              cevi-schichtplan.ch
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

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Abteilungsleitung',
  PLANNER: 'Schichtplanung',
  HELPER: 'Helfer:in',
};

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = usePortal();
  const confirm = useConfirm();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;
  const role = user.isGlobalAdmin ? 'Plattform-Admin' : ROLE_LABEL[user.departmentRole ?? ''] ?? 'Helfer:in';

  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: 'Konto wirklich löschen?',
      description:
        'Möchtest du dein Benutzerkonto wirklich unwiderruflich löschen? Alle deine Schichteintragungen und Verknüpfungen werden dabei vollständig entfernt. Diese Aktion kann nicht rückgängig gemacht werden.',
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
    <Dialog open={open} onClose={onClose} size="sm" title="Dein Konto">
      <div className="flex items-center gap-4 rounded-card bg-surface-2 p-4">
        <Avatar name={displayName(user)} size="lg" highlight />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-fg">{displayName(user)}</p>
          <p className="truncate text-sm text-fg-muted">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate text-xs text-fg-subtle">
            {user.homeDepartment ? user.homeDepartment.name : user.needsDepartmentSetup ? 'Abteilung fehlt' : 'Keine Abteilung'}
            {user.stufen?.length ? ` · ${user.stufen.map((s) => s.name).join(', ')}` : ''}
          </p>
          <Badge tone="accent" className="mt-2">
            {role}
          </Badge>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-card border border-line px-4 py-2">
        <span className="text-sm font-semibold text-fg">Farbschema</span>
        <ThemeToggle />
      </div>

      <div className="mt-4 grid gap-2">
        <Link href="/meine-schichten" onClick={onClose} className={buttonClasses({ variant: 'secondary' })}>
          <Ticket /> Meine Schichten
        </Link>
        <a href={departmentSetupUrl()} className={buttonClasses({ variant: 'secondary' })}>
          <Building2 /> Abteilung &amp; Stufen
        </a>
        <a href={getLandingUrl('/profil')} className={buttonClasses({ variant: 'secondary' })}>
          <UserRound /> Profil &amp; Angaben
        </a>
        <a href={helpUrl()} className={buttonClasses({ variant: 'secondary' })}>
          <LifeBuoy /> Hilfe &amp; Anleitungen
        </a>
        {user.isGlobalAdmin && (
          <Link href="/cevidb-daten" onClick={onClose} className={buttonClasses({ variant: 'secondary' })}>
            <Database /> Cevi.DB Daten & Profil
          </Link>
        )}
        <Button variant="ghost" onClick={logout} disabled={deleting}>
          <LogOut /> Abmelden
        </Button>
        {user.canSelfDelete && (
          <Button
            variant="ghost"
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="text-danger-ink hover:bg-danger/10 hover:text-danger-ink"
          >
            <Trash2 className="size-4" aria-hidden />
            {deleting ? 'Wird gelöscht …' : 'Konto löschen'}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
