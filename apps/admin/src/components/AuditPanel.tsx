'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
} from 'lucide-react';
import { Button, Callout, Card, Chip, ChipRow, EmptyState, Skeleton, cn } from '@schichtplan/ui';
import type { AdminAuditEntryDto, AdminAuditListDto } from '@schichtplan/shared';
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
  ) : action.startsWith('MEMBER') ? (
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

/** Kurze, lesbare Zusammenfassung der gespeicherten Details */
function summary(entry: AdminAuditEntryDto): string | null {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'MEMBER_ROLE_SET':
      return `${d.departmentName}: ${role(d.before)} → ${role(d.role)}`;
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
    case 'USER_DELETE':
      return typeof d.email === 'string' ? d.email : null;
    default:
      return null;
  }
}

export function AuditPanel() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminAuditListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (filter !== 'all') params.set('targetType', filter);
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
  }, [filter, page, reload]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
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
        <EmptyState icon={<History />} title="Noch keine Einträge" description="Hier erscheint jede Änderung im Admin-Portal." />
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', loading && 'opacity-60')}>
          <ul className="divide-y divide-line">
            {items.map((entry) => {
              const detail = summary(entry);
              return (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <ActionIcon action={entry.action} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">
                      <span className="font-semibold">{actionLabels[entry.action] ?? entry.action}</span>
                      {': '}
                      {entry.targetLabel}
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
