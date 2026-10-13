'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, Search, SearchX, ShieldCheck, X } from 'lucide-react';
import { Avatar, Badge, Button, Callout, Card, Chip, ChipRow, EmptyState, Select, Skeleton, cn } from '@schichtplan/ui';
import type { AdminOverviewDto, AdminUserListDto, AdminUserListItemDto } from '@schichtplan/shared';
import { api, errorMessage } from '../lib/api';
import { formatDate, fullName } from '../lib/format';
import { LoginMethodBadges } from './LoginMethodBadges';
import { UserDialog } from './UserDialog';

type Filter = 'all' | 'cevidb' | 'password' | 'ceviname' | 'admin';

const PAGE_SIZE = 25;

const sortOptions = [
  { value: 'created:desc', label: 'Neueste zuerst' },
  { value: 'created:asc', label: 'Älteste zuerst' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'email:asc', label: 'E-Mail A–Z' },
];

function buildQuery(params: { query: string; filter: Filter; sort: string; page: number }) {
  const [sort, dir] = params.sort.split(':');
  const search = new URLSearchParams({ sort, dir, page: String(params.page), pageSize: String(PAGE_SIZE) });
  if (params.query) search.set('q', params.query);
  if (params.filter === 'admin') search.set('role', 'admin');
  else if (params.filter !== 'all') search.set('method', params.filter);
  return search.toString();
}

function Stat({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold leading-none tracking-tight text-fg tabular">
        {loading || value === undefined ? <Skeleton className="h-6 w-12" /> : value.toLocaleString('de-CH')}
      </dd>
    </div>
  );
}

function Overview({ overview, loading }: { overview: AdminOverviewDto | null; loading: boolean }) {
  return (
    <Card className="overflow-hidden">
      <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-4 [&>div]:bg-surface">
        <Stat label="Personen" value={overview?.users} loading={loading} />
        <Stat label="Neu in 7 Tagen" value={overview?.newUsers7d} loading={loading} />
        <Stat label="Abteilungen" value={overview?.departments} loading={loading} />
        <Stat label="Anlässe" value={overview?.events} loading={loading} />
      </dl>
    </Card>
  );
}

function PersonCell({ user }: { user: AdminUserListItemDto }) {
  const name = fullName(user);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size="sm" highlight={user.isGlobalAdmin} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-fg">{name}</span>
          {user.isGlobalAdmin && (
            <ShieldCheck aria-label="Globale Admin" className="size-3.5 shrink-0 text-accent-ink" />
          )}
        </span>
        {user.ceviName && user.ceviName !== user.firstName && (
          <span className="block truncate text-xs text-fg-subtle">{user.ceviName}</span>
        )}
      </span>
    </span>
  );
}

function Departments({ user }: { user: AdminUserListItemDto }) {
  if (user.memberships.length === 0) return <span className="text-fg-subtle">–</span>;
  const [first, ...rest] = user.memberships;
  return (
    <span className="flex items-center gap-1.5">
      <Badge tone="outline" className="max-w-40 truncate">
        {first.departmentName}
      </Badge>
      {rest.length > 0 && (
        <span
          className="text-xs font-medium text-fg-subtle"
          title={rest.map((m) => m.departmentName).join(', ')}
        >
          +{rest.length}
        </span>
      )}
    </span>
  );
}

