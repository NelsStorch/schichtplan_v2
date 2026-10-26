'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Callout, Chip, ChipRow, Select, Skeleton } from '@schichtplan/ui';
import {
  STATS_RANGES,
  STATS_RETENTION,
  USAGE_METRICS,
  USAGE_METRIC_GROUPS,
  type AdminDepartmentListItemDto,
  type AdminStatsFeaturesDto,
  type AdminStatsMetricDto,
  type AdminStatsSystemDto,
  type AdminStatsUsageDto,
  type StatsRange,
  type UsageMetricDef,
  type UsageMetricGroup,
  type UsageMetricKey,
} from '@schichtplan/shared';
import { api, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Breakdown, ChartCard, DailyBars, StatGrid, StatTile, fmtNumber, formatBytes } from './stats/Charts';

type View = 'nutzung' | 'funktionen' | 'anlaesse' | 'betrieb';

const VIEWS: { id: View; label: string }[] = [
  { id: 'nutzung', label: 'Nutzung' },
  { id: 'funktionen', label: 'Funktionen' },
  { id: 'anlaesse', label: 'Anlässe' },
  { id: 'betrieb', label: 'Betrieb' },
];

const RANGE_LABELS: Record<StatsRange, string> = { 7: '7 Tage', 30: '30 Tage', 90: '90 Tage', 365: '1 Jahr' };

const def = (key: UsageMetricKey): UsageMetricDef => USAGE_METRICS[key];

/** Unterteilungen einer Kennzahl mit Bezeichnung */
function dimItems(m: AdminStatsMetricDto | undefined) {
  if (!m) return [];
  const labels = def(m.metric).dims ?? {};
  return m.byDim.map((d) => ({ key: d.dim || '-', label: labels[d.dim] ?? (d.dim ? `/${d.dim}` : 'gesamt'), count: d.total }));
}

function MetricCard({ m }: { m: AdminStatsMetricDto }) {
  const d = def(m.metric);
  const split = Boolean(d.dims || d.openDim);
  return (
    <ChartCard title={d.label}>
      <p className="font-display text-2xl font-bold leading-none tracking-tight text-fg tabular">{fmtNumber(m.total)}</p>
      {split && m.total > 0 && (
        <div className="mt-4">
          <Breakdown items={dimItems(m)} limit={d.openDim ? 8 : 6} />
        </div>
      )}
    </ChartCard>
  );
}

function MetricGroup({
  usage,
  group,
  exclude = [],
}: {
  usage: AdminStatsUsageDto;
  group: UsageMetricGroup;
  exclude?: UsageMetricKey[];
}) {
  const metrics = usage.metrics.filter((m) => def(m.metric).group === group && !exclude.includes(m.metric));
  const used = metrics.filter((m) => m.total > 0);
  const unused = metrics.filter((m) => m.total === 0);
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-fg">{USAGE_METRIC_GROUPS[group]}</h2>
      {used.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {used.map((m) => (
            <MetricCard key={m.metric} m={m} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-subtle">Im Zeitraum noch nichts gezählt.</p>
      )}
      {unused.length > 0 && (
        <p className="mt-3 text-xs text-fg-subtle">
          Im Zeitraum nicht benutzt: {unused.map((m) => def(m.metric).label).join(' · ')}
        </p>
      )}
    </section>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-48 rounded-card" />
      ))}
    </div>
  );
}

