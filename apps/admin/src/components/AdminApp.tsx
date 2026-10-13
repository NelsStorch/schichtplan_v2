'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, LogOut, ShieldAlert } from 'lucide-react';
import { Button, Callout, CeviLogo, ThemeToggle, buttonClasses } from '@schichtplan/ui';
import type { UserDto } from '@schichtplan/shared';
import { ApiError, api, errorMessage, loginUrl } from '../lib/api';
import { UsersPanel } from './UsersPanel';

type Session =
  | { status: 'loading' }
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  | { status: 'forbidden'; user: UserDto }
  | { status: 'ready'; user: UserDto };

const displayName = (user: Pick<UserDto, 'ceviName' | 'firstName'>) => user.ceviName || user.firstName;

function Shell({ children, user, onLogout }: { children: React.ReactNode; user?: UserDto; onLogout?: () => void }) {
  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[40vh] opacity-60" />

      <header className="sticky top-0 z-header border-b border-line bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <CeviLogo className="size-8" alt="" />
            <span className="truncate font-display text-[15px] font-semibold tracking-tight text-fg">
              Cevi Schichtplan
            </span>
            <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-semibold text-fg-muted">Admin</span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {user && (
              <span className="mr-1 hidden max-w-40 truncate text-sm text-fg-muted sm:block">{displayName(user)}</span>
            )}
            <ThemeToggle />
            {onLogout && (
              <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Abmelden" title="Abmelden">
                <LogOut aria-hidden />
              </Button>
            )}
          </span>
        </div>
      </header>

      <main id="inhalt" className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col justify-center animate-fade-up">{children}</div>;
}

export function AdminApp() {
  const [session, setSession] = useState<Session>({ status: 'loading' });

  useEffect(() => {
    api<UserDto>('/api/auth/me')
      .then((user) => setSession({ status: user.isGlobalAdmin ? 'ready' : 'forbidden', user }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setSession({ status: 'redirecting' });
          window.location.replace(loginUrl());
          return;
        }
        setSession({ status: 'error', message: errorMessage(err) });
      });
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.replace(loginUrl(window.location.origin + '/'));
  };

  if (session.status === 'loading' || session.status === 'redirecting') {
    return (
      <Shell>
        <Centered>
          <p role="status" className="flex items-center gap-3 text-[15px] text-fg-muted">
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
            {session.status === 'redirecting' ? 'Weiterleitung zum Login …' : 'Anmeldung wird geprüft …'}
          </p>
        </Centered>
      </Shell>
    );
  }

  if (session.status === 'error') {
    return (
      <Shell>
        <Centered>
          <Callout tone="danger">{session.message}</Callout>
          <Button className="mt-4 self-start" variant="secondary" onClick={() => window.location.reload()}>
            Neu laden
          </Button>
        </Centered>
      </Shell>
    );
  }

  if (session.status === 'forbidden') {
    return (
      <Shell user={session.user} onLogout={logout}>
        <Centered>
          <span className="flex size-12 items-center justify-center rounded-tile bg-danger/12 text-danger-ink">
            <ShieldAlert className="size-6" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-fg">
            Kein Zugriff
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Du bist als <span className="font-medium text-fg">{displayName(session.user)}</span> angemeldet, aber
            nicht als globale Admin eingetragen. Falls du Zugriff brauchst, melde dich mit dem richtigen Konto an
            (für Admins gilt die Anmeldung mit Cevi.DB).
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" onClick={logout}>
              Mit anderem Konto anmelden
            </Button>
            <a
              href={`${window.location.protocol}//${window.location.hostname.replace(/^admin\./, '')}`}
              className={buttonClasses({ variant: 'secondary', size: 'lg' })}
            >
              Zur Startseite
              <ArrowUpRight aria-hidden />
            </a>
          </div>
        </Centered>
      </Shell>
    );
  }

  return (
    <Shell user={session.user} onLogout={logout}>
      <div className="mb-7">
        <h1 className="font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-fg">Personen</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
          Alle Konten über sämtliche Abteilungen. Nur für globale Admins sichtbar.
        </p>
      </div>
      <UsersPanel />
    </Shell>
  );
}
