'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartColumn,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { Button, Callout, CeviLogo, ThemeToggle, buttonClasses, cn } from '@schichtplan/ui';
import {
  PRIVACY_URL,
  STATUS_URL,
  type AdminDepartmentListItemDto,
  type AdminOverviewDto,
  type AdminSessionDto,
  type AdminUserListItemDto,
  type UserDto,
} from '@schichtplan/shared';
import { ApiError, REAUTH_EVENT, api, errorMessage, isReauthCode, loginUrl } from '../lib/api';
import { AuditPanel } from './AuditPanel';
import { DashboardPanel, type AdminTab } from './DashboardPanel';
import { DepartmentDialog } from './DepartmentDialog';
import { DepartmentsPanel } from './DepartmentsPanel';
import { EventsPanel } from './EventsPanel';
import { StatsPanel } from './StatsPanel';
import { UserDialog } from './UserDialog';
import { UsersPanel } from './UsersPanel';

type Session =
  | { status: 'loading' }
  | { status: 'redirecting' }
  | { status: 'error'; message: string }
  | { status: 'forbidden'; user: UserDto }
  | { status: 'reauth'; user: UserDto; code: 'REAUTH_REQUIRED' | 'REAUTH_CEVIDB'; message: string }
  | { status: 'ready'; user: UserDto; adminSession: AdminSessionDto };

const displayName = (user: Pick<UserDto, 'ceviName' | 'firstName'>) => user.ceviName || user.firstName;

function Shell({
  children,
  user,
  onLogout,
  nav,
}: {
  children: React.ReactNode;
  user?: UserDto;
  onLogout?: () => void;
  nav?: React.ReactNode;
}) {
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
        {nav}
      </header>

      <main id="inhalt" className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-6 text-xs text-fg-subtle sm:px-6">
          <span>&copy; {new Date().getFullYear()} Cevi Schichtplan</span>
          <div className="flex items-center gap-5">
            <a href={STATUS_URL} className="transition hover:text-fg">
              Status
            </a>
            <a href={PRIVACY_URL} className="transition hover:text-fg">
              Datenschutz
            </a>
          </div>
        </div>
      </footer>
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
      .then(async (user) => {
        if (!user.isGlobalAdmin) return setSession({ status: 'forbidden', user });
        // Die Admin-Schnittstelle verlangt eine frische Anmeldung (in Produktion über Cevi.DB)
        try {
          const adminSession = await api<AdminSessionDto>('/api/admin/session');
          setSession({ status: 'ready', user, adminSession });
        } catch (err) {
          if (err instanceof ApiError && isReauthCode(err.code)) {
            setSession({ status: 'reauth', user, code: err.code, message: err.message });
            return;
          }
          setSession({ status: 'error', message: errorMessage(err) });
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setSession({ status: 'redirecting' });
          window.location.replace(loginUrl());
          return;
        }
        setSession({ status: 'error', message: errorMessage(err) });
      });
  }, []);

  // Läuft die Admin-Sitzung während der Arbeit ab, meldet das jede weitere Anfrage
  useEffect(() => {
    const onReauth = (e: Event) => {
      const { code, message } = (e as CustomEvent<{ code: 'REAUTH_REQUIRED' | 'REAUTH_CEVIDB'; message: string }>)
        .detail;
      setSession((current) =>
        current.status === 'ready' ? { status: 'reauth', user: current.user, code, message } : current
      );
    };
    window.addEventListener(REAUTH_EVENT, onReauth);
    return () => window.removeEventListener(REAUTH_EVENT, onReauth);
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

  if (session.status === 'reauth') {
    return (
      <Shell user={session.user} onLogout={logout}>
        <Centered>
          <span className="flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
            <KeyRound className="size-6" aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-[1.75rem] font-semibold leading-tight tracking-tight text-fg">
            Bitte neu anmelden
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{session.message}</p>
          <p className="mt-3 text-sm leading-relaxed text-fg-subtle">
            {session.code === 'REAUTH_CEVIDB'
              ? 'Für den Admin-Bereich zählt nur die Anmeldung mit Cevi.DB, nicht E-Mail und Passwort.'
              : 'Zum Schutz gilt eine Anmeldung im Admin-Bereich nur einige Stunden. Danach musst du dich neu anmelden, auch wenn du auf den Abteilungsseiten noch angemeldet bist.'}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button size="lg" onClick={logout}>
              {session.code === 'REAUTH_CEVIDB' ? 'Mit Cevi.DB anmelden' : 'Neu anmelden'}
            </Button>
          </div>
        </Centered>
      </Shell>
    );
  }

  return <AdminHome user={session.user} adminSession={session.adminSession} logout={logout} />;
}

const TABS: { id: AdminTab; label: string; icon: React.ReactNode; intro: string }[] = [
  {
    id: 'uebersicht',
    label: 'Übersicht',
    icon: <LayoutDashboard aria-hidden />,
    intro: 'Kennzahlen über alle Abteilungen, was als Nächstes ansteht und was Aufmerksamkeit braucht.',
  },
  {
    id: 'abteilungen',
    label: 'Abteilungen',
    icon: <Building2 aria-hidden />,
    intro: 'Abteilungen anlegen, Einstellungen ändern, Leitung und Rollen vergeben oder eine Abteilung löschen.',
  },
  {
    id: 'anlaesse',
    label: 'Anlässe',
    icon: <CalendarDays aria-hidden />,
    intro: 'Alle Anlässe aller Abteilungen mit Belegung. Veröffentlichen, Eintragen öffnen oder schliessen, löschen.',
  },
  {
    id: 'personen',
    label: 'Personen',
    icon: <Users aria-hidden />,
    intro: 'Alle Konten über sämtliche Abteilungen. Rollen und globale Admin-Rechte vergeben.',
  },
  {
    id: 'statistik',
    label: 'Statistik',
    icon: <ChartColumn aria-hidden />,
    intro: 'Wie der Schichtplan genutzt wird: anonyme Tageszahlen, Funktionen, Anlässe und Betrieb.',
  },
  {
    id: 'protokoll',
    label: 'Protokoll',
    icon: <History aria-hidden />,
    intro: 'Jede Änderung im Admin-Portal: wer, wann, was. Einträge lassen sich nicht ändern oder löschen.',
  },
];

const parseHash = (): { tab: AdminTab; entity?: string } => {
  const raw = window.location.hash.slice(1);
  const [first, second] = raw.split('/');
  const tab = TABS.some((t) => t.id === first) ? (first as AdminTab) : 'uebersicht';
  return { tab, entity: second ? decodeURIComponent(second) : undefined };
};

const timeFmt = new Intl.DateTimeFormat('de-CH', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });

