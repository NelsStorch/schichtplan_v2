'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  MoreHorizontal,
  RotateCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
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
  useToast,
} from '@schichtplan/ui';
import {
  EVENT_ACCESS_TYPES,
  type AdminDepartmentListItemDto,
  type AdminEventListDto,
  type AdminEventListItemDto,
} from '@schichtplan/shared';
import { api, departmentUrl, errorMessage, send } from '../lib/api';
import { matchesOrg, organizationLabel, type OrgFilter } from '../lib/organizations';
import { downloadCsv } from '../lib/csv';
import { formatEventRange } from '../lib/format';
import { TypedConfirmDialog } from './TypedConfirmDialog';

type When = 'upcoming' | 'drafts' | 'urgent' | 'signup_closed' | 'past' | 'all';

const PAGE_SIZE = 25;

function accessLabel(type: string) {
  return (EVENT_ACCESS_TYPES as Record<string, { short: string }>)[type]?.short ?? type;
}

function EventStatus({ event }: { event: AdminEventListItemDto }) {
  const past = new Date(event.endDate).getTime() < Date.now();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {!event.isPublished ? (
        <Badge tone="warning">Entwurf</Badge>
      ) : past ? (
        <Badge>Vorbei</Badge>
      ) : event.allowPublicSignup ? (
        <Badge tone="success">Eintragen offen</Badge>
      ) : (
        <Badge tone="outline">Eintragen zu</Badge>
      )}
      <Badge tone="outline">{accessLabel(event.accessType)}</Badge>
    </span>
  );
}

