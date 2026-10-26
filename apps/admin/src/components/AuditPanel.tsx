'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GitMerge,
  History,
  RotateCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { Badge, Button, Callout, Card, Chip, ChipRow, EmptyState, Skeleton, cn } from '@schichtplan/ui';
import {
  DEPARTMENT_PERMISSIONS,
  isDepartmentPermission,
  type AdminAuditEntryDto,
  type AdminAuditListDto,
} from '@schichtplan/shared';
import { api, errorMessage } from '../lib/api';
import { departmentRoleLabels, formatDateTime } from '../lib/format';

type Filter = 'all' | 'USER' | 'DEPARTMENT' | 'EVENT';

const actionLabels: Record<string, string> = {
  DEPARTMENT_CREATE: 'Abteilung angelegt',
  DEPARTMENT_UPDATE: 'Abteilung geändert',
  DEPARTMENT_DELETE: 'Abteilung gelöscht',
  MEMBER_ROLE_SET: 'Abteilungsrolle gesetzt',
  MEMBER_ROLE_REMOVE: 'Abteilungsrolle entfernt',
  EVENT_UPDATE: 'Anlass geändert',
  EVENT_DELETE: 'Anlass gelöscht',
  USER_ADMIN_GRANT: 'Globale Admin-Rechte vergeben',
  USER_ADMIN_REVOKE: 'Globale Admin-Rechte entzogen',
  USER_HOME_DEPARTMENT_SET: 'Heimabteilung geändert',
  USER_MERGE: 'Konten zusammengeführt',
  USER_DELETE: 'Konto gelöscht',
};

function ActionIcon({ action }: { action: string }) {
  const danger = action.endsWith('_DELETE') || action === 'USER_ADMIN_GRANT';
  const icon = action.endsWith('_DELETE') ? (
    <Trash2 />
  ) : action === 'USER_ADMIN_GRANT' ? (
    <ShieldCheck />
  ) : action === 'USER_ADMIN_REVOKE' ? (
    <ShieldOff />
  ) : action === 'USER_MERGE' ? (
    <GitMerge />
  ) : action.startsWith('MEMBER') || action === 'USER_HOME_DEPARTMENT_SET' ? (
    <UserCog />
  ) : action.startsWith('EVENT') ? (
    <CalendarDays />
  ) : (
    <Building2 />
  );
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-tile [&_svg]:size-4',
        danger ? 'bg-danger/12 text-danger-ink' : 'bg-surface-2 text-fg-muted'
      )}
    >
      {icon}
    </span>
  );
}

const role = (value: unknown) => (typeof value === 'string' ? (departmentRoleLabels[value] ?? value) : 'keine');
const stringList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const permLabel = (p: string) => (isDepartmentPermission(p) ? DEPARTMENT_PERMISSIONS[p].label : p);

