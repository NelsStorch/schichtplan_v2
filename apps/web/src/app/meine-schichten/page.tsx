'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarPlus,
  CalendarSync,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  Download,
  ExternalLink,
  FileText,
  HelpCircle,
  LogIn,
  Mail,
  Phone,
  RefreshCw,
  Repeat,
  Shield,
  Ticket,
  UserMinus,
  Users,
  Zap,
} from 'lucide-react';
import {
  cancelDeadlineAt,
  cancelDeadlineText,
  replacementDeadline,
  type ResponsiblePersonDto,
} from '@schichtplan/shared';
import { Badge, Button, Card, EmptyState, Skeleton, buttonClasses, cn, trackUi, useConfirm, useToast } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { CalendarSubscribeDialog } from '@/components/CalendarSubscribeDialog';
import { ReplacementDialog } from '@/components/event/ReplacementDialog';
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
import {
  detectClientDevice,
  downloadIcs,
  googleCalendarSubscribeUrl,
  googleCalendarUrl,
  type CalendarEntry,
  type ClientDevice,
} from '@/lib/ics';
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
  const leaders = s.responsibles?.map((r) => r.displayName).join(', ');
  return {
    uid: s.signupId,
    title: `${rolePrefix}${s.title}${taskSuffix} (${s.eventTitle})`,
    description: [
      s.isResponsible ? `Rolle: ${s.responsibleRole || 'Leitung'}` : null,
      s.taskTitle && s.taskTitle !== s.title ? `Arbeit: ${s.taskTitle}` : null,
      s.category ? `Kategorie: ${s.category}` : null,
      leaders ? `Schicht-/Tagesleitung: ${leaders}` : null,
      s.coHelpers?.length ? `Mit dir eingeteilt: ${s.coHelpers.join(', ')}` : null,
      s.description,
      `Anlass: ${s.eventTitle}`,
      `Abteilung: ${s.departmentName}`,
    ]
      .filter(Boolean)
      .join('\n'),
    location: s.departmentName,
    start: s.startTime,
    end: s.endTime,
  };
};

/** Prüft, ob eine Schicht erweiterte Briefing-Infos (Beschreibung, Leitung, Team, Kontakt) besitzt */
function hasBriefingDetails(s: MyShift): boolean {
  return Boolean(
    s.description?.trim() ||
      (s.responsibles && s.responsibles.length > 0) ||
      (s.coHelpers && s.coHelpers.length > 0) ||
      s.contactUser
  );
}