export function UsersPanel() {
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState('created:desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminUserListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<AdminUserListItemDto | null>(null);

  useEffect(() => {
    api<AdminOverviewDto>('/api/admin/overview')
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
  }, []);

  // Suche leicht verzögert, damit nicht jeder Tastendruck eine Abfrage auslöst
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<AdminUserListDto>(`/api/admin/users?${buildQuery({ query, filter, sort, page })}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setData(result);
        setError(null);
        // Eine Seite hinter dem Ende (z. B. nach einem Filterwechsel) auf die letzte zurückholen
        if (result.page > result.pageCount) setPage(result.pageCount);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, filter, sort, page, reload]);

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: 'Alle', count: overview?.users },
    { id: 'cevidb', label: 'Cevi.DB', count: overview?.cevidbUsers },
    { id: 'password', label: 'Passwort', count: overview?.passwordUsers },
    { id: 'ceviname', label: 'Nur Cevi-Name', count: overview?.guestUsers },
    { id: 'admin', label: 'Admins', count: overview?.globalAdmins },
  ];

  const items = data?.items ?? [];
  const firstLoad = loading && !data;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <div className="space-y-6">
      <Overview overview={overview} loading={overviewLoading} />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, Cevi-Name, E-Mail, Telefon oder Cevi.DB-ID"
              aria-label="Personen suchen"
              autoComplete="off"
              className="h-12 w-full rounded-field border border-line bg-surface-2 pl-11 pr-11 text-base text-fg outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-fg-subtle hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Suche leeren"
                className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-3 hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <div className="md:w-52">
            <Select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              aria-label="Sortierung"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ChipRow>
          {filters.map((f) => (
            <Chip key={f.id} selected={filter === f.id} count={f.count} onClick={() => changeFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {error && (
        <Callout tone="danger">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={() => setReload((n) => n + 1)}>
              <RotateCw aria-hidden />
              Nochmals versuchen
            </Button>
          </span>
        </Callout>
      )}

      {firstLoad ? (
        <Card className="divide-y divide-line overflow-hidden">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto hidden h-4 w-48 md:block" />
            </div>
          ))}
        </Card>
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={<SearchX />}
          title="Niemand gefunden"
          description={
            query || filter !== 'all'
              ? 'Mit dieser Suche und diesem Filter gibt es keine Treffer.'
              : 'Es sind noch keine Personen registriert.'
          }
          action={
            query || filter !== 'all' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  changeFilter('all');
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn('transition-opacity duration-200', loading && 'opacity-60')} aria-busy={loading}>
          {/* Ab md als Tabelle */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Person</th>
                  <th scope="col" className="px-3 py-3 font-semibold">E-Mail</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Anmeldung</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Abteilung</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Einträge</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Registriert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelected(user)}
                    className="cursor-pointer transition-colors hover:bg-surface-2 focus-within:bg-surface-2"
                  >
                    <td className="max-w-64 px-5 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(user);
                        }}
                        className="w-full text-left outline-none focus-visible:underline"
                        aria-label={`${fullName(user)} anzeigen`}
                      >
                        <PersonCell user={user} />
                      </button>
                    </td>
                    <td className="max-w-56 truncate px-3 py-3 text-fg-muted">
                      {user.email ?? <span className="text-fg-subtle">–</span>}
                    </td>
                    <td className="px-3 py-3">
                      <LoginMethodBadges methods={user.loginMethods} />
                    </td>
                    <td className="px-3 py-3">
                      <Departments user={user} />
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-fg-muted">{user.signupCount}</td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right font-mono text-fg-muted">
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Auf dem Handy als Liste */}
          <Card className="overflow-hidden md:hidden">
            <ul className="divide-y divide-line">
              {items.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(user)}
                    className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <PersonCell user={user} />
                      <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                    </span>
                    {user.email && <span className="truncate pl-10 text-[13px] text-fg-muted">{user.email}</span>}
                    <span className="pl-10">
                      <LoginMethodBadges methods={user.loginMethods} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {data && data.total > 0 && (
        <nav aria-label="Seiten" className="flex items-center justify-between gap-3">
          <p className="tabular text-[13px] text-fg-muted">
            {from.toLocaleString('de-CH')}–{to.toLocaleString('de-CH')} von {data.total.toLocaleString('de-CH')}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={loading || data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft aria-hidden />
              Zurück
            </Button>
            <span className="tabular min-w-16 text-center text-[13px] text-fg-subtle">
              {data.page} / {data.pageCount}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading || data.page >= data.pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Weiter
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </nav>
      )}

      <UserDialog preview={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
