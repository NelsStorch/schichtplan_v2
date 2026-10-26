'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Info,
  Lock,
  Mail,
  Plus,
  Unlock,
  Repeat,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { EventRosterResponseDto, ShiftSignupLogDto } from '@schichtplan/shared';
import { ATTENDANCE_MODES } from '@schichtplan/shared';
import { Badge, Card, ProgressRing, buttonClasses, cn, useToast } from '@schichtplan/ui';
import { AccessTypeBadge } from '@/components/event-meta';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { ageWarnings } from '@/components/ok/shiftChecks';
import { api } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtFullDate, fmtTime, fmtWeekday, groupByBusinessDay } from '@/lib/format';

type TodoTone = 'warning' | 'info' | 'success';

interface Todo {
  tone: TodoTone;
  title: string;
  text?: string;
  href?: string;
  action?: string;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

export default function OkOverviewPage() {
  const { event, base, stats, permissions } = useOkEvent();
  const toast = useToast();
  const [roster, setRoster] = useState<EventRosterResponseDto | null>(null);
  const [logs, setLogs] = useState<ShiftSignupLogDto[] | null>(null);

  useEffect(() => {
    api<ShiftSignupLogDto[]>(`/api/events/${event.slug}/logs`)
      .then(setLogs)
      .catch(() => setLogs([]));
    if (event.minShiftsPerPerson) {
      api<EventRosterResponseDto>(`/api/events/${event.slug}/roster`)
        .then(setRoster)
        .catch(() => setRoster(null));
    }
  }, [event.slug, event.minShiftsPerPerson]);

  const days = useMemo(() => groupByBusinessDay(event.shifts, event.dayCutoffTime), [event]);
  const warnings = useMemo(() => ageWarnings(event), [event]);

  const underTarget = useMemo(() => {
    if (!roster?.minShiftsPerPerson) return null;
    const min = roster.minShiftsPerPerson;
    return roster.items.filter((i) => !i.isDeregistered && i.shiftCount < min).length;
  }, [roster]);

  const now = Date.now();
  const opensLater = event.signupOpensAt && new Date(event.signupOpensAt).getTime() > now;
  const isPast = new Date(event.endDate).getTime() < now;
  const daysUntilStart = Math.ceil((new Date(event.startDate).getTime() - now) / 86400000);

  const todos = useMemo<Todo[]>(() => {
    const list: Todo[] = [];
    if (event.shifts.length === 0) {
      list.push({
        tone: 'warning',
        title: 'Noch keine Schichten',
        text: 'Lege die erste Schicht an oder übernimm die Schichten aus einer Vorlage.',
        href: `${base}/schichten?neu=1`,
        action: 'Schicht anlegen',
      });
    }
    if (warnings.length > 0) {
      list.push({
        tone: 'warning',
        title: `Jugendschutz: ${warnings.length} Arbeit${warnings.length === 1 ? '' : 'en'} ohne volljährige Person`,
        text: warnings
          .slice(0, 3)
          .map((w) => `${w.shift.title} (${w.task.title}, ab ${w.task.minAge})`)
          .join(' · '),
        href: `${base}/schichten?warnung=1`,
        action: 'Schichten ansehen',
      });
    }
    if (event.responsibleMode === 'BY_DAY') {
      const missing = days.filter((d) => !event.dayResponsibles?.[d.key]?.length);
      if (missing.length > 0) {
        list.push({
          tone: 'warning',
          title: `${missing.length} Tag${missing.length === 1 ? '' : 'e'} ohne Tagesleitung`,
          text: missing.map((d) => `${fmtWeekday(dayKeyToIso(d.key))} ${fmtDayMonth(dayKeyToIso(d.key))}`).join(', '),
          href: `${base}/schichten`,
          action: 'Tagesleitung festlegen',
        });
      }
    }
    if (stats.freeSlots > 0 && !isPast) {
      list.push({
        tone: daysUntilStart <= 7 ? 'warning' : 'info',
        title: `${stats.freeSlots} Plätze in ${stats.openShiftCount} Schicht${stats.openShiftCount === 1 ? '' : 'en'} noch frei`,
        text:
          daysUntilStart <= 7 && daysUntilStart >= 0
            ? `Der Anlass beginnt in ${daysUntilStart} Tag${daysUntilStart === 1 ? '' : 'en'}. Eine Nachricht an die Helfenden kann helfen.`
            : 'Teile den Link zum Schichtplan oder teile Personen direkt ein.',
        href: `${base}/schichten?offen=1`,
        action: 'Offene Schichten',
      });
    }
    const replacementWanted = event.shifts.filter(
      (sh) => new Date(sh.startTime).getTime() > Date.now() && (sh.signups ?? []).some((su) => su.replacementWantedAt)
    );
    if (replacementWanted.length > 0) {
      const count = replacementWanted.reduce(
        (sum, sh) => sum + (sh.signups ?? []).filter((su) => su.replacementWantedAt).length,
        0
      );
      list.push({
        tone: 'warning',
        title: `${count} Person${count === 1 ? ' sucht' : 'en suchen'} Ersatz`,
        text: replacementWanted
          .slice(0, 3)
          .map((sh) => `${sh.title} (${fmtWeekday(sh.startTime)} ${fmtTime(sh.startTime)})`)
          .join(' · '),
        href: `/events/${event.slug}`,
        action: 'Im Schichtplan ansehen',
      });
    }
    if (underTarget) {
      list.push({
        tone: 'info',
        title: `${underTarget} Person${underTarget === 1 ? '' : 'en'} unter dem Soll`,
        text: `Soll: mindestens ${event.minShiftsPerPerson} Schichten pro Person.`,
        href: `${base}/helfende?status=offen`,
        action: 'Helfende ansehen',
      });
    }
    if (!event.allowPublicSignup) {
      list.push({
        tone: 'info',
        title: 'Eintragen ist geschlossen',
        text: 'Nur das OK und die Abteilungsleitung teilen Personen ein.',
        href: permissions.canEditSettings ? `${base}/einstellungen#eintragen` : undefined,
        action: 'Ändern',
      });
    }
    if (event.attendanceMode && event.attendanceMode !== 'OFF' && daysUntilStart <= 3 && !isPast) {
      list.push({
        tone: 'info',
        title: 'Anwesenheit vorbereiten',
        text:
          event.attendanceMode === 'OK_AND_QR'
            ? 'QR-Code für den Check-in ausdrucken und am Eingang aufhängen.'
            : 'Die Liste zum Abhaken steht unter «Anwesenheit» bereit.',
        href: `${base}/anwesenheit`,
        action: 'Zur Anwesenheit',
      });
    }
    if (isPast) {
      list.push({
        tone: 'info',
        title: 'Der Anlass ist vorbei',
        text: 'Werte die Anwesenheit aus und speichere den Plan als Vorlage fürs nächste Mal.',
        href: `${base}/schichten/vorlagen`,
        action: 'Als Vorlage speichern',
      });
    }
    if (list.length === 0) {
      list.push({
        tone: 'success',
        title: 'Alles erledigt',
        text: stats.freeSlots === 0 ? 'Alle Schichten sind besetzt.' : 'Im Moment gibt es nichts zu tun.',
      });
    }
    return list;
  }, [event, base, days, warnings, stats, underTarget, isPast, daysUntilStart, permissions.canEditSettings]);

  const copyLink = async () => {
    const url = `${window.location.origin}/events/${event.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link kopiert', description: url });
    } catch {
      toast({ title: 'Kopieren nicht möglich', description: url, tone: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <OkPageHeader
        title="Übersicht"
        description="Was am Anlass ansteht und was noch fehlt."
        help="/ok/ok-bereich/"
        actions={
          <>
            {permissions.can.SHIFTS && (
              <Link href={`${base}/schichten?neu=1`} className={buttonClasses({ size: 'sm' })}>
                <Plus className="size-4" /> Neue Schicht
              </Link>
            )}
            {permissions.can.MESSAGES && (
              <Link href={`${base}/nachrichten`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
                <Mail className="size-4" /> Nachricht
              </Link>
            )}
            <button type="button" onClick={copyLink} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
              <Copy className="size-4" /> Link kopieren
            </button>
          </>
        }
      />

      {/* Status des Anlasses */}
      <div className="flex flex-wrap items-center gap-2">
        <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} />
        {opensLater ? (
          <Badge tone="warning">
            <CalendarClock className="size-3" /> Freischaltung {fmtFullDate(event.signupOpensAt!)},{' '}
            {fmtTime(event.signupOpensAt!)}
          </Badge>
        ) : event.allowPublicSignup ? (
          <Badge tone="success">
            <Unlock className="size-3" /> Eintragen offen
          </Badge>
        ) : (
          <Badge tone="warning">
            <Lock className="size-3" /> Eintragen geschlossen
          </Badge>
        )}
        {event.attendanceMode && event.attendanceMode !== 'OFF' && (
          <Badge tone="neutral">
            <ClipboardCheck className="size-3" /> {ATTENDANCE_MODES[event.attendanceMode]}
          </Badge>
        )}
        {event.minShiftsPerPerson ? (
          <Badge tone="neutral">Soll: {event.minShiftsPerPerson} Schichten pro Person</Badge>
        ) : null}
      </div>

      {/* Kennzahlen */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-4 p-4 sm:col-span-2 xl:col-span-1">
          <ProgressRing
            value={stats.filledSlots}
            max={stats.totalSlots}
            size={76}
            stroke={8}
            label={`${stats.percentFilled}%`}
            tone={stats.totalSlots > 0 && stats.freeSlots === 0 ? 'success' : 'accent'}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Belegung</p>
            <p className="font-display text-xl font-bold text-fg">
              {stats.filledSlots} <span className="text-sm font-normal text-fg-muted">/ {stats.totalSlots} Plätze</span>
            </p>
          </div>
        </Card>
        <Stat label="Freie Plätze" value={stats.freeSlots} tone={stats.freeSlots > 0 ? 'warning' : 'success'} />
        <Stat label="Helfende" value={stats.helperCount} hint="mit mindestens einer Schicht" />
        <Stat
          label="Schichten"
          value={event.shifts.length}
          hint={`${stats.openShiftCount} noch nicht voll`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* To-dos */}
        <section aria-labelledby="todo-title" className="space-y-3">
          <h3 id="todo-title" className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
            Zu erledigen
          </h3>
          {todos.map((todo, i) => (
            <TodoCard key={i} todo={todo} />
          ))}
        </section>

        <div className="space-y-6">
          {/* Belegung pro Tag */}
          {days.length > 0 && (
            <section aria-labelledby="days-title">
              <h3 id="days-title" className="mb-3 text-sm font-bold uppercase tracking-wider text-fg-subtle">
                Belegung pro Tag
              </h3>
              <Card className="divide-y divide-line">
                {days.map((d) => {
                  const total = d.items.reduce((sum, s) => sum + s.requiredSlots, 0);
                  const filled = d.items.reduce((sum, s) => sum + Math.min(s.signups?.length ?? 0, s.requiredSlots), 0);
                  const pct = total ? Math.round((filled / total) * 100) : 0;
                  const iso = dayKeyToIso(d.key);
                  return (
                    <Link
                      key={d.key}
                      href={`${base}/schichten?tag=${d.key}`}
                      className="block px-4 py-3 transition hover:bg-surface-2/60"
                    >
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold text-fg">
                          {fmtWeekday(iso)} <span className="font-normal text-fg-muted">{fmtDayMonth(iso)}</span>
                        </span>
                        <span className="tabular text-xs text-fg-muted">
                          {filled}/{total} · {d.items.length} Schicht{d.items.length === 1 ? '' : 'en'}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-fg/10">
                        <div
                          className={cn('h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-accent')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </Card>
            </section>
          )}

          {/* Letzte Aktivitäten */}
          <section aria-labelledby="activity-title">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 id="activity-title" className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
                Letzte Aktivitäten
              </h3>
              <Link href={`${base}/protokoll`} className="text-xs font-semibold text-accent-ink hover:underline">
                Ganzes Protokoll
              </Link>
            </div>
            <Card className="divide-y divide-line">
              {logs === null ? (
                <p className="px-4 py-3 text-sm text-fg-muted">Wird geladen…</p>
              ) : logs.length === 0 ? (
                <p className="px-4 py-3 text-sm text-fg-muted">Noch keine Ein- oder Austragungen.</p>
              ) : (
                logs.slice(0, 6).map((l) => (
                  <div key={l.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    {l.action === 'SIGNUP' ? (
                      <UserPlus className="mt-0.5 size-4 shrink-0 text-success-ink" />
                    ) : l.action === 'SIGNOFF' ? (
                      <UserMinus className="mt-0.5 size-4 shrink-0 text-danger-ink" />
                    ) : l.action === 'REPLACE' ? (
                      <Repeat className="mt-0.5 size-4 shrink-0 text-warning-ink" />
                    ) : (
                      <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-fg">
                        <span className="font-semibold">{l.helperName}</span>{' '}
                        <span className="text-fg-muted">
                          {l.action === 'SIGNUP'
                            ? 'eingetragen in'
                            : l.action === 'SIGNOFF'
                              ? 'ausgetragen aus'
                              : l.action === 'REPLACE'
                                ? 'übernimmt'
                                : 'Anwesenheit bei'}
                        </span>{' '}
                        {l.shiftTitle}
                      </p>
                      <p className="text-2xs text-fg-subtle">
                        {relTime(l.createdAt)}
                        {l.performedByName
                          ? l.action === 'REPLACE'
                            ? ` · von ${l.performedByName}`
                            : ` · durch ${l.performedByName}`
                          : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'warning' | 'success';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-extrabold tabular',
          tone === 'warning' ? 'text-warning-ink' : tone === 'success' ? 'text-success-ink' : 'text-fg'
        )}
      >
        {value}
      </p>
      {hint && <p className="text-2xs text-fg-muted">{hint}</p>}
    </Card>
  );
}

const TODO_ICON: Record<TodoTone, ReactNode> = {
  warning: <AlertTriangle className="size-5 text-warning-ink" />,
  info: <Info className="size-5 text-accent-ink" />,
  success: <CheckCircle2 className="size-5 text-success-ink" />,
};

function TodoCard({ todo }: { todo: Todo }) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0">{TODO_ICON[todo.tone]}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{todo.title}</span>
        {todo.text && <span className="mt-0.5 block text-xs text-fg-muted">{todo.text}</span>}
      </span>
      {todo.href && (
        <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-accent-ink sm:inline-flex">
          {todo.action} <ArrowRight className="size-3.5" />
        </span>
      )}
    </>
  );
  const className = cn(
    'flex items-start gap-3 rounded-card border p-4 text-sm transition',
    todo.tone === 'warning' && 'border-warning/40 bg-warning/8',
    todo.tone === 'info' && 'border-line bg-surface',
    todo.tone === 'success' && 'border-success/30 bg-success/8',
    todo.href && 'hover:border-line-strong'
  );
  return todo.href ? (
    <Link href={todo.href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

