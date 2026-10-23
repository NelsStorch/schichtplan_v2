'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, ShieldCheck, Users } from 'lucide-react';
import { Avatar, Badge, Callout, Card, EmptyState, Skeleton } from '@schichtplan/ui';
import type { AdminDashboardDto, AdminOverviewDto, AdminUserListItemDto } from '@schichtplan/shared';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatEventRange, fullName } from '../lib/format';
import { LoginMethodBadges } from './LoginMethodBadges';

export type AdminTab = 'uebersicht' | 'abteilungen' | 'anlaesse' | 'personen' | 'protokoll';

function Stat({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold leading-none tracking-tight text-fg tabular">
        {value === undefined ? <Skeleton className="h-6 w-12" /> : value.toLocaleString('de-CH')}
      </dd>
      {hint && <p className="mt-1 text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-lg font-semibold tracking-tight text-fg">{title}</h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline"
        >
          {action.label}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function DashboardPanel({
  overview,
  onNavigate,
  onOpenDepartment,
  onOpenUser,
}: {
  overview: AdminOverviewDto | null;
  onNavigate: (tab: AdminTab) => void;
  onOpenDepartment: (id: string) => void;
  onOpenUser: (user: AdminUserListItemDto) => void;
}) {
  const [data, setData] = useState<AdminDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminDashboardDto>('/api/admin/dashboard')
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="space-y-8">
      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 lg:grid-cols-6 [&>div]:bg-surface">
          <Stat label="Personen" value={overview?.users} />
          <Stat label="Neu in 7 Tagen" value={overview?.newUsers7d} />
          <Stat label="Abteilungen" value={overview?.departments} />
          <Stat label="Anlässe" value={overview?.events} />
          <Stat label="Eintragungen" value={overview?.signups} />
          <Stat label="Eintragungen 7 Tage" value={data?.signups7d} />
        </dl>
      </Card>

      {error && <Callout tone="danger">{error}</Callout>}

      {data && data.departmentsWithoutLeader.length > 0 && (
        <Callout tone="warning" title="Abteilungen ohne Abteilungsleitung">
          <span className="mt-1 flex flex-wrap gap-2">
            {data.departmentsWithoutLeader.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpenDepartment(d.id)}
                className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-surface px-3 py-1 text-xs font-semibold text-fg hover:border-warning"
              >
                <AlertTriangle className="size-3.5 text-warning-ink" aria-hidden />
                {d.name}
              </button>
            ))}
          </span>
        </Callout>
      )}

      {data && data.inactiveDepartments && data.inactiveDepartments.length > 0 && (
        <Callout tone="info" title="Inaktive Abteilungen">
          <p className="mt-1 text-xs text-fg-muted">
            Keine Anlässe in den letzten 6 Monaten oder vor über 30 Tagen angelegt ohne Anlass:
          </p>
          <span className="mt-2 flex flex-wrap gap-2">
            {data.inactiveDepartments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpenDepartment(d.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-surface-2"
              >
                <span>{d.name}</span>
                <span className="font-normal text-fg-muted">
                  {d.lastEventDate ? `(Zuletzt ${formatDate(d.lastEventDate)})` : '(Noch keine Anlässe)'}
                </span>
              </button>
            ))}
          </span>
        </Callout>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <SectionHeader title="Als Nächstes" action={{ label: 'Alle Anlässe', onClick: () => onNavigate('anlaesse') }} />
          {!data ? (
            <Skeleton className="h-64 rounded-card" />
          ) : data.upcomingEvents.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Gerade steht nichts an" />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {data.upcomingEvents.map((e) => {
                  const pct = e.slotCount ? Math.round((Math.min(e.signupCount, e.slotCount) / e.slotCount) * 100) : null;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onOpenDepartment(e.departmentId)}
                        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-fg">{e.title}</span>
                            {!e.isPublished && <Badge tone="warning">Entwurf</Badge>}
                          </span>
                          <span className="tabular block truncate text-xs text-fg-subtle">
                            {formatEventRange(e.startDate, e.endDate)} · {e.departmentName}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-right text-xs text-fg-muted">
                          {pct === null ? (
                            'Keine Schichten'
                          ) : (
                            <>
                              <span className="block font-semibold text-fg">{pct}% belegt</span>
                              {e.signupCount} / {e.slotCount}
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>

        <section>
          <SectionHeader title="Neu registriert" action={{ label: 'Alle Personen', onClick: () => onNavigate('personen') }} />
          {!data ? (
            <Skeleton className="h-64 rounded-card" />
          ) : data.recentUsers.length === 0 ? (
            <EmptyState icon={<Users />} title="Noch niemand" />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {data.recentUsers.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => onOpenUser(u)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2"
                    >
                      <Avatar name={fullName(u)} size="sm" highlight={u.isGlobalAdmin} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-fg">{fullName(u)}</span>
                          {u.isGlobalAdmin && <ShieldCheck aria-label="Globale Admin" className="size-3.5 text-accent-ink" />}
                        </span>
                        <span className="block truncate text-xs text-fg-subtle">
                          {u.memberships[0]?.departmentName ?? 'Ohne Abteilung'} · {formatDate(u.createdAt)}
                        </span>
                      </span>
                      <span className="hidden sm:block">
                        <LoginMethodBadges methods={u.loginMethods} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
