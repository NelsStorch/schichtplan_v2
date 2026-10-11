'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, Clock, LogIn, Ticket, UserMinus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Skeleton, buttonClasses, cn, useConfirm, useToast } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { ApiError, api, errorMessage, loginUrl } from '@/lib/api';
import {
  dayKeyToIso,
  fmtDayMonth,
  fmtDuration,
  fmtRelativeDay,
  fmtTime,
  fmtWeekday,
  groupByBusinessDay,
  hoursBetween,
} from '@/lib/format';
import { downloadIcs, type CalendarEntry } from '@/lib/ics';
import { usePortal } from '@/lib/portal';
import type { MyShift } from '@/lib/types';

const toCalendar = (s: MyShift): CalendarEntry => ({
  uid: s.signupId,
  title: `${s.title} (${s.eventTitle})`,
  description: [s.category, s.description].filter(Boolean).join('\n'),
  location: s.departmentName,
  start: s.startTime,
  end: s.endTime,
});

export default function MyShiftsPage() {
  const { user, loading: sessionLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();
  const [shifts, setShifts] = useState<MyShift[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShifts(await api<MyShift[]>('/api/shifts/my'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsLogin(true);
      else toast({ title: 'Schichten konnten nicht geladen werden', description: errorMessage(err), tone: 'error' });
      setShifts([]);
    }
  }, [toast]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setNeedsLogin(true);
      return;
    }
    load();
  }, [sessionLoading, user, load]);

  const cancel = async (shift: MyShift) => {
    const ok = await confirm({
      title: 'Aus Schicht austragen?',
      description: `Du wirst aus "${shift.title}" ausgetragen. Der Platz wird für andere frei.`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(shift.signupId);
    try {
      await api(`/api/shifts/${shift.shiftId}/signup`, { method: 'DELETE' });
      toast({ title: 'Du bist ausgetragen', description: shift.title });
      await load();
    } catch (err) {
      toast({ title: 'Austragen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (needsLogin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pt-16">
          <EmptyState
            icon={<Ticket />}
            title="Melde dich an"
            description="Mit deinem Konto siehst du hier alle deine Einsätze auf einen Blick, mit Kalender-Export."
            action={
              <a href={loginUrl()} className={buttonClasses()}>
                <LogIn /> Anmelden
              </a>
            }
          />
        </div>
      </AppShell>
    );
  }

  const now = Date.now();
  const upcoming = (shifts ?? []).filter((s) => new Date(s.endTime).getTime() >= now);
  const past = (shifts ?? []).filter((s) => new Date(s.endTime).getTime() < now);
  const next = [...upcoming].sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))[0];
  const hours = (shifts ?? []).reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime), 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-14">
        <header className="animate-fade-up">
          <h1 className="font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg sm:text-6xl">
            Meine Schichten
          </h1>
          {shifts === null ? (
            <Skeleton className="mt-6 h-16 w-72" />
          ) : (
            <dl className="mt-6 flex gap-8">
              <div>
                <dt className="text-sm text-fg-subtle">Einsätze</dt>
                <dd className="tabular font-display text-4xl font-extrabold tracking-tight text-fg">{shifts.length}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-subtle">Stunden</dt>
                <dd className="tabular font-display text-4xl font-extrabold tracking-tight text-fg">
                  {hours.toLocaleString('de-CH', { maximumFractionDigits: 1 })}
                </dd>
              </div>
            </dl>
          )}
        </header>

        {shifts === null ? (
          <div className="mt-10 grid gap-3">
            <Skeleton className="h-52 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        ) : shifts.length === 0 ? (
          <EmptyState
            className="mt-10"
            icon={<Ticket />}
            title="Noch keine Einsätze"
            description="Du bist noch für keine Schicht eingetragen. Such dir einen Anlass aus und hilf mit."
            action={
              <Link href="/" className={buttonClasses()}>
                Schichten finden <ArrowRight />
              </Link>
            }
          />
        ) : (
          <>
            {next && (
              <Card variant="raised" className="relative mt-10 animate-fade-up overflow-hidden p-6 [animation-delay:100ms] sm:p-8">
                <div aria-hidden className="absolute -right-20 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg-muted">Als Nächstes</p>
                    <p className="mt-1 font-display text-5xl font-extrabold tracking-[-0.03em] text-accent-ink sm:text-6xl">
                      {fmtRelativeDay(next.startTime)}
                    </p>
                    <p className="mt-4 text-xl font-bold text-fg">{next.title}</p>
                    <Link href={`/events/${next.eventSlug}`} className="block w-fit text-sm font-medium text-fg-muted hover:text-fg">
                      {next.eventTitle}
                    </Link>
                    <p className="tabular mt-3 inline-flex items-center gap-2 font-mono text-[13px] text-fg-muted">
                      <Clock className="size-4" />
                      {fmtWeekday(next.startTime)}, {fmtDayMonth(next.startTime)} · {fmtTime(next.startTime)} bis{' '}
                      {fmtTime(next.endTime)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => downloadIcs(`schicht-${next.shiftId.slice(0, 8)}.ics`, [toCalendar(next)])}
                  >
                    <CalendarPlus /> In Kalender
                  </Button>
                </div>
              </Card>
            )}

            {upcoming.length > 0 && (
              <section className="mt-12">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-fg">Anstehend</h2>
                  {upcoming.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs('meine-schichten.ics', upcoming.map(toCalendar))}
                    >
                      <CalendarPlus /> Alle exportieren
                    </Button>
                  )}
                </div>
                <Timeline shifts={upcoming} busy={busy} onCancel={cancel} />
              </section>
            )}

            {past.length > 0 && (
              <section className="mt-14">
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-fg-subtle">Erledigt</h2>
                <Timeline shifts={past} muted />
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

/** Vertikale Zeitachse, gruppiert nach Geschäftstag. */
function Timeline({
  shifts,
  muted,
  busy,
  onCancel,
}: {
  shifts: MyShift[];
  muted?: boolean;
  busy?: string | null;
  onCancel?: (shift: MyShift) => void;
}) {
  return (
    <ol className="space-y-8">
      {groupByBusinessDay(shifts).map((group) => {
        const iso = dayKeyToIso(group.key);
        return (
          <li key={group.key}>
            <p className="mb-3 flex items-baseline gap-2">
              <span className={cn('font-display text-lg font-bold', muted ? 'text-fg-muted' : 'text-fg')}>
                {fmtWeekday(iso)}
              </span>
              <span className="text-sm text-fg-subtle">{fmtDayMonth(iso)}</span>
            </p>
            <ul className="relative space-y-3 border-l-2 border-dashed border-line-strong pl-5 sm:pl-6">
              {group.items.map((s, i) => (
                <li
                  key={s.signupId}
                  style={{ '--i': i } as React.CSSProperties}
                  className={cn('relative animate-fade-up stagger', muted && 'opacity-70')}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -left-[calc(1.25rem+7px)] top-6 size-3 rounded-full ring-4 ring-canvas sm:-left-[calc(1.5rem+7px)]',
                      muted ? 'bg-line-strong' : 'bg-accent'
                    )}
                  />
                  <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-5">
                    <div className="tabular shrink-0 font-mono sm:w-28">
                      <p className="text-xl font-semibold text-fg">{fmtTime(s.startTime)}</p>
                      <p className="text-xs text-fg-subtle">bis {fmtTime(s.endTime)}</p>
                      <p className="text-xs text-fg-subtle">{fmtDuration(s.startTime, s.endTime)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap gap-1.5">
                        <Badge>{s.category}</Badge>
                      </div>
                      <p className="font-bold text-fg">{s.title}</p>
                      <Link href={`/events/${s.eventSlug}`} className="text-sm text-fg-muted hover:text-fg">
                        {s.eventTitle}
                      </Link>
                    </div>
                    {onCancel && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busy === s.signupId}
                        onClick={() => onCancel(s)}
                        className="self-start sm:self-center"
                      >
                        <UserMinus /> Austragen
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