function Fill({ event }: { event: AdminEventListItemDto }) {
  if (event.slotCount === 0) return <span className="text-xs text-fg-subtle">Keine Schichten</span>;
  const pct = Math.round((Math.min(event.signupCount, event.slotCount) / event.slotCount) * 100);
  return (
    <span className="flex flex-col gap-1.5">
      <span className="tabular text-xs text-fg-muted">
        <span className="font-semibold text-fg">{event.signupCount}</span> / {event.slotCount} Plätze · {pct}%
      </span>
      <span aria-hidden className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn('block h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-accent')}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

/** Aktionen pro Anlass: öffnen, OK-Bereich, Veröffentlichung, Eintragen, löschen */
function EventActions({
  event,
  onChanged,
  onDelete,
}: {
  event: AdminEventListItemDto;
  onChanged: () => void;
  onDelete: (event: AdminEventListItemDto) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const patch = async (data: { isPublished?: boolean; allowPublicSignup?: boolean }, message: string) => {
    setBusy(true);
    try {
      await send(`/api/admin/events/${event.id}`, 'PATCH', data);
      toast({ title: message, tone: 'success' });
      onChanged();
    } catch (err) {
      toast({ title: 'Nicht gespeichert', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const item = 'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-fg transition hover:bg-surface-2 disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-subtle';

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Aktionen für ${event.title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="size-9"
      >
        <MoreHorizontal aria-hidden />
      </Button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-10 z-30 w-64 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-lift"
          >
            <a role="menuitem" className={item} href={departmentUrl(event.departmentSlug, `/events/${event.slug}`, event.departmentOrganization)} target="_blank" rel="noreferrer">
              <ArrowUpRight aria-hidden />
              Anlass öffnen
            </a>
            <a role="menuitem" className={item} href={departmentUrl(event.departmentSlug, `/events/${event.slug}/ok`, event.departmentOrganization)} target="_blank" rel="noreferrer">
              <Settings2 aria-hidden />
              OK-Bereich öffnen
            </a>
            <div className="my-1 h-px bg-line" />
            <button
              role="menuitem"
              type="button"
              disabled={busy}
              className={item}
              onClick={() =>
                patch({ isPublished: !event.isPublished }, event.isPublished ? 'Anlass ist jetzt ein Entwurf' : 'Anlass veröffentlicht')
              }
            >
              {event.isPublished ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {event.isPublished ? 'Als Entwurf verstecken' : 'Veröffentlichen'}
            </button>
            <button
              role="menuitem"
              type="button"
              disabled={busy}
              className={item}
              onClick={() =>
                patch(
                  { allowPublicSignup: !event.allowPublicSignup },
                  event.allowPublicSignup ? 'Eintragen geschlossen' : 'Eintragen geöffnet'
                )
              }
            >
              {event.allowPublicSignup ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
              {event.allowPublicSignup ? 'Eintragen schliessen' : 'Eintragen öffnen'}
            </button>
            <div className="my-1 h-px bg-line" />
            <button
              role="menuitem"
              type="button"
              className={cn(item, 'text-danger-ink [&_svg]:text-danger-ink')}
              onClick={() => {
                setOpen(false);
                onDelete(event);
              }}
            >
              <Trash2 aria-hidden />
              Anlass löschen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Anlässe als Tabelle (ab md) bzw. Liste. Wird auch im Abteilungsdetail genutzt. */
export function EventRows({
  items,
  showDepartment = true,
  onOpenDepartment,
  onChanged,
}: {
  items: AdminEventListItemDto[];
  showDepartment?: boolean;
  onOpenDepartment?: (departmentId: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [deleting, setDeleting] = useState<AdminEventListItemDto | null>(null);

  return (
    <>
      {/* Ohne overflow-hidden, sonst schneidet die Karte das Aktionsmenü ab */}
      <Card>
        <ul className="divide-y divide-line">
          {items.map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-4 py-3.5 sm:items-center sm:px-5">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <span className="min-w-0">
                  <a
                    href={departmentUrl(event.departmentSlug, `/events/${event.slug}`, event.departmentOrganization)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-semibold text-fg hover:text-accent hover:underline"
                  >
                    {event.title}
                  </a>
                  <span className="tabular block truncate text-xs text-fg-subtle">
                    {formatEventRange(event.startDate, event.endDate)}
                    {showDepartment && (
                      <>
                        {' · '}
                        {onOpenDepartment ? (
                          <button
                            type="button"
                            onClick={() => onOpenDepartment(event.departmentId)}
                            className="font-medium text-fg-muted hover:text-accent hover:underline"
                          >
                            {event.departmentName}
                          </button>
                        ) : (
                          event.departmentName
                        )}
                      </>
                    )}
                    {' · '}
                    {event.shiftCount} Schichten · {event.organizerCount} im OK
                  </span>
                </span>
                <EventStatus event={event} />
                <span className="hidden lg:block">
                  <Fill event={event} />
                </span>
              </div>
              <EventActions event={event} onChanged={onChanged} onDelete={setDeleting} />
            </li>
          ))}
        </ul>
      </Card>

      <TypedConfirmDialog
        open={Boolean(deleting)}
        title={deleting ? `«${deleting.title}» löschen?` : ''}
        expected={deleting?.slug ?? ''}
        confirmLabel="Anlass endgültig löschen"
        description={
          deleting && (
            <>
              Der Anlass wird mit allen {deleting.shiftCount} Schichten, {deleting.signupCount} Eintragungen, dem OK,
              Fragen, Zugangs-Links, Protokoll und Nachrichten gelöscht. Das lässt sich nicht rückgängig machen.
            </>
          )
        }
        onClose={() => setDeleting(null)}
        onConfirm={async (typed) => {
          if (!deleting) return;
          await send(`/api/admin/events/${deleting.id}`, 'DELETE', { confirm: typed });
          toast({ title: 'Anlass gelöscht', description: deleting.title, tone: 'success' });
          setDeleting(null);
          onChanged();
        }}
      />
    </>
  );
}

export function EventsPanel({
  departments: allDepartments,
  onOpenDepartment,
  orgFilter = 'ALL',
}: {
  departments: AdminDepartmentListItemDto[];
  onOpenDepartment?: (departmentId: string) => void;
  /** Verbandsfilter oben im Portal */
  orgFilter?: OrgFilter;
}) {
  const departments = allDepartments.filter((d) => matchesOrg(d.organization, orgFilter));
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState<When>('upcoming');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminEventListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Gewählte Abteilung passt nicht mehr zum neuen Verband: zurücksetzen
  useEffect(() => setPage(1), [orgFilter]);
  useEffect(() => {
    setDepartmentId((current) =>
      current && !allDepartments.some((d) => d.id === current && matchesOrg(d.organization, orgFilter)) ? '' : current
    );
  }, [orgFilter, allDepartments]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ when, page: String(page), pageSize: String(PAGE_SIZE) });
    if (orgFilter !== 'ALL') params.set('organization', orgFilter);
    if (query) params.set('q', query);
    if (departmentId) params.set('departmentId', departmentId);
    setLoading(true);
    api<AdminEventListDto>(`/api/admin/events?${params}`, { signal: controller.signal })
      .then((result) => {
        setData(result);
        setError(null);
        if (result.page > result.pageCount) setPage(result.pageCount);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, when, departmentId, page, reload, orgFilter]);

  const items = data?.items ?? [];
  const filtered = Boolean(query || departmentId);

  const handleExport = () => {
    if (!items.length) return;
    const rows = items.map((e) => {
      const pct = e.slotCount > 0 ? Math.round((Math.min(e.signupCount, e.slotCount) / e.slotCount) * 100) : 0;
      return {
        'Titel': e.title,
        'Verband': organizationLabel(e.departmentOrganization),
        'Abteilung': e.departmentName,
        'Kürzel': e.slug,
        'Start': e.startDate,
        'Ende': e.endDate,
        'Status': !e.isPublished ? 'Entwurf' : new Date(e.endDate).getTime() < Date.now() ? 'Vorbei' : 'Aktiv',
        'Eintragen offen': e.allowPublicSignup ? 'Ja' : 'Nein',
        'Zugang': accessLabel(e.accessType),
        'Schichten': e.shiftCount,
        'Plätze total': e.slotCount,
        'Eintragungen': e.signupCount,
        'Belegung (%)': pct,
        'OK-Mitglieder': e.organizerCount,
      };
    });
    downloadCsv(rows, `anlaesse_${when}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

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
              placeholder="Anlass, Kürzel oder Abteilung"
              aria-label="Anlässe suchen"
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
          <div className="md:w-64">
            <Select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              aria-label="Abteilung"
            >
              <option value="">Alle Abteilungen</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChipRow>
            {(
              [
                ['upcoming', 'Kommend & laufend'],
                ['drafts', 'Entwürfe'],
                ['urgent', 'Dringend (< 50%)'],
                ['signup_closed', 'Eintragen zu'],
                ['past', 'Vorbei'],
                ['all', 'Alle'],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                selected={when === id}
                onClick={() => {
                  setWhen(id);
                  setPage(1);
                }}
              >
                {label}
              </Chip>
            ))}
          </ChipRow>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExport}
            disabled={items.length === 0}
            title="Angezeigte Anlässe als CSV herunterladen"
          >
            <Download className="size-3.5" aria-hidden />
            Export (CSV)
          </Button>
        </div>
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

      {loading && !data ? (
        <Card className="divide-y divide-line overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="ml-auto hidden h-4 w-40 md:block" />
            </div>
          ))}
        </Card>
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={<CalendarX2 />}
          title="Keine Anlässe"
          description={
            filtered ? 'Mit dieser Suche gibt es keine Treffer.' : when === 'upcoming' ? 'Gerade steht nichts an.' : 'Noch keine Anlässe.'
          }
          action={
            filtered ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setDepartmentId('');
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn('transition-opacity duration-200', loading && 'opacity-60')} aria-busy={loading}>
          <EventRows items={items} onOpenDepartment={onOpenDepartment} onChanged={() => setReload((n) => n + 1)} />
        </div>
      )}

      {data && data.pageCount > 1 && (
        <nav aria-label="Seiten" className="flex items-center justify-between gap-3">
          <p className="tabular text-[13px] text-fg-muted">{data.total.toLocaleString('de-CH')} Anlässe</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={loading || data.page <= 1} onClick={() => setPage((p) => p - 1)}>
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