function AdminHome({
  user,
  adminSession,
  logout,
}: {
  user: UserDto;
  adminSession: AdminSessionDto;
  logout: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>('uebersicht');
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [departments, setDepartments] = useState<AdminDepartmentListItemDto[] | null>(null);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);
  const [pendingDeptKey, setPendingDeptKey] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<AdminUserListItemDto | null>(null);
  const [auditTarget, setAuditTarget] = useState<{ id: string; label: string } | null>(null);
  const [usersReload, setUsersReload] = useState(0);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  // Ablauf-Countdown für die Admin-Sitzung (prüft alle 30 Sekunden)
  useEffect(() => {
    if (!adminSession.expiresAt) return;
    const expiresMs = new Date(adminSession.expiresAt).getTime();
    const update = () => {
      const diffMin = Math.max(0, Math.ceil((expiresMs - Date.now()) / 60_000));
      setMinutesLeft(diffMin);
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [adminSession.expiresAt]);

  const openUserById = useCallback((userId: string) => {
    api<AdminUserListItemDto>(`/api/admin/users/${encodeURIComponent(userId)}`)
      .then((u) => setOpenUser(u))
      .catch(() => undefined);
  }, []);

  // Bereich und optional geöffnete Abteilung/Person im Hash (#abteilungen/<id>, #personen/<id>)
  useEffect(() => {
    const sync = () => {
      const { tab: nextTab, entity } = parseHash();
      setTab(nextTab);
      if (nextTab === 'abteilungen' && entity) {
        setPendingDeptKey(entity);
      } else if (nextTab === 'personen' && entity) {
        setOpenUser((curr) => {
          if (curr?.id !== entity) openUserById(entity);
          return curr;
        });
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [openUserById]);

  // Sobald die Abteilungsliste geladen ist, #abteilungen/<slug-oder-id> auflösen
  useEffect(() => {
    if (!pendingDeptKey || !departments) return;
    const match = departments.find((d) => d.id === pendingDeptKey || d.slug === pendingDeptKey);
    if (match) setOpenDepartment(match.id);
    setPendingDeptKey(null);
  }, [pendingDeptKey, departments]);

  const setHashSilently = (nextHash: string) => {
    const url = nextHash ? `#${nextHash}` : window.location.pathname;
    history.replaceState(null, '', url);
  };

  const handleOpenDepartment = (id: string | null) => {
    setOpenDepartment(id);
    if (id) {
      const slug = departments?.find((d) => d.id === id)?.slug ?? id;
      setHashSilently(`abteilungen/${encodeURIComponent(slug)}`);
    } else {
      setHashSilently(tab === 'uebersicht' ? '' : tab);
    }
  };

  const handleOpenUser = (u: AdminUserListItemDto | null) => {
    setOpenUser(u);
    if (u) {
      setHashSilently(`personen/${encodeURIComponent(u.id)}`);
    } else {
      setHashSilently(tab === 'uebersicht' ? '' : tab);
    }
  };

  const handleOpenUserById = (userId: string) => {
    setOpenDepartment(null);
    setHashSilently(`personen/${encodeURIComponent(userId)}`);
    openUserById(userId);
  };

  const navigate = (next: AdminTab) => {
    if (next === 'uebersicht') history.pushState(null, '', window.location.pathname);
    else window.location.hash = next;
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const refresh = useCallback(() => {
    api<AdminOverviewDto>('/api/admin/overview')
      .then(setOverview)
      .catch(() => undefined);
    api<{ items: AdminDepartmentListItemDto[] }>('/api/admin/departments')
      .then((r) => setDepartments(r.items))
      .catch(() => undefined)
      .finally(() => setDepartmentsLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  const nav = (
    <nav aria-label="Bereiche" className="mx-auto w-full max-w-6xl px-2 sm:px-4">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <li key={t.id} className="shrink-0">
            <a
              href={t.id === 'uebersicht' ? '#' : `#${t.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(t.id);
              }}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition [&_svg]:size-4',
                tab === t.id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
              )}
            >
              {t.icon}
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <Shell user={user} onLogout={logout} nav={nav}>
      {adminSession.expiresAt && (
        <p className="mb-4 text-xs text-fg-subtle">
          Admin-Sitzung gültig bis {timeFmt.format(new Date(adminSession.expiresAt))}
          {minutesLeft !== null && ` (noch ${minutesLeft} Min.)`}
          {adminSession.loginMethod === 'cevidb' ? ' · angemeldet mit Cevi.DB' : ''}
        </p>
      )}
      {minutesLeft !== null && minutesLeft <= 15 && (
        <div className="mb-6">
          <Callout tone="warning" title="Admin-Sitzung läuft bald ab">
            <span className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <span>
                {minutesLeft <= 0
                  ? 'Deine Admin-Sitzung ist abgelaufen. Bitte melde dich jetzt neu an, bevor du weitere Änderungen speicherst.'
                  : `Deine Admin-Sitzung läuft in ${minutesLeft} ${minutesLeft === 1 ? 'Minute' : 'Minuten'} ab.`}
              </span>
              <Button size="sm" variant="secondary" onClick={logout}>
                Jetzt neu anmelden
              </Button>
            </span>
          </Callout>
        </div>
      )}
      <div className="mb-7">
        <h1 className="font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-fg">{current.label}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{current.intro}</p>
      </div>

      {tab === 'uebersicht' && (
        <DashboardPanel
          overview={overview}
          onNavigate={navigate}
          onOpenDepartment={handleOpenDepartment}
          onOpenUser={handleOpenUser}
        />
      )}
      {tab === 'abteilungen' && (
        <DepartmentsPanel
          departments={departments}
          loading={departmentsLoading}
          onOpen={handleOpenDepartment}
          onChanged={refresh}
        />
      )}
      {tab === 'anlaesse' && <EventsPanel departments={departments ?? []} onOpenDepartment={handleOpenDepartment} />}
      {tab === 'statistik' && <StatsPanel departments={departments ?? []} />}
      {tab === 'protokoll' && (
        <AuditPanel
          targetFilter={auditTarget}
          onClearTargetFilter={() => setAuditTarget(null)}
          onOpenDepartment={handleOpenDepartment}
          onOpenUserById={handleOpenUserById}
        />
      )}
      {tab === 'personen' && (
        <UsersPanel
          key={usersReload}
          currentUserId={user.id}
          overview={overview}
          departments={departments ?? []}
          onOpenUser={handleOpenUser}
          onOpenDepartment={handleOpenDepartment}
          onChanged={refresh}
        />
      )}

      <DepartmentDialog
        departmentId={openDepartment}
        onClose={() => handleOpenDepartment(null)}
        onOpenUser={handleOpenUserById}
        onChanged={() => {
          refresh();
          setUsersReload((n) => n + 1);
        }}
      />
      <UserDialog
        preview={openUser}
        currentUserId={user.id}
        onClose={() => handleOpenUser(null)}
        onOpenDepartment={handleOpenDepartment}
        onOpenAudit={(id, label) => {
          handleOpenUser(null);
          setAuditTarget({ id, label });
          navigate('protokoll');
        }}
        onSwitchUser={(target) => {
          setUsersReload((n) => n + 1);
          handleOpenUser(target);
        }}
        onChanged={() => {
          refresh();
          setUsersReload((n) => n + 1);
        }}
      />
    </Shell>
  );
}