export default function MyShiftsPage() {
  const { user, loading: sessionLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();
  const [shifts, setShifts] = useState<MyShift[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<MyShift | null>(null);
  const [calData, setCalData] = useState<CalendarTokenData | null>(null);
  const [resettingToken, setResettingToken] = useState(false);
  const [calDialogOpen, setCalDialogOpen] = useState(false);
  const [clientDevice, setClientDevice] = useState<ClientDevice>('other');

  useEffect(() => {
    setClientDevice(detectClientDevice());
  }, []);

  const loadCalToken = useCallback(async () => {
    try {
      const data = await api<CalendarTokenData>('/api/calendar/token');
      setCalData(data);
    } catch {
      // Kalender-Token optional ignorieren falls nicht geladen
    }
  }, []);

  const handleResetToken = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        title: 'Keine Internetverbindung',
        description: 'Zum Erneuern des Links wird eine Internetverbindung benötigt.',
        tone: 'error',
      });
      return;
    }
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
    loadCalToken();
  }, [sessionLoading, user, load, loadCalToken]);

  // Wie oft die Seite offline (aus dem Zwischenspeicher) genutzt wird. Die Meldung wartet, bis wieder Netz da ist.
  useEffect(() => {
    trackUi('UI_MY_SHIFTS', navigator.onLine ? 'online' : 'offline');
  }, []);

  const cancel = async (shift: MyShift) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        title: 'Keine Internetverbindung',
        description: 'Im Offline-Modus ist nur die Leseansicht verfügbar. Zum Austragen wird eine Internetverbindung benötigt.',
        tone: 'error',
      });
      return;
    }
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
      description: `Du wirst aus "${shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime)}" ausgetragen. Der Platz wird für andere frei.`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(shift.signupId);
    try {
      await api(`/api/shifts/${shift.shiftId}/signup`, { method: 'DELETE' });
      toast({ title: 'Du bist ausgetragen', description: shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime) });
      await load();
    } catch (err) {
      toast({ title: 'Austragen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const offerReplacement = async (note: string) => {
    if (!replacementFor) return;
    setBusy(replacementFor.signupId);
    try {
      await api(`/api/signups/${replacementFor.signupId}/replacement`, { method: 'PUT', json: { note: note || null } });
      toast({ title: 'Ersatz wird gesucht', description: 'Du bleibst eingetragen, bis jemand übernimmt. Du bekommst dann eine Mail.' });
      setReplacementFor(null);
      await load();
    } catch (err) {
      toast({ title: 'Hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const withdrawReplacement = async (shift: MyShift) => {
    setBusy(shift.signupId);
    try {
      await api(`/api/signups/${shift.signupId}/replacement`, { method: 'DELETE' });
      toast({ title: 'Ersatz-Suche beendet', description: 'Du bleibst eingetragen.' });
      await load();
    } catch (err) {
      toast({ title: 'Hat nicht geklappt', description: errorMessage(err), tone: 'error' });
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

  const isApple = clientDevice === 'ios' || clientDevice === 'mac';

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
            <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
              <dl className="flex gap-8">
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
              {calData && (
                <Button variant="secondary" size="sm" onClick={() => setCalDialogOpen(true)}>
                  <CalendarSync className="size-4" /> Kalender-Abo &amp; Export
                </Button>
              )}
            </div>
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
            {/* 1. Ganz oben: Als Nächstes (Hero-Karte inkl. Einsatz-Briefing) */}
            {next && (
              <Card variant="raised" className="relative mt-10 animate-fade-up overflow-hidden p-6 [animation-delay:80ms] sm:p-8">
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
                      title="Diesen Einzeleinsatz in Google Kalender speichern"
                    >
                      <CalendarPlus className="size-4" /> Google Kalender
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs(`schicht-${next.shiftId.slice(0, 8)}.ics`, [toCalendar(next)])}
                      title="Einzelschicht als .ics herunterladen"
                    >
                      <Download className="size-4" /> .ics
                    </Button>
                  </div>
                </div>

                {/* Kompaktes Einsatz-Briefing direkt in der Hero-Karte */}
                {hasBriefingDetails(next) && (
                  <div className="relative mt-6 border-t border-line/70 pt-5">
                    <ShiftBriefingPanel shift={next} />
                  </div>
                )}
              </Card>
            )}

            {/* 2. Anstehende Schichten */}
            {upcoming.length > 0 && (
              <section className="mt-12">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <h2 className="font-display text-2xl font-bold tracking-tight text-fg">Anstehend</h2>
                  {upcoming.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadIcs('meine-schichten.ics', upcoming.map(toCalendar))}
                      title="Alle kommenden Schichten als statische .ics-Datei herunterladen"
                    >
                      <Download className="size-4" /> Alle als .ics exportieren
                    </Button>
                  )}
                </div>
                <Timeline
                  shifts={upcoming}
                  busy={busy}
                  onCancel={cancel}
                  onOfferReplacement={setReplacementFor}
                  onWithdrawReplacement={withdrawReplacement}
                />
              </section>
            )}

            {/* 3. Live-Kalender-Abo Box (sauber gestapelt, volle Textbreite, kein Überlappen) */}
            {calData && (
              <Card className="mt-12 border border-line bg-surface p-5 sm:p-6 animate-fade-up">
                <div className="flex flex-wrap items-center gap-2.5">
                  <CalendarSync className="size-5 text-accent-ink shrink-0" />
                  <h2 className="font-display text-lg font-bold text-fg">Live-Kalender-Abo</h2>
                  <Badge tone="accent">Automatischer Sync</Badge>
                </div>

                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
                  Abonniere alle deine Schichten direkt in deiner Kalender-App. Zukünftige Einsätze, Verschiebungen und
                  Abmeldungen werden vollautomatisch im Hintergrund synchronisiert.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  {isApple ? (
                    <>
                      <a
                        href={calData.webcalUrl}
                        className={buttonClasses({ variant: 'primary', size: 'sm' })}
                        title="Direkt in Apple Kalender auf deinem iPhone oder Mac abonnieren"
                      >
                        <CalendarSync className="size-4" /> In Apple Kalender abonnieren
                      </a>
                      <a
                        href={googleCalendarSubscribeUrl(calData.webcalUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                        title="In Google Kalender abonnieren (1-Klick)"
                      >
                        <CalendarPlus className="size-4" /> Google Kalender
                      </a>
                    </>
                  ) : (
                    <>
                      <a
                        href={googleCalendarSubscribeUrl(calData.webcalUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses({ variant: 'primary', size: 'sm' })}
                        title="In Google Kalender abonnieren (1-Klick)"
                      >
                        <CalendarPlus className="size-4" /> In Google Kalender abonnieren
                      </a>
                      <a
                        href={calData.webcalUrl}
                        className={buttonClasses({ variant: 'secondary', size: 'sm' })}
                        title="Direkt in Apple Kalender oder Outlook abonnieren"
                      >
                        <CalendarSync className="size-4" /> Apple Kalender
                      </a>
                    </>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCalDialogOpen(true)}
                  >
                    <HelpCircle className="size-4" /> Andere Kalender, Anleitung &amp; .ics
                  </Button>
                </div>
              </Card>
            )}

            {/* 4. Erledigte Schichten */}
            {past.length > 0 && (
              <section className="mt-14">
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-fg-subtle">Erledigt</h2>
                <Timeline shifts={past} muted />
              </section>
            )}
          </>
        )}
      </div>

      {/* Pop-up Dialog: Wo hast du deinen Kalender? */}
      {calData && (
        <CalendarSubscribeDialog
          open={calDialogOpen}
          onClose={() => setCalDialogOpen(false)}
          calData={calData}
          shifts={(shifts ?? []).map(toCalendar)}
          clientDevice={clientDevice}
          onResetToken={handleResetToken}
          resettingToken={resettingToken}
        />
      )}

      <ReplacementDialog
        open={Boolean(replacementFor)}
        shiftLabel={replacementFor ? `${replacementFor.title}, ${replacementFor.eventTitle}` : undefined}
        busy={Boolean(replacementFor && busy === replacementFor.signupId)}
        onClose={() => setReplacementFor(null)}
        onSubmit={offerReplacement}
      />
    </AppShell>
  );
}

/** Kontakt-Pill für Schichtleitung, Tagesleitung oder Anlass-Kontakt (mit Direkt-Anruf / Mail) */
function ContactPill({ person, roleLabel }: { person: ResponsiblePersonDto; roleLabel?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs">
      <Shield className="size-3 text-accent-ink shrink-0" />
      {roleLabel && <span className="text-fg-subtle">{roleLabel}:</span>}
      <span className="font-semibold text-fg">{person.displayName}</span>
      {person.phone && (
        <a
          href={`tel:${person.phone.replace(/\s+/g, '')}`}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 font-mono text-2xs font-semibold text-accent-ink transition hover:bg-accent/20"
          title={`${person.displayName} anrufen (${person.phone})`}
        >
          <Phone className="size-2.5" /> {person.phone}
        </a>
      )}
      {person.email && (
        <a
          href={`mailto:${person.email}`}
          className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-fg-muted transition hover:text-fg"
          title={`E-Mail an ${person.displayName} (${person.email})`}
        >
          <Mail className="size-2.5" /> Mail
        </a>
      )}
    </span>
  );
}

/** Kompaktes Einsatz-Briefing (Beschreibung, Leitung mit Kontakt, eingeteiltes Team) – auch offline abrufbar */
function ShiftBriefingPanel({ shift }: { shift: MyShift }) {
  const responsibles = shift.responsibles ?? [];
  const respIds = new Set(responsibles.map((r) => r.id));
  const extraContact = shift.contactUser && !respIds.has(shift.contactUser.id) ? shift.contactUser : null;
  const coHelpers = shift.coHelpers ?? [];

  return (
    <div className="space-y-3 text-xs">
      {shift.description?.trim() && (
        <div className="flex items-start gap-2.5 rounded-field border border-line/70 bg-surface-2/70 p-3 text-sm text-fg">
          <FileText className="mt-0.5 size-4 shrink-0 text-accent-ink" />
          <p className="whitespace-pre-line leading-relaxed">{shift.description.trim()}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {responsibles.map((person) => (
          <ContactPill key={person.id} person={person} roleLabel="Leitung" />
        ))}
        {extraContact && <ContactPill person={extraContact} roleLabel="OK-Kontakt" />}
        {(coHelpers.length > 0 || shift.requiredSlots !== undefined) && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-fg-muted">
            <Users className="size-3 shrink-0 text-fg-subtle" />
            {coHelpers.length > 0 ? (
              <span>
                Mit dir dabei: <strong className="font-semibold text-fg">{coHelpers.join(', ')}</strong>
              </span>
            ) : (
              <span>Noch niemand weiteres eingetragen</span>
            )}
            {shift.requiredSlots !== undefined && shift.filledSlots !== undefined && (
              <span className="tabular text-fg-subtle">
                ({shift.filledSlots}/{shift.requiredSlots})
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Berechnet die Pause oder den Übergang zwischen zwei aufeinanderfolgenden Schichten am selben Tag */
function BreakIndicator({ prev, next }: { prev: MyShift; next: MyShift }) {
  const prevEnd = new Date(prev.endTime).getTime();
  const nextStart = new Date(next.startTime).getTime();
  const diffMin = Math.round((nextStart - prevEnd) / 60000);

  if (diffMin === 0) {
    return (
      <div className="my-2 flex items-center gap-2 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-ink">
          <Zap className="size-3.5" /> Direkter Anschluss um {fmtTime(next.startTime)} Uhr (ohne Pause)
        </span>
      </div>
    );
  }

  if (diffMin < 0) {
    return (
      <div className="my-2 flex items-center gap-2 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-ink">
          <RefreshCw className="size-3.5" /> {Math.abs(diffMin)} Min. Übergabe / Überlappung ({fmtTime(next.startTime)}–{fmtTime(prev.endTime)})
        </span>
      </div>
    );
  }

  return (
    <div className="my-2 flex items-center gap-2 py-1">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted">
        <Coffee className="size-3.5 text-fg-subtle" /> {fmtDuration(prev.endTime, next.startTime)} Pause dazwischen ({fmtTime(prev.endTime)}–{fmtTime(next.startTime)})
      </span>
    </div>
  );
}

/** Vertikale Zeitachse, gruppiert nach Geschäftstag (inkl. Pausen-Anzeige & Einsatz-Briefing). */
function Timeline({
  shifts,
  muted,
  busy,
  onCancel,
  onOfferReplacement,
  onWithdrawReplacement,
}: {
  shifts: MyShift[];
  muted?: boolean;
  busy?: string | null;
  onCancel?: (shift: MyShift) => void;
  onOfferReplacement?: (shift: MyShift) => void;
  onWithdrawReplacement?: (shift: MyShift) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleBriefing = (id: string) => {
    if (!expandedIds[id]) trackUi('UI_BRIEFING');
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <ol className="space-y-8">
      {groupByBusinessDay(shifts).map((group) => {
        const iso = dayKeyToIso(group.key);
        const isMultiShiftDay = group.items.length > 1;
        return (
          <li key={group.key}>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <p className="flex items-baseline gap-2">
                <span className={cn('font-display text-lg font-bold', muted ? 'text-fg-muted' : 'text-fg')}>
                  {fmtWeekday(iso)}
                </span>
                <span className="text-sm text-fg-subtle">{fmtDayMonth(iso)}</span>
              </p>
              {isMultiShiftDay && (
                <Badge size="sm" tone={muted ? 'neutral' : 'accent'}>
                  {group.items.length} Einsätze an diesem Tag
                </Badge>
              )}
            </div>
            <ul className="relative space-y-3 border-l-2 border-dashed border-line-strong pl-5 sm:pl-6">
              {group.items.map((s, i) => {
                const prevShift = i > 0 ? group.items[i - 1] : null;
                const hasBriefing = hasBriefingDetails(s);
                const isExpanded = Boolean(expandedIds[s.signupId]);
                const leaders = s.responsibles?.map((r) => r.displayName).join(', ');
                const hasContactOrDesc = Boolean(
                  s.description?.trim() ||
                    s.responsibles?.some((r) => r.phone || r.email) ||
                    s.contactUser?.phone ||
                    s.contactUser?.email
                );

                return (
                  <li
                    key={s.signupId}
                    style={{ '--i': i } as React.CSSProperties}
                    className={cn('relative animate-fade-up stagger', muted && 'opacity-70')}
                  >
                    {/* Pausen- oder Anschluss-Anzeige zwischen zwei Schichten am selben Tag */}
                    {prevShift && <BreakIndicator prev={prevShift} next={s} />}

                    <span
                      aria-hidden
                      className={cn(
                        'absolute -left-[calc(1.25rem+7px)] size-3 rounded-full ring-4 ring-canvas sm:-left-[calc(1.5rem+7px)]',
                        prevShift ? 'top-14' : 'top-6',
                        muted ? 'bg-line-strong' : 'bg-accent'
                      )}
                    />
                    <div className="rounded-card border border-line bg-surface p-4 sm:p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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
                            {s.replacementWantedAt && (
                              <Badge tone="warning">
                                <Repeat className="size-3" /> Ersatz gesucht
                              </Badge>
                            )}
                          </div>
                          <p className="font-bold text-fg">{s.title}</p>
                          <Link href={`/events/${s.eventSlug}`} className="text-sm text-fg-muted hover:text-fg">
                            {s.eventTitle}
                          </Link>

                          {/* Kompakte Kurz-Zusammenfassung (Leitung & Team) direkt sichtbar */}
                          {hasBriefing && !isExpanded && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                              {leaders && (
                                <span className="inline-flex items-center gap-1">
                                  <Shield className="size-3 text-accent-ink" /> Leitung:{' '}
                                  <strong className="font-medium text-fg">{leaders}</strong>
                                </span>
                              )}
                              {s.coHelpers && s.coHelpers.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="size-3 text-fg-subtle" /> Mit:{' '}
                                  <strong className="font-medium text-fg">{s.coHelpers.join(', ')}</strong>
                                </span>
                              )}
                              {hasContactOrDesc && (
                                <button
                                  type="button"
                                  onClick={() => toggleBriefing(s.signupId)}
                                  className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
                                >
                                  Briefing &amp; Kontakt <ChevronDown className="size-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                          {hasContactOrDesc && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleBriefing(s.signupId)}
                              title="Einsatz-Briefing, Beschreibung und Kontakte ein-/ausblenden"
                            >
                              <FileText className="size-4" />
                              <span className="hidden md:inline">Briefing</span>
                              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </Button>
                          )}
                          <a
                            href={googleCalendarUrl(toCalendar(s))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonClasses({ variant: 'ghost', size: 'icon-sm' })}
                            title="Diesen Einzeleinsatz in Google Kalender eintragen"
                          >
                            <CalendarPlus className="size-4" />
                          </a>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => downloadIcs(`schicht-${s.shiftId.slice(0, 8)}.ics`, [toCalendar(s)])}
                            title="Diesen Einzeleinsatz als .ics-Datei herunterladen"
                          >
                            <Download className="size-4" />
                          </Button>
                          {s.isSignup !== false && s.replacementWantedAt && onWithdrawReplacement ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy === s.signupId}
                              onClick={() => onWithdrawReplacement(s)}
                              title="Du bleibst eingetragen"
                            >
                              Ersatz-Suche beenden
                            </Button>
                          ) : s.isSignup !== false &&
                            onOfferReplacement &&
                            s.allowReplacement &&
                            Date.now() < replacementDeadline(s.startTime, s.replacementCutoffHours ?? 0).getTime() ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onOfferReplacement(s)}
                              title="Du bleibst eingetragen, bis jemand übernimmt"
                            >
                              <Repeat /> Ersatz suchen
                            </Button>
                          ) : null}
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

                      {s.replacementWantedAt && (
                        <p className="mt-3 rounded-field border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink">
                          Du suchst Ersatz{s.replacementNote ? ` («${s.replacementNote}»)` : ''}. Bis jemand übernimmt,
                          bist du eingetragen. Du bekommst eine Mail, sobald es so weit ist.
                        </p>
                      )}

                      {/* Aufgeklapptes Einsatz-Briefing */}
                      {isExpanded && hasBriefing && (
                        <div className="mt-4 border-t border-line/70 pt-3.5">
                          <ShiftBriefingPanel shift={s} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
