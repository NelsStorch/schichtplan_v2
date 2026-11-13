'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  GitMerge,
  MailWarning,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Avatar, Badge, Button, Callout, Card, EmptyState, Skeleton, useToast } from '@schichtplan/ui';
import {
  getOrganizationByDbType,
  type AdminDashboardDto,
  type AdminDepartmentListItemDto,
  type AdminOverviewDto,
  type AdminUserListItemDto,
  type OrganizationType,
} from '@schichtplan/shared';
import { api, departmentUrl, errorMessage, send } from '../lib/api';
import { formatDate, formatEventRange, fullName } from '../lib/format';
import { ORGANIZATION_TYPES, matchesOrg, organizationLabel, type OrgFilter } from '../lib/organizations';
import { LoginMethodBadges } from './LoginMethodBadges';

export type AdminTab = 'uebersicht' | 'abteilungen' | 'anlaesse' | 'personen' | 'statistik' | 'protokoll';

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

function formatUptime(seconds?: number): string {
  if (!seconds) return '';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} T. ${hours} Std.`;
  if (hours > 0) return `${hours} Std. ${minutes} Min.`;
  return `${minutes} Min.`;
}

/** Gehört die Person zum Verband (Hitobito-Konto oder Rolle in einer Abteilung des Verbands)? */
function userMatchesOrg(user: AdminUserListItemDto, filter: OrgFilter) {
  if (filter === 'ALL') return true;
  if (filter !== 'OTHER' && user.providerId && user.provider === filter) return true;
  return user.memberships.some((m) => (m.departmentOrganization ?? 'CEVI') === filter);
}

/** Kennzahlen je Verband aus der Abteilungsliste */
function OrganizationsOverview({
  departments,
  onSelect,
}: {
  departments: AdminDepartmentListItemDto[] | null;
  onSelect: (org: OrganizationType) => void;
}) {
  return (
    <section>
      <SectionHeader title="Verbände" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ORGANIZATION_TYPES.map((type) => {
          const org = getOrganizationByDbType(type);
          const list = departments?.filter((d) => matchesOrg(d.organization, type));
          const sum = (pick: (d: AdminDepartmentListItemDto) => number) => list?.reduce((n, d) => n + pick(d), 0);
          const withoutLeader = list?.filter((d) => d.leaders.length === 0).length ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="rounded-card border border-line bg-surface p-4 text-left transition hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20"
            >
              <span className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={org.logoUrl} alt="" className="size-7 shrink-0 object-contain" />
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-semibold text-fg">{organizationLabel(type, true)}</span>
                  <span className="block truncate font-mono text-2xs text-fg-subtle">{org.domain}</span>
                </span>
              </span>
              <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    [org.unitTermPlural, list?.length],
                    ['Kommend', sum((d) => d.upcomingEventCount)],
                    ['Einträge', sum((d) => d.signupCount)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-tile bg-surface-2 px-1 py-2">
                    <dd className="font-display text-base font-bold leading-none text-fg">
                      {value === undefined ? '–' : value.toLocaleString('de-CH')}
                    </dd>
                    <dt className="mt-1 truncate text-2xs text-fg-subtle">{label}</dt>
                  </div>
                ))}
              </dl>
              {withoutLeader > 0 && (
                <span className="mt-3 inline-flex items-center gap-1 text-2xs font-semibold text-warning-ink">
                  <AlertTriangle className="size-3" aria-hidden />
                  {withoutLeader} ohne Leitung
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function DashboardPanel({
  overview,
  departments = null,
  orgFilter = 'ALL',
  onOrgFilter,
  onNavigate,
  onOpenDepartment,
  onOpenUser,
}: {
  overview: AdminOverviewDto | null;
  departments?: AdminDepartmentListItemDto[] | null;
  /** Verbandsfilter oben im Portal */
  orgFilter?: OrgFilter;
  onOrgFilter?: (next: OrgFilter) => void;
  onNavigate: (tab: AdminTab) => void;
  onOpenDepartment: (id: string) => void;
  onOpenUser: (user: AdminUserListItemDto) => void;
}) {
  const toast = useToast();
  const [rawData, setData] = useState<AdminDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testingAlert, setTestingAlert] = useState(false);

  useEffect(() => {
    api<AdminDashboardDto>('/api/admin/dashboard')
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const testServerAlert = async () => {
    setTestingAlert(true);
    try {
      const res = await send<{
        ok: boolean;
        result: { sent: boolean; webhookSent?: boolean; emailSent?: boolean; reason?: string };
      }>('/api/admin/alert-test', 'POST');
      const { result } = res;
      if (result.sent) {
        const channels = [result.webhookSent && 'Webhook', result.emailSent && 'E-Mail'].filter(Boolean).join(' & ');
        toast({
          title: 'Test-Alarm gesendet',
          description: `Erfolgreich über ${channels} zugestellt.`,
          tone: 'success',
        });
      } else {
        toast({
          title: 'Kein Alarm versendet',
          description: result.reason || 'Weder Webhook noch Alert-E-Mail konfiguriert.',
          tone: 'error',
        });
      }
    } catch (err) {
      toast({
        title: 'Test-Alarm fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setTestingAlert(false);
    }
  };

  // Mit Verbandsfilter nur Einträge dieses Verbands zeigen
  const data = useMemo<AdminDashboardDto | null>(() => {
    if (!rawData || orgFilter === 'ALL') return rawData;
    const orgOf = new Map((departments ?? []).map((d) => [d.id, d.organization] as const));
    const deptOk = (id: string) => matchesOrg(orgOf.get(id), orgFilter);
    return {
      ...rawData,
      criticalEvents: rawData.criticalEvents?.filter((e) => matchesOrg(e.departmentOrganization, orgFilter)),
      departmentsWithoutLeader: rawData.departmentsWithoutLeader?.filter((d) => deptOk(d.id)),
      departmentsWithoutContact: rawData.departmentsWithoutContact?.filter((d) => deptOk(d.id)),
      inactiveDepartments: rawData.inactiveDepartments?.filter((d) => deptOk(d.id)),
      upcomingEvents: rawData.upcomingEvents.filter((e) => matchesOrg(e.departmentOrganization, orgFilter)),
      recentUsers: rawData.recentUsers.filter((u) => userMatchesOrg(u, orgFilter)),
    };
  }, [rawData, orgFilter, departments]);

  // Kennzahlen eines einzelnen Verbands aus der Abteilungsliste
  const orgDepartments = orgFilter === 'ALL' ? null : (departments ?? []).filter((d) => matchesOrg(d.organization, orgFilter));
  const orgSum = (pick: (d: AdminDepartmentListItemDto) => number) =>
    departments ? orgDepartments?.reduce((n, d) => n + pick(d), 0) : undefined;

  const hasActionableItems =
    data &&
    ((data.criticalEvents && data.criticalEvents.length > 0) ||
      (data.departmentsWithoutLeader && data.departmentsWithoutLeader.length > 0) ||
      (data.departmentsWithoutContact && data.departmentsWithoutContact.length > 0) ||
      (data.failedMessages7d !== undefined && data.failedMessages7d > 0) ||
      (data.potentialDuplicatesCount !== undefined && data.potentialDuplicatesCount > 0));

  return (
    <div className="space-y-8">
      {/* Kennzahlen */}
      <Card className="overflow-hidden">
        {orgFilter === 'ALL' ? (
          <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 lg:grid-cols-6 [&>div]:bg-surface">
            <Stat label="Personen" value={overview?.users} />
            <Stat label="Neu in 7 Tagen" value={overview?.newUsers7d} />
            <Stat label="Abteilungen" value={overview?.departments} />
            <Stat label="Anlässe" value={overview?.events} />
            <Stat label="Eintragungen" value={overview?.signups} />
            <Stat label="Eintragungen 7 Tage" value={rawData?.signups7d} />
          </dl>
        ) : (
          <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 lg:grid-cols-5 [&>div]:bg-surface">
            <Stat
              label={getOrganizationByDbType(orgFilter).unitTermPlural}
              value={departments ? orgDepartments?.length : undefined}
            />
            <Stat label="Personen mit Heim" value={orgSum((d) => d.homeUserCount)} hint="Heim-Abteilung in diesem Verband" />
            <Stat label="Anlässe" value={orgSum((d) => d.eventCount)} />
            <Stat label="Kommende Anlässe" value={orgSum((d) => d.upcomingEventCount)} />
            <Stat label="Eintragungen" value={orgSum((d) => d.signupCount)} />
          </dl>
        )}
      </Card>

      {orgFilter === 'ALL' && onOrgFilter && (
        <OrganizationsOverview
          departments={departments}
          onSelect={(type) => {
            onOrgFilter(type);
            onNavigate('abteilungen');
          }}
        />
      )}

      {/* System-Health & Alarme */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Activity className="size-4 text-accent-ink" aria-hidden />
            System-Status
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
            <CheckCircle2 className="size-3.5 text-success-ink" />
            Datenbank verbunden
          </span>
          {data?.systemHealth?.uptimeSeconds && (
            <span className="text-xs text-fg-subtle">
              Uptime: {formatUptime(data.systemHealth.uptimeSeconds)}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={testServerAlert} disabled={testingAlert}>
          <BellRing className="size-4" aria-hidden />
          {testingAlert ? 'Wird gesendet …' : 'Server-Alarm testen'}
        </Button>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {/* Akuter Handlungsbedarf */}
      {hasActionableItems && (
        <section className="space-y-3 rounded-card border border-warning/30 bg-warning/5 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-fg">
            <AlertCircle className="size-4 text-warning-ink" aria-hidden />
            <h3>Akuter Handlungsbedarf</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Kritische Anlässe */}
            {data?.criticalEvents?.map((ce) => (
              <div
                key={ce.id}
                className="flex flex-col justify-between rounded-field border border-warning/30 bg-surface p-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={ce.reason === 'UNPUBLISHED_SOON' ? 'danger' : 'warning'}>
                      {ce.reason === 'UNPUBLISHED_SOON' ? 'Entwurf kurz vor Start' : 'Unterbelegt (< 30%)'}
                    </Badge>
                    <span className="tabular text-2xs text-fg-subtle">{formatDate(ce.startDate)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-fg truncate" title={ce.title}>
                    {ce.title}
                  </p>
                  <p className="text-xs text-fg-muted truncate">{ce.departmentName}</p>
                  {ce.slotCount > 0 && (
                    <p className="mt-1 text-2xs text-fg-subtle tabular">
                      {ce.signupCount} von {ce.slotCount} Schichten belegt ({ce.fillPct}%)
                    </p>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2">
                  <a
                    href={departmentUrl(ce.departmentSlug, `/events/${ce.slug}/ok`, ce.departmentOrganization)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
                  >
                    OK-Bereich
                    <ArrowUpRight className="size-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenDepartment(ce.departmentId)}
                    className="text-2xs text-fg-muted hover:underline"
                  >
                    Abteilung öffnen
                  </button>
                </div>
              </div>
            ))}

            {/* Mögliche Dubletten */}
            {data?.potentialDuplicatesCount !== undefined && data.potentialDuplicatesCount > 0 && (
              <div className="flex flex-col justify-between rounded-field border border-accent/30 bg-surface p-3">
                <div>
                  <Badge tone="accent">
                    <GitMerge className="size-3" />
                    Datenqualität
                  </Badge>
                  <p className="mt-2 text-sm font-semibold text-fg">
                    {data.potentialDuplicatesCount} mögliche Dubletten gefunden
                  </p>
                  <p className="text-xs text-fg-muted">
                    Gleicher Spitzname + Geburtsdatum oder E-Mail bei unterschiedlichen Konten (alle Verbände).
                  </p>
                </div>
                <div className="mt-3 border-t border-line/50 pt-2 text-right">
                  <button
                    type="button"
                    onClick={() => onNavigate('personen')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
                  >
                    Dubletten prüfen
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Fehlgeschlagene E-Mails */}
            {data?.failedMessages7d !== undefined && data.failedMessages7d > 0 && (
              <div className="flex flex-col justify-between rounded-field border border-danger/30 bg-surface p-3">
                <div>
                  <Badge tone="danger">
                    <MailWarning className="size-3" />
                    Zustellung
                  </Badge>
                  <p className="mt-2 text-sm font-semibold text-fg">
                    {data.failedMessages7d} E-Mails fehlgeschlagen
                  </p>
                  <p className="text-xs text-fg-muted">
                    In den letzten 7 Tagen konnten OK-Nachrichten nicht zugestellt werden.
                  </p>
                </div>
                <div className="mt-3 border-t border-line/50 pt-2 text-right">
                  <button
                    type="button"
                    onClick={() => onNavigate('statistik')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
                  >
                    Statistik öffnen
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Abteilungen ohne Leitung oder ohne Kontakt */}
          {((data?.departmentsWithoutLeader && data.departmentsWithoutLeader.length > 0) ||
            (data?.departmentsWithoutContact && data.departmentsWithoutContact.length > 0)) && (
            <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-warning/20">
              {data?.departmentsWithoutLeader.map((d) => (
                <button
                  key={`no-lead-${d.id}`}
                  type="button"
                  onClick={() => onOpenDepartment(d.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-surface px-3 py-1 text-xs font-semibold text-fg hover:border-warning"
                >
                  <AlertTriangle className="size-3 text-warning-ink" aria-hidden />
                  <span>{d.name}: Keine Leitung</span>
                </button>
              ))}
              {data?.departmentsWithoutContact?.map((d) => (
                <button
                  key={`no-contact-${d.id}`}
                  type="button"
                  onClick={() => onOpenDepartment(d.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-fg hover:border-line-strong"
                >
                  <span>{d.name}: Keine Kontaktperson</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Inaktive Abteilungen */}
      {data?.inactiveDepartments && data.inactiveDepartments.length > 0 && (
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
                    <li key={e.id} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <a
                            href={departmentUrl(e.departmentSlug, `/events/${e.slug}`, e.departmentOrganization)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 truncate text-sm font-semibold text-fg hover:text-accent hover:underline"
                          >
                            <span className="truncate">{e.title}</span>
                            <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                          </a>
                          {!e.isPublished && <Badge tone="warning">Entwurf</Badge>}
                        </span>
                        <span className="tabular block truncate text-xs text-fg-subtle">
                          {formatEventRange(e.startDate, e.endDate)}
                          {' · '}
                          <button
                            type="button"
                            onClick={() => onOpenDepartment(e.departmentId)}
                            className="font-medium text-fg-muted hover:text-accent hover:underline"
                          >
                            {e.departmentName}
                          </button>
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
                          {u.memberships[0]?.departmentName ?? u.homeDepartmentName ?? 'Ohne Abteilung'} · {formatDate(u.createdAt)}
                        </span>
                      </span>
                      <span className="hidden sm:block">
                        <LoginMethodBadges methods={u.loginMethods} provider={u.provider} />
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