function UsageView({ usage, days }: { usage: AdminStatsUsageDto; days: StatsRange }) {
  const metric = (key: UsageMetricKey) => usage.metrics.find((m) => m.metric === key);
  const departments = [...usage.departments].sort((a, b) => b.active30 - a.active30 || a.name.localeCompare(b.name, 'de'));
  return (
    <div className="space-y-8">
      <StatGrid>
        <StatTile label="Aktiv heute" value={usage.active.today} />
        <StatTile label="Aktiv in 7 Tagen" value={usage.active.last7} />
        <StatTile label="Aktiv in 30 Tagen" value={usage.active.last30} />
        <StatTile label={usage.departmentId ? 'Konten mit dieser Heimabteilung' : 'Konten'} value={usage.active.accounts} />
        <StatTile label={`Anmeldungen (${RANGE_LABELS[days]})`} value={metric('LOGIN')?.total ?? 0} />
        <StatTile label={`Neue Konten (${RANGE_LABELS[days]})`} value={metric('REGISTER')?.total ?? 0} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Aktive Personen pro Tag"
          description="Personen, die an diesem Tag angemeldet etwas aufgerufen haben. Mit Abteilung: nach Heimabteilung."
        >
          <DailyBars days={usage.days} values={metric('ACTIVE_USER')?.daily ?? []} label="Aktive Personen pro Tag" />
        </ChartCard>
        <ChartCard title="Anmeldungen pro Tag">
          <DailyBars days={usage.days} values={metric('LOGIN')?.daily ?? []} label="Anmeldungen pro Tag" />
        </ChartCard>
      </div>

      <MetricGroup usage={usage} group="KONTEN" exclude={['ACTIVE_USER']} />

      {!usage.departmentId && departments.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-fg">Abteilungen</h2>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-line text-left text-xs text-fg-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Abteilung</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Heimabteilung von</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Aktiv (30 Tage)</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Anmeldungen</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Eintragungen</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Anlässe erstellt</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Nachrichten</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Seiten geladen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular">
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-2.5 font-medium text-fg">{d.name}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(d.homeUsers)}</td>
                    <td className="px-3 py-2.5 text-right text-fg">{fmtNumber(d.active30)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(d.logins)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(d.signups)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(d.eventsCreated)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(d.messages)}</td>
                    <td className="px-5 py-2.5 text-right text-fg-muted">{fmtNumber(d.pageLoads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            «Aktiv» gilt immer für die letzten 30 Tage, die anderen Spalten für den gewählten Zeitraum.
          </p>
        </section>
      )}
    </div>
  );
}

function FunctionsView({ usage }: { usage: AdminStatsUsageDto }) {
  const signups = usage.metrics.find((m) => m.metric === 'SIGNUP');
  return (
    <div className="space-y-8">
      <ChartCard title="Eintragungen pro Tag">
        <DailyBars days={usage.days} values={signups?.daily ?? []} label="Eintragungen pro Tag" />
      </ChartCard>
      <MetricGroup usage={usage} group="ANLAESSE" />
      <MetricGroup usage={usage} group="BROWSER" />
      <MetricGroup usage={usage} group="HILFE" />
      <p className="text-xs leading-relaxed text-fg-subtle">
        Browser-Meldungen fehlen von Personen, die «nicht verfolgen» (GPC/DNT) eingestellt haben. Die Zahlen sind
        deshalb eher zu tief.
      </p>
    </div>
  );
}

function EventsView({ data }: { data: AdminStatsFeaturesDto }) {
  const { events } = data;
  const pct = (n: number | null) => (n === null ? null : `${n}%`);
  return (
    <div className="space-y-8">
      <StatGrid>
        <StatTile label="Anlässe (ab Zeitraum)" value={events.count} hint="Beginn im Zeitraum oder später" />
        <StatTile label="Veröffentlicht" value={events.published} />
        <StatTile label="Eintragen geschlossen" value={events.signupClosed} />
        <StatTile label="Belegung" value={pct(data.fill.avgFillPct)} hint={`${data.fill.events} beendete Anlässe`} />
        <StatTile label="Volle Schichten" value={pct(data.fill.fullShiftsPct)} />
        <StatTile
          label="OK-Grösse"
          value={data.okTeams.avgSize === null ? null : data.okTeams.avgSize.toLocaleString('de-CH')}
          hint={`${data.okTeams.events} Anlässe mit OK`}
        />
      </StatGrid>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Zugang">
          <Breakdown items={events.accessTypes} />
        </ChartCard>
        <ChartCard title="Zusätze" description="Anteil an allen Anlässen ab dem Zeitraum.">
          <Breakdown items={events.options} total={events.count} empty="Keine Zusätze genutzt." />
        </ChartCard>
        <ChartCard title="Pflichtangaben" description="Anteil an allen Anlässen ab dem Zeitraum.">
          <Breakdown items={events.requiredFields} total={events.count} empty="Keine Pflichtangaben." />
        </ChartCard>
        <ChartCard title="Anwesenheitsliste">
          <Breakdown items={events.attendanceModes} />
        </ChartCard>
        <ChartCard title="Löschfrist eigener Fragen" description="Fragen dieser Anlässe.">
          <Breakdown items={events.questionRetention} empty="Keine eigenen Fragen." />
        </ChartCard>
        <ChartCard title="Wer trägt ein?" description="Eintragungen im Zeitraum laut Protokoll.">
          <Breakdown items={data.signupsBy} />
        </ChartCard>
        <ChartCard title="Wie früh?" description="Abstand zwischen Eintragung und Schichtbeginn.">
          <Breakdown items={data.signupLead} />
        </ChartCard>
        <ChartCard title="Anwesenheit" description="Schichten im Zeitraum bei Anlässen mit Anwesenheitsliste.">
          <Breakdown
            items={data.attendance.filter((a) => !a.key.startsWith('SOURCE_'))}
            empty="Keine Anwesenheit erfasst."
          />
          {data.attendance.some((a) => a.key.startsWith('SOURCE_')) && (
            <p className="mt-3 text-xs text-fg-muted">
              {data.attendance
                .filter((a) => a.key.startsWith('SOURCE_'))
                .map((a) => `${a.label}: ${fmtNumber(a.count)}`)
                .join(' · ')}
            </p>
          )}
        </ChartCard>
        <ChartCard
          title="OK-Nachrichten"
          description={`${fmtNumber(data.messages.count)} Nachrichten an ${fmtNumber(data.messages.recipients)} Empfänger*innen${data.messages.failed ? `, ${fmtNumber(data.messages.failed)} fehlgeschlagen` : ''}.`}
        >
          <Breakdown items={data.messages.byTarget} empty="Keine Nachrichten verschickt." />
        </ChartCard>
        <ChartCard title="Rollen in den Abteilungen" description="Alle Mitgliedschaften, unabhängig vom Zeitraum.">
          <Breakdown items={data.roles} />
        </ChartCard>
      </div>
      <p className="text-xs leading-relaxed text-fg-subtle">
        Diese Auswertung kommt aus den bestehenden Daten der Anlässe, dafür wird nichts zusätzlich erhoben.
      </p>
    </div>
  );
}

type RouteSort = 'count' | 'p95Ms' | 'errors5xx';

function SystemView({ system, usage }: { system: AdminStatsSystemDto; usage: AdminStatsUsageDto | null }) {
  const [sort, setSort] = useState<RouteSort>('count');
  const { requests } = system;
  const routes = useMemo(
    () => [...requests.routes].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0) || b.count - a.count).slice(0, 25),
    [requests.routes, sort]
  );
  const snapshotRows = system.snapshots.series
    .map((s) => {
      const values = s.values.filter((v): v is number => v !== null);
      return { ...s, first: values[0] ?? null, last: values[values.length - 1] ?? null };
    })
    .filter((s) => s.last !== null);
  const fmtSnapshot = (key: string, v: number | null) =>
    v === null ? '–' : key.endsWith('.bytes') ? formatBytes(v) : fmtNumber(v);

  return (
    <div className="space-y-8">
      <StatGrid>
        <StatTile label="Anfragen" value={requests.total.count} />
        <StatTile label="Serverfehler (5xx)" value={requests.total.errors5xx} />
        <StatTile label="Versuchsbremse (429)" value={requests.total.rateLimited} />
        <StatTile label="Antwortzeit p95" value={requests.total.p95Ms === null ? null : `≤ ${requests.total.p95Ms} ms`} />
        <StatTile label="Datenbank" value={formatBytes(system.database.bytes)} />
        <StatTile label="Bilder" value={formatBytes(system.uploads.bytes)} hint={`${fmtNumber(system.uploads.count)} Dateien`} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Anfragen pro Tag" description="Ohne /health (Prüfung durch Traefik).">
          <DailyBars days={requests.days} values={requests.daily.map((d) => d.count)} label="Anfragen pro Tag" />
        </ChartCard>
        <ChartCard title="Serverfehler pro Tag" description="Antworten mit Status 500 und höher.">
          <DailyBars
            days={requests.days}
            values={requests.daily.map((d) => d.errors5xx)}
            label="Serverfehler pro Tag"
            tone="danger"
          />
        </ChartCard>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold tracking-tight text-fg">Routen</h2>
          <div className="w-52">
            <Select value={sort} onChange={(e) => setSort(e.target.value as RouteSort)} aria-label="Routen sortieren">
              <option value="count">Meiste Anfragen</option>
              <option value="p95Ms">Langsamste (p95)</option>
              <option value="errors5xx">Meiste Serverfehler</option>
            </Select>
          </div>
        </div>
        {routes.length === 0 ? (
          <p className="text-sm text-fg-subtle">Noch keine Anfragen gezählt.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-b border-line text-left text-xs text-fg-subtle">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Route</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Anfragen</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Ø ms</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">p95</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">max. ms</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">4xx</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">429</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">5xx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular">
                {routes.map((r) => (
                  <tr key={`${r.method} ${r.route}`}>
                    <td className="max-w-[24rem] truncate px-5 py-2.5 font-mono text-xs text-fg" title={r.route}>
                      <span className="mr-2 text-fg-subtle">{r.method}</span>
                      {r.route}
                    </td>
                    <td className="px-3 py-2.5 text-right text-fg">{fmtNumber(r.count)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(r.avgMs)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{r.p95Ms === null ? '–' : `≤ ${r.p95Ms}`}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(r.maxMs)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(r.client4xx)}</td>
                    <td className="px-3 py-2.5 text-right text-fg-muted">{fmtNumber(r.rateLimited)}</td>
                    <td className={`px-5 py-2.5 text-right ${r.errors5xx > 0 ? 'font-semibold text-danger-ink' : 'text-fg-muted'}`}>
                      {fmtNumber(r.errors5xx)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-fg-subtle">
          p95 ist eine Schätzung (obere Grenze der Laufzeit-Stufe, in die 95% der Anfragen fallen).
        </p>
      </section>

      {usage ? <MetricGroup usage={usage} group="BETRIEB" /> : <LoadingCards />}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Grösste Tabellen">
          <Breakdown
            items={system.database.tables.map((t) => ({
              key: t.name,
              label: `${t.name} · ${formatBytes(t.bytes)}`,
              count: t.rows,
            }))}
            empty="Keine Tabellen."
          />
          <p className="mt-3 text-xs text-fg-subtle">Balken = ungefähre Anzahl Zeilen.</p>
        </ChartCard>
        <ChartCard title="Verlauf der Bestände" description="Tägliche Momentaufnahme, erster und letzter Wert im Zeitraum.">
          {snapshotRows.length === 0 ? (
            <p className="text-sm text-fg-subtle">Die erste Momentaufnahme entsteht in der Nacht nach dem Einführen.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line tabular">
                {snapshotRows.map((s) => (
                  <tr key={s.key}>
                    <td className="py-2 pr-3 text-fg">{s.label}</td>
                    <td className="py-2 text-right text-fg-subtle">{fmtSnapshot(s.key, s.first)}</td>
                    <td className="py-2 pl-3 text-right font-semibold text-fg">{fmtSnapshot(s.key, s.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>

      <dl className="grid gap-x-6 gap-y-2 rounded-card border border-line bg-surface p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-subtle">Umgebung</dt>
          <dd className="text-fg">{system.environment}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Backend gestartet</dt>
          <dd className="text-fg">{formatDateTime(system.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Node.js</dt>
          <dd className="text-fg">{system.nodeVersion}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Speicher</dt>
          <dd className="text-fg">
            {system.memory.rssMb} MB (Heap {system.memory.heapUsedMb} MB)
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function StatsPanel({ departments }: { departments: AdminDepartmentListItemDto[] }) {
  const [view, setView] = useState<View>('nutzung');
  const [days, setDays] = useState<StatsRange>(30);
  const [departmentId, setDepartmentId] = useState('');
  const [usage, setUsage] = useState<AdminStatsUsageDto | null>(null);
  const [features, setFeatures] = useState<AdminStatsFeaturesDto | null>(null);
  const [system, setSystem] = useState<AdminStatsSystemDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Betrieb gilt für den ganzen Server, dort zählt keine Abteilung
  const scopedDepartment = view === 'betrieb' ? '' : departmentId;
  const query = `days=${days}${scopedDepartment ? `&departmentId=${encodeURIComponent(scopedDepartment)}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    setUsage(null);
    setError(null);
    api<AdminStatsUsageDto>(`/api/admin/stats/usage?${query}`)
      .then((d) => !cancelled && setUsage(d))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (view !== 'anlaesse') return;
    let cancelled = false;
    setFeatures(null);
    api<AdminStatsFeaturesDto>(`/api/admin/stats/features?${query}`)
      .then((d) => !cancelled && setFeatures(d))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [view, query]);

  useEffect(() => {
    if (view !== 'betrieb') return;
    let cancelled = false;
    setSystem(null);
    api<AdminStatsSystemDto>(`/api/admin/stats/system?days=${days}`)
      .then((d) => !cancelled && setSystem(d))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [view, days]);

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [departments]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ChipRow role="tablist" aria-label="Auswertung">
          {VIEWS.map((v) => (
            <Chip key={v.id} role="tab" aria-selected={view === v.id} selected={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Select value={days} onChange={(e) => setDays(Number(e.target.value) as StatsRange)} aria-label="Zeitraum">
              {STATS_RANGES.map((r) => (
                <option key={r} value={r}>
                  {RANGE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-60">
            <Select
              value={scopedDepartment}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={view === 'betrieb'}
              aria-label="Abteilung"
              title={view === 'betrieb' ? 'Betrieb gilt für den ganzen Server' : undefined}
            >
              <option value="">Alle Abteilungen</option>
              {sortedDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      {view === 'nutzung' && (usage ? <UsageView usage={usage} days={days} /> : !error && <LoadingCards />)}
      {view === 'funktionen' && (usage ? <FunctionsView usage={usage} /> : !error && <LoadingCards />)}
      {view === 'anlaesse' && (features ? <EventsView data={features} /> : !error && <LoadingCards />)}
      {view === 'betrieb' && (system ? <SystemView system={system} usage={usage} /> : !error && <LoadingCards />)}

      <p className="flex items-start gap-2 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Gezählt werden nur Summen pro Tag, ohne Person, IP-Adresse, Gerät oder echte Adresse der Seite. Die
          einzige Angabe pro Person ist «zuletzt aktiv» (nur das Datum). Stundenwerte bleiben{' '}
          {STATS_RETENTION.hourlyRequestDays} Tage, alles andere {Math.round(STATS_RETENTION.dailyDays / 365)} Jahre.
          Jede Umgebung (Prod, Dev) zählt in ihrer eigenen Datenbank.
        </span>
      </p>
    </div>
  );
}
