'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, CalendarSync, Check, Clock, Copy, Download, ExternalLink, LogIn, RefreshCw, Shield, Ticket, UserMinus } from 'lucide-react';
import { cancelDeadlineAt, cancelDeadlineText } from '@schichtplan/shared';
import { Badge, Button, Card, EmptyState, Skeleton, buttonClasses, cn, useConfirm, useToast } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { ApiError, api, errorMessage, loginUrl } from '@/lib/api';
import {
  dayKeyToIso,
  fmtDayMonth,
  fmtDuration,
  fmtRelativeDay,
  fmtTime,
  fmtTimeRange,
  fmtWeekday,
  groupByBusinessDay,
  hoursBetween,
} from '@/lib/format';
import { downloadIcs, googleCalendarUrl, type CalendarEntry } from '@/lib/ics';
import { usePortal } from '@/lib/portal';
import type { MyShift } from '@/lib/types';

interface CalendarTokenData {
  token: string;
  webcalUrl: string;
  httpsUrl: string;
}

const toCalendar = (s: MyShift): CalendarEntry => {
  const rolePrefix = s.isResponsible ? `[${s.responsibleRole || 'Leitung'}] ` : '';
  const taskSuffix = s.taskTitle && s.taskTitle !== s.title ? ` (${s.taskTitle})` : '';
  return {
    uid: s.signupId,
    title: `${rolePrefix}${s.title}${taskSuffix} (${s.eventTitle})`,
    description: [
      s.isResponsible ? `Rolle: ${s.responsibleRole || 'Leitung'}` : null,
      s.taskTitle && s.taskTitle !== s.title ? `Arbeit: ${s.taskTitle}` : null,
      s.category ? `Kategorie: ${s.category}` : null,
      s.description,
      `Anlass: ${s.eventTitle}`,
      `Abteilung: ${s.departmentName}`,
    ].filter(Boolean).join('\n'),
    location: s.departmentName,
    start: s.startTime,
    end: s.endTime,
  };
};

