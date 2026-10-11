'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, LogIn, LogOut, Ticket, UserRound } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  CeviLogo,
  Dialog,
  ThemeToggle,
  buttonClasses,
  cn,
} from '@schichtplan/ui';
import { useLoginHref } from '@/lib/api';
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

      <main className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-20">{children}</main>

      <footer className="hidden border-t border-line/70 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6 text-xs text-fg-subtle">
          <p>
            © {new Date().getFullYear()} {department?.name ?? 'Cevi'}
          </p>
          <a href="https://cevi-schichtplan.ch" className="transition hover:text-fg">
            cevi-schichtplan.ch
          </a>
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
  if (!user) return null;
  const role = user.isGlobalAdmin ? 'Plattform-Admin' : ROLE_LABEL[user.departmentRole ?? ''] ?? 'Helfer:in';

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Dein Konto">
      <div className="flex items-center gap-4 rounded-card bg-surface-2 p-4">
        <Avatar name={displayName(user)} size="lg" highlight />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-fg">{displayName(user)}</p>
          <p className="truncate text-sm text-fg-muted">
            {user.firstName} {user.lastName}
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
        <Button variant="ghost" onClick={logout}>
          <LogOut /> Abmelden
        </Button>
      </div>
    </Dialog>
  );
}
