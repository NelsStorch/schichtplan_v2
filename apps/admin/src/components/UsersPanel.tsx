'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, RotateCw, Search, SearchX, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Select,
  Skeleton,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import type {
  AdminDepartmentListItemDto,
  AdminOverviewDto,
  AdminUserListDto,
  AdminUserListItemDto,
} from '@schichtplan/shared';
import { api, errorMessage } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { formatDate, formatLastSeen, fullName } from '../lib/format';
import { LoginMethodBadges } from './LoginMethodBadges';

type Filter = 'all' | 'duplicates' | 'cevidb' | 'password' | 'ceviname' | 'stale_ceviname' | 'admin';

const PAGE_SIZE = 25;

const sortOptions = [
  { value: 'created:desc', label: 'Neueste zuerst' },
  { value: 'created:asc', label: 'Älteste zuerst' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'email:asc', label: 'E-Mail A–Z' },
  { value: 'seen:desc', label: 'Zuletzt aktiv' },
  { value: 'seen:asc', label: 'Am längsten inaktiv' },
];

function buildQuery(params: { query: string; filter: Filter; departmentId: string; sort: string; page: number }) {
  const [sort, dir] = params.sort.split(':');
  const search = new URLSearchParams({ sort, dir, page: String(params.page), pageSize: String(PAGE_SIZE) });
  if (params.query) search.set('q', params.query);
  if (params.departmentId) search.set('departmentId', params.departmentId);
  if (params.filter === 'admin') search.set('role', 'admin');
  else if (params.filter !== 'all') search.set('method', params.filter);
  return search.toString();
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

function Departments({
  user,
  onOpenDepartment,
}: {
  user: AdminUserListItemDto;
  onOpenDepartment?: (id: string) => void;
}) {
  if (user.memberships.length === 0) {
    if (user.homeDepartmentId && user.homeDepartmentName) {
      return onOpenDepartment ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDepartment(user.homeDepartmentId!);
          }}
          className="inline-flex items-center"
        >
          <Badge tone="outline" className="max-w-40 truncate hover:border-line-strong">
            {user.homeDepartmentName}
          </Badge>
        </button>
      ) : (
        <Badge tone="outline" className="max-w-40 truncate">
          {user.homeDepartmentName}
        </Badge>
      );
    }
    return <span className="text-fg-subtle">–</span>;
  }
  const [first, ...rest] = user.memberships;
  return (
    <span className="flex items-center gap-1.5">
      {onOpenDepartment ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDepartment(first.departmentId);
          }}
          className="inline-flex items-center"
        >
          <Badge tone="outline" className="max-w-40 truncate hover:border-line-strong">
            {first.departmentName}
          </Badge>
        </button>
      ) : (
        <Badge tone="outline" className="max-w-40 truncate">
          {first.departmentName}
        </Badge>
      )}
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