/** Kurze, lesbare Zusammenfassung der gespeicherten Details */
function summary(entry: AdminAuditEntryDto): string | null {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'MEMBER_ROLE_SET': {
      const base = `${d.departmentName}: ${role(d.before)} → ${role(d.role)}`;
      const beforePerms = stringList(d.permissionsBefore);
      const afterPerms = stringList(d.permissions);
      const permChanges = [
        ...afterPerms.filter((x) => !beforePerms.includes(x)).map((x) => `+ ${permLabel(x)}`),
        ...beforePerms.filter((x) => !afterPerms.includes(x)).map((x) => `− ${permLabel(x)}`),
      ].join(' · ');
      return permChanges ? `${base} (${permChanges})` : base;
    }
    case 'MEMBER_ROLE_REMOVE':
      return `${d.departmentName}: ${role(d.before)} entfernt`;
    case 'DEPARTMENT_DELETE':
      return `${d.events ?? 0} Anlässe, ${d.members ?? 0} Rollen`;
    case 'DEPARTMENT_UPDATE': {
      const changes = (d.changes ?? {}) as Record<string, unknown>;
      const before = (d.before ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (changes.slug && changes.slug !== before.slug) parts.push(`Subdomain ${before.slug} → ${changes.slug}`);
      if (changes.name && changes.name !== before.name) parts.push(`Name ${before.name} → ${changes.name}`);
      if ('ceviDbGroupId' in changes && changes.ceviDbGroupId !== before.ceviDbGroupId)
        parts.push(`Ortsgruppe ${before.ceviDbGroupId ?? '–'} → ${changes.ceviDbGroupId ?? '–'}`);
      if ('membersOnly' in changes && changes.membersOnly !== before.membersOnly)
        parts.push(changes.membersOnly ? 'Startseite nur für Mitglieder' : 'Startseite öffentlich');
      return parts.length ? parts.join(' · ') : 'Einstellungen gespeichert';
    }
    case 'EVENT_UPDATE': {
      const changes = (d.changes ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if ('isPublished' in changes) parts.push(changes.isPublished ? 'veröffentlicht' : 'als Entwurf versteckt');
      if ('allowPublicSignup' in changes) parts.push(changes.allowPublicSignup ? 'Eintragen geöffnet' : 'Eintragen geschlossen');
      return parts.join(' · ') || null;
    }
    case 'USER_HOME_DEPARTMENT_SET':
      return `${d.before ?? 'Keine'} → ${d.after ?? 'Keine'}`;
    case 'USER_MERGE':
      return `Übernommen aus: ${d.sourceLabel ?? d.sourceId}${d.sourceEmail ? ` (${d.sourceEmail})` : ''}`;
    case 'USER_DELETE':
      return typeof d.email === 'string' ? d.email : null;
    default:
      return null;
  }
}

export function AuditPanel({
  targetFilter,
  onClearTargetFilter,
  onOpenDepartment,
  onOpenUserById,
}: {
  targetFilter?: { id: string; label: string } | null;
  onClearTargetFilter?: () => void;
  onOpenDepartment?: (departmentId: string) => void;
  onOpenUserById?: (userId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminAuditListDto | null>(null);
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

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (filter !== 'all') params.set('targetType', filter);
    if (targetFilter?.id) params.set('targetId', targetFilter.id);
    if (query) params.set('q', query);
    setLoading(true);
    api<AdminAuditListDto>(`/api/admin/audit?${params}`, { signal: controller.signal })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, targetFilter?.id, query, page, reload]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Person, Abteilung, Anlass oder Admin suchen"
            aria-label="Protokoll durchsuchen"
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

        <div className="flex flex-wrap items-center gap-2">
          <ChipRow>
            {(
              [
                ['all', 'Alle'],
                ['USER', 'Personen & Rollen'],
                ['DEPARTMENT', 'Abteilungen'],
                ['EVENT', 'Anlässe'],
              ] as const
            ).map(([id, label]) => (
              <Chip
                key={id}
                selected={filter === id}
                onClick={() => {
                  setFilter(id);
                  setPage(1);
                }}
              >
                {label}
              </Chip>
            ))}
          </ChipRow>

          {targetFilter && (
            <Badge tone="accent" className="gap-1.5 pl-2.5 pr-1.5 py-1">
              <span>Gefiltert nach: {targetFilter.label}</span>
              {onClearTargetFilter && (
                <button
                  type="button"
                  onClick={onClearTargetFilter}
                  aria-label="Filter aufheben"
                  className="rounded-full p-0.5 hover:bg-black/10"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </Badge>
          )}
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
        <Skeleton className="h-64 rounded-card" />
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={<History />}
          title="Keine Einträge gefunden"
          description={
            query || filter !== 'all' || targetFilter
              ? 'Mit dieser Suche oder diesem Filter gibt es keine Protokoll-Einträge.'
              : 'Hier erscheint jede Änderung im Admin-Portal.'
          }
          action={
            query || filter !== 'all' || targetFilter ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                  onClearTargetFilter?.();
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', loading && 'opacity-60')}>
          <ul className="divide-y divide-line">
            {items.map((entry) => {
              const detail = summary(entry);
              const canOpenTarget =
                Boolean(entry.targetId) &&
                !entry.action.endsWith('_DELETE') &&
                ((entry.targetType === 'DEPARTMENT' && Boolean(onOpenDepartment)) ||
                  (entry.targetType === 'USER' && Boolean(onOpenUserById)));
              return (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <ActionIcon action={entry.action} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">
                      <span className="font-semibold">{actionLabels[entry.action] ?? entry.action}</span>
                      {': '}
                      {canOpenTarget ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!entry.targetId) return;
                            if (entry.targetType === 'DEPARTMENT') onOpenDepartment?.(entry.targetId);
                            else if (entry.targetType === 'USER') onOpenUserById?.(entry.targetId);
                          }}
                          className="font-medium text-accent-ink hover:underline"
                        >
                          {entry.targetLabel}
                        </button>
                      ) : (
                        entry.targetLabel
                      )}
                    </span>
                    {detail && <span className="block truncate text-xs text-fg-muted">{detail}</span>}
                    <span className="block text-xs text-fg-subtle">von {entry.adminName}</span>
                  </span>
                  <span className="tabular shrink-0 text-right font-mono text-xs text-fg-subtle">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {data && data.pageCount > 1 && (
        <nav aria-label="Seiten" className="flex items-center justify-between gap-3">
          <p className="tabular text-[13px] text-fg-muted">{data.total.toLocaleString('de-CH')} Einträge</p>
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