export default function MyShiftsPage() {
  const { user, loading: sessionLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();
  const [shifts, setShifts] = useState<MyShift[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [calData, setCalData] = useState<CalendarTokenData | null>(null);
  const [copied, setCopied] = useState(false);
  const [resettingToken, setResettingToken] = useState(false);

  const loadCalToken = useCallback(async () => {
    try {
      const data = await api<CalendarTokenData>('/api/calendar/token');
      setCalData(data);
    } catch {
      // Kalender-Token optional ignorieren falls nicht geladen
    }
  }, []);

  const handleCopyUrl = async () => {
    if (!calData?.httpsUrl) return;
    try {
      await navigator.clipboard.writeText(calData.httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({
        title: 'Abo-Link kopiert',
        description: 'Füge den Link in Google Kalender oder deiner Kalender-App ein.',
      });
    } catch {
      toast({ title: 'Kopieren fehlgeschlagen', description: 'Bitte kopiere den Link manuell.', tone: 'error' });
    }
  };

  const handleResetToken = async () => {
    const ok = await confirm({
      title: 'Abo-Link wirklich erneuern?',
      description:
        'Bestehende Kalender-Abonnements (z. B. auf deinem Smartphone oder in Outlook) verlieren den Zugriff und müssen mit dem neuen Link aktualisiert werden.',
      confirmLabel: 'Neuen Link generieren',
      tone: 'danger',
    });
    if (!ok) return;
    setResettingToken(true);
    try {
      const data = await api<CalendarTokenData>('/api/calendar/token/reset', { method: 'POST' });
      setCalData(data);
      toast({
        title: 'Neuer Kalender-Link generiert',
        description: 'Bestehende Abos müssen mit dem neuen Link aktualisiert werden.',
      });
    } catch (err) {
      toast({ title: 'Fehler beim Erneuern', description: errorMessage(err), tone: 'error' });
    } finally {
      setResettingToken(false);
    }
  };

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
    // Austrag-Sperre prüfen falls vorhanden
    if (
      !user?.isGlobalAdmin &&
      shift.eventStartDate &&
      shift.cancelDeadlineDays !== null &&
      shift.cancelDeadlineDays !== undefined
    ) {
      const deadline = cancelDeadlineAt(shift.eventStartDate, shift.cancelDeadlineDays);
      if (new Date() >= deadline) {
        const daysText = cancelDeadlineText(deadline, shift.cancelDeadlineDays);
        await confirm({
          title: 'Austragen nicht mehr selbst möglich',
          description: `Das selbständige Austragen für «${shift.eventTitle}» ist ${daysText} gesperrt. Bitte wende dich direkt an das Event-OK.`,
          confirmLabel: 'Verstanden',
          tone: 'default',
        });
        return;
      }
    }
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

        {/* Live-Sync Kalender-Abo */}
        {calData && (
          <Card className="mt-8 border border-line bg-surface p-5 sm:p-6 animate-fade-up [animation-delay:50ms]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 max-w-xl">
                <div className="flex items-center gap-2">
                  <CalendarSync className="size-5 text-accent-ink shrink-0" />
                  <h2 className="font-display text-lg font-bold text-fg">Live-Kalender-Abo</h2>
                  <Badge tone="accent">Neu</Badge>
                </div>
                <p className="mt-1.5 text-sm text-fg-muted">
                  Abonniere alle deine Schichten direkt in deiner Kalender-App (Apple Kalender, Outlook oder Google Kalender).
                  Zukünftige Einsätze, Verschiebungen und Abmeldungen werden vollautomatisch synchronisiert.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={calData.webcalUrl}
                  className={buttonClasses()}
                  title="Direkt in Apple Kalender oder Outlook abonnieren"
                >
                  <CalendarSync className="size-4" /> 1-Klick Abonnieren
                </a>
                <Button
                  variant="secondary"
                  onClick={handleCopyUrl}
                  title="Kalender-URL kopieren für Google Kalender oder andere Kalender-Apps"
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  {copied ? 'Kopiert' : 'Link kopieren'}
                </Button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-line/60 flex flex-col gap-2 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span><strong>Apple & Outlook:</strong> Klick auf «1-Klick Abonnieren».</span>
                <span><strong>Google Kalender:</strong> Link kopieren ➜ «Weitere Kalender (+)" ➜ «Per URL hinzufügen».</span>
              </div>
              <button
                type="button"
                onClick={handleResetToken}
                disabled={resettingToken}
                className="inline-flex items-center gap-1.5 text-fg-subtle hover:text-fg underline underline-offset-2 transition"
              >
                <RefreshCw className={cn("size-3", resettingToken && "animate-spin")} />
                Abo-Link erneuern
              </button>
            </div>
          </Card>
        )}

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
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-fg-muted">Als Nächstes</p>
                      {next.isResponsible && (
                        <Badge tone="accent">
                          <Shield className="size-3" /> {next.responsibleRole || 'Schichtleitung'}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-display text-5xl font-extrabold tracking-[-0.03em] text-accent-ink sm:text-6xl">
                      {fmtRelativeDay(next.startTime)}
                    </p>
                    <p className="mt-4 text-xl font-bold text-fg">
                      {next.title}
                      {next.taskTitle && next.taskTitle !== next.title && (
                        <span className="ml-2 text-base font-normal text-fg-muted">({next.taskTitle})</span>
                      )}
                    </p>
                    <Link href={`/events/${next.eventSlug}`} className="block w-fit text-sm font-medium text-fg-muted hover:text-fg">
                      {next.eventTitle}
                    </Link>
                    <p className="tabular mt-3 inline-flex items-center gap-2 font-mono text-[13px] text-fg-muted">
                      <Clock className="size-4" />
                      {fmtWeekday(next.startTime)}, {fmtDayMonth(next.startTime)} · {fmtTimeRange(next.startTime, next.endTime)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={googleCalendarUrl(toCalendar(next))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses({ variant: 'secondary' })}
                      title="Direkt im Google Kalender eintragen"
                    >
                      <CalendarPlus className="size-4" /> Google Kalender
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs(`schicht-${next.shiftId.slice(0, 8)}.ics`, [toCalendar(next)])}
                      title="Als .ics-Datei für Apple Kalender oder Outlook"
                    >
                      <Download className="size-4" /> .ics
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {upcoming.length > 0 && (
              <section className="mt-12">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-fg">Anstehend</h2>
                  {upcoming.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs('meine-schichten.ics', upcoming.map(toCalendar))}
                    >
                      <Download className="size-4" /> Alle als .ics exportieren
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
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {s.category && <Badge>{s.category}</Badge>}
                        {s.isResponsible && (
                          <Badge tone="accent">
                            <Shield className="size-3" /> {s.responsibleRole || 'Schichtleitung'}
                          </Badge>
                        )}
                        {s.taskTitle && s.taskTitle !== s.title && (
                          <Badge tone="neutral">{s.taskTitle}</Badge>
                        )}
                      </div>
                      <p className="font-bold text-fg">{s.title}</p>
                      <Link href={`/events/${s.eventSlug}`} className="text-sm text-fg-muted hover:text-fg">
                        {s.eventTitle}
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <a
                        href={googleCalendarUrl(toCalendar(s))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses({ variant: 'ghost', size: 'icon-sm' })}
                        title="In Google Kalender eintragen"
                      >
                        <CalendarPlus className="size-4" />
                      </a>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => downloadIcs(`schicht-${s.shiftId.slice(0, 8)}.ics`, [toCalendar(s)])}
                        title=".ics herunterladen"
                      >
                        <Download className="size-4" />
                      </Button>
                      {s.isSignup !== false && onCancel ? (
                        <Button
                          variant="danger"
                          size="sm"
                          loading={busy === s.signupId}
                          onClick={() => onCancel(s)}
                        >
                          <UserMinus /> Austragen
                        </Button>
                      ) : (
                        <Link
                          href={`/events/${s.eventSlug}`}
                          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                        >
                          Zum Anlass <ExternalLink className="size-3" />
                        </Link>
                      )}
                    </div>
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