export function UsersPanel({
  currentUserId,
  overview,
  departments = [],
  onOpenUser,
  onOpenDepartment,
  onChanged,
}: {
  currentUserId?: string;
  overview: AdminOverviewDto | null;
  departments?: AdminDepartmentListItemDto[];
  onOpenUser: (user: AdminUserListItemDto) => void;
  onOpenDepartment?: (departmentId: string) => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [departmentId, setDepartmentId] = useState('');
  const [sort, setSort] = useState('created:desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminUserListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds).filter((id) => id !== currentUserId);
    if (ids.length === 0) return;

    const confirmed = await confirm({
      title: `${ids.length} Personen wirklich löschen?`,
      description: `Möchtest du diese ${ids.length} Konten unwiderruflich löschen? Alle Schichteintragungen und Mitgliedschaften werden entfernt.`,
      confirmLabel: `${ids.length} Personen löschen`,
      cancelLabel: 'Abbrechen',
      tone: 'danger',
      countdownSeconds: 5,
    });

    if (!confirmed) return;

    try {
      const res = await api<{ message: string; deleted: number; notDeleted?: { id: string; reason: string }[] }>(
        '/api/admin/users/batch-delete',
        {
          method: 'POST',
          body: JSON.stringify({ userIds: ids }),
        }
      );
      toast({
        title: 'Stapelverarbeitung abgeschlossen',
        description: `${res.deleted} von ${ids.length} Personen wurden gelöscht.`,
        tone: 'success',
      });
      setSelectedIds(new Set());
      setReload((n) => n + 1);
      onChanged();
    } catch (err) {
      toast({
        title: 'Fehler beim Löschen',
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const handleExport = () => {
    if (!items.length) return;
    const rows = items.map((u) => ({
      ID: u.id,
      Vorname: u.firstName,
      Nachname: u.lastName,
      'Cevi-Name': u.ceviName ?? '',
      'E-Mail': u.email ?? '',
      Telefon: u.phone ?? '',
      'Cevi.DB-ID': u.ceviDbId ?? '',
      Anmeldearten: u.loginMethods.join(', '),
      'Globale Admin': u.isGlobalAdmin ? 'Ja' : 'Nein',
      Heimabteilung: u.homeDepartmentName ?? '',
      Eintragungen: u.signupCount,
      'Zuletzt aktiv': u.lastSeenOn ? formatDate(u.lastSeenOn) : '',
      Registriert: formatDate(u.createdAt),
      'Mögliche Dublette': u.potentialDuplicateOf ? `Ja (${u.potentialDuplicateOf.name}, ID: ${u.potentialDuplicateOf.id})` : 'Nein',
    }));
    downloadCsv(rows, `personen_${filter}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleDeleteUser = async (target: AdminUserListItemDto) => {
    if (target.id === currentUserId) {
      toast({
        title: 'Nicht möglich',
        description: 'Du kannst dein eigenes Admin-Konto nicht löschen.',
        tone: 'error',
      });
      return;
    }

    const name = fullName(target);
    const confirmed = await confirm({
      title: `${name} wirklich löschen?`,
      description: `Möchtest du das Konto von ${name} wirklich unwiderruflich löschen? Alle Schichteintragungen, Abteilungs- und OK-Mitgliedschaften werden dabei vollständig entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Person endgültig löschen',
      cancelLabel: 'Abbrechen',
      tone: 'danger',
      countdownSeconds: 7,
    });

    if (!confirmed) return;

    try {
      await api(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      });
      toast({
        title: 'Person gelöscht',
        description: `${name} wurde vollständig gelöscht.`,
        tone: 'success',
      });
      setReload((n) => n + 1);
      onChanged();
    } catch (err) {
      toast({
        title: 'Fehler beim Löschen',
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

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
    api<AdminUserListDto>(`/api/admin/users?${buildQuery({ query, filter, departmentId, sort, page })}`, {
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
  }, [query, filter, departmentId, sort, page, reload]);

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const hasSubFilter = Boolean(query || departmentId);
  const chipCount = (id: Filter, globalCount?: number) => {
    if (!hasSubFilter) return globalCount;
    return filter === id ? data?.total : undefined;
  };

  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: 'Alle', count: chipCount('all', overview?.users) },
    { id: 'duplicates', label: 'Mögliche Dubletten', count: chipCount('duplicates', overview?.duplicateUsers) },
    { id: 'cevidb', label: 'Cevi.DB', count: chipCount('cevidb', overview?.cevidbUsers) },
    { id: 'password', label: 'Passwort', count: chipCount('password', overview?.passwordUsers) },
    { id: 'ceviname', label: 'Nur Cevi-Name', count: chipCount('ceviname', overview?.guestUsers) },
    { id: 'stale_ceviname', label: 'Verwaist (>30 T.)', count: chipCount('stale_ceviname', overview?.staleGuestUsers) },
    { id: 'admin', label: 'Admins', count: chipCount('admin', overview?.globalAdmins) },
  ];

  const items = data?.items ?? [];
  const firstLoad = loading && !data;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <div className="space-y-6">
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
          <div className="md:w-56">
            <Select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              aria-label="Abteilung filtern"
            >
              <option value="">Alle Abteilungen</option>
              <option value="none">Ohne Abteilung</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="md:w-48">
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
            query || filter !== 'all' || departmentId
              ? 'Mit dieser Suche und diesem Filter gibt es keine Treffer.'
              : 'Es sind noch keine Personen registriert.'
          }
          action={
            query || filter !== 'all' || departmentId ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setDepartmentId('');
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
          {/* Sammelaktionen-Leiste */
          selectedIds.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/30 bg-accent/5 p-3.5">
              <div className="flex items-center gap-2">
                <Badge tone="accent">{selectedIds.size} ausgewählt</Badge>
                <span className="text-xs text-fg-muted">Ausgewählte Personen für Stapelaktionen</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelectedIds(new Set())}>
                  Auswahl aufheben
                </Button>
                <Button size="sm" variant="danger" onClick={handleBatchDelete}>
                  <Trash2 className="size-3.5" aria-hidden />
                  {selectedIds.size} {selectedIds.size === 1 ? 'Person' : 'Personen'} löschen
                </Button>
              </div>
            </div>
          )}
          {/* Ab md als Tabelle */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Alle auf dieser Seite auswählen"
                      checked={
                        items.length > 0 &&
                        items.filter((u) => u.id !== currentUserId).every((u) => selectedIds.has(u.id))
                      }
                      onChange={(e) => {
                        const selectable = items.filter((u) => u.id !== currentUserId).map((u) => u.id);
                        if (e.target.checked) {
                          setSelectedIds((prev) => new Set([...prev, ...selectable]));
                        } else {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            selectable.forEach((id) => next.delete(id));
                            return next;
                          });
                        }
                      }}
                      className="size-4 rounded border-line"
                    />
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">Person</th>
                  <th scope="col" className="px-3 py-3 font-semibold">E-Mail</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Anmeldung</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Abteilung</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Einträge</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Zuletzt aktiv</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Registriert</th>
                  <th scope="col" className="w-12 px-3 py-3 text-right font-semibold">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => onOpenUser(user)}
                    className="cursor-pointer transition-colors hover:bg-surface-2 focus-within:bg-surface-2"
                  >
                    <td className="max-w-64 px-5 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenUser(user);
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
                      <Departments user={user} onOpenDepartment={onOpenDepartment} />
                    </td>
                    <td className="tabular px-3 py-3 text-right font-mono text-fg-muted">{user.signupCount}</td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right font-mono text-fg-muted">
                      {formatLastSeen(user.lastSeenOn)}
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right font-mono text-fg-muted">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="w-12 px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {user.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteUser(user)}
                          aria-label={`${fullName(user)} löschen`}
                          title="Person löschen"
                          className="text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      )}
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
                <li key={user.id} className="flex items-center transition-colors hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => onOpenUser(user)}
                    className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3.5 text-left focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <PersonCell user={user} />
                    </span>
                    {user.email && <span className="truncate pl-10 text-[13px] text-fg-muted">{user.email}</span>}
                    <span className="pl-10">
                      <LoginMethodBadges methods={user.loginMethods} />
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 pr-3">
                    {user.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUser(user);
                        }}
                        aria-label={`${fullName(user)} löschen`}
                        title="Person löschen"
                        className="text-fg-subtle hover:bg-danger/10 hover:text-danger-ink"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenUser(user)}
                      aria-label={`${fullName(user)} Details`}
                      className="flex size-8 items-center justify-center rounded-full text-fg-subtle hover:text-fg"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </div>
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
    </div>
  );
}
