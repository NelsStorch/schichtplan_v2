'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarPlus, CalendarX2, Clock, Plus, Settings2 } from 'lucide-react';
import type { EventDto } from '@schichtplan/shared';
import { Button, Card, EmptyState, Skeleton, buttonClasses } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { DepartmentSettingsDialog } from '@/components/DepartmentSettingsDialog';
import { EventFormDialog } from '@/components/EventFormDialog';
import { EventTile, eventStatus } from '@/components/EventTile';
import { api } from '@/lib/api';
import { fmtDayMonth, fmtRelativeDay, fmtShortDate, fmtTime, fmtWeekday } from '@/lib/format';
import { displayName, usePortal } from '@/lib/portal';
import type { MyShift } from '@/lib/types';

export default function DepartmentHomePage() {
  const router = useRouter();
  const { department, user, loading, error, isDeptAdmin, isPlanner } = usePortal();
  const [events, setEvents] = useState<EventDto[] | null>(null);
  const [nextShift, setNextShift] = useState<MyShift | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showDeptForm, setShowDeptForm] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('createEvent=1')) {
      setShowEventForm(true);
    }
  }, []);

  useEffect(() => {
    if (!department) return;
    api<EventDto[]>('/api/events')
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [department]);

  useEffect(() => {
    if (!user) return;
    api<MyShift[]>('/api/shifts/my')
      .then((shifts) =>
        setNextShift(
          shifts
            .filter((s) => new Date(s.endTime) > new Date())
            .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))[0] ?? null
        )
      )
      .catch(() => setNextShift(null));
  }, [user]);

  if (!loading && (error || !department)) return <TenantNotFound />;

  const sorted = [...(events ?? [])].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  const current = sorted.filter((e) => eventStatus(e) !== 'past');
  const past = sorted.filter((e) => eventStatus(e) === 'past').reverse();
  const [featured, ...others] = current;

  return (
    <AppShell
      actions={
        isPlanner && (
          <Button size="sm" onClick={() => setShowEventForm(true)} aria-label="Neuer Anlass">
            <Plus /> <span className="hidden sm:inline">Neuer Anlass</span>
          </Button>
        )
      }
    >
      {/* Kopf: links ausgerichtet, rechts der persönliche nächste Einsatz */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div className="animate-fade-up">
          {loading || !department ? (
            <>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-4 h-14 w-full max-w-lg" />
              <Skeleton className="mt-3 h-5 w-72" />
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-accent-ink">
                {user ? `Hoi ${displayName(user)}!` : 'Willkommen beim Schichtplan'}
              </p>
              <h1 className="mt-3 font-display text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg text-balance sm:text-6xl lg:text-7xl">
                {department.name}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
                Such dir einen Anlass aus und trag dich in eine Schicht ein. Jede helfende Hand zählt.
              </p>
              {isDeptAdmin && (
                <Button variant="secondary" size="sm" className="mt-6" onClick={() => setShowDeptForm(true)}>
                  <Settings2 /> Abteilung bearbeiten
                </Button>
              )}
            </>
          )}
        </div>

        {nextShift && <NextShiftCard shift={nextShift} />}
      </section>

      <section className="mx-auto mt-12 max-w-6xl px-4 sm:mt-16 sm:px-6" aria-labelledby="events-heading">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="events-heading" className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Anlässe
          </h2>
          {current.length > 0 && <span className="text-sm text-fg-subtle">{current.length} aktiv</span>}
        </div>

        {events === null ? (
          <div className="grid gap-5">
            <Skeleton className="h-[26rem] rounded-card sm:h-[32rem]" />
            <div className="grid gap-5 sm:grid-cols-2">
              <Skeleton className="h-[19rem] rounded-card" />
              <Skeleton className="h-[19rem] rounded-card" />
            </div>
          </div>
        ) : current.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 />}
            title="Gerade keine Anlässe"
            description={
              isPlanner
                ? 'Lege den ersten Anlass an. Danach planst du die Schichten und teilst den Link mit deinen Helfer:innen.'
                : 'Für diese Abteilung sind momentan keine Schichtpläne offen. Schau bald wieder vorbei.'
            }
            action={
              isPlanner && (
                <Button onClick={() => setShowEventForm(true)}>
                  <CalendarPlus /> Anlass erstellen
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-5">
            <EventTile event={featured} featured />
            {others.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2">
                {others.map((event, i) => (
                  <EventTile key={event.id} event={event} index={i + 1} />
                ))}
              </div>
            )}
          </div>
        )}

        {past.length > 0 && (
          <div className="mt-14">
            <h3 className="mb-3 text-sm font-semibold text-fg-subtle">Vergangene Anlässe</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {past.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="group flex items-center justify-between gap-4 rounded-field border border-line px-4 py-3.5 transition hover:border-line-strong hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg">{event.title}</span>
                    <span className="text-xs text-fg-subtle">{fmtShortDate(event.startDate)}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-fg-subtle transition group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <EventFormDialog
        open={showEventForm}
        mode="create"
        onClose={() => setShowEventForm(false)}
        onSaved={(slug) => router.push(`/events/${slug}`)}
      />
      <DepartmentSettingsDialog open={showDeptForm} onClose={() => setShowDeptForm(false)} />
    </AppShell>
  );
}

function NextShiftCard({ shift }: { shift: MyShift }) {
  return (
    <Card variant="raised" className="relative animate-fade-up overflow-hidden p-6 [animation-delay:120ms]">
      <div aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-accent/20 blur-3xl" />
      <p className="text-sm font-semibold text-fg-muted">Dein nächster Einsatz</p>
      <p className="mt-2 font-display text-4xl font-extrabold tracking-tight text-accent-ink">
        {fmtRelativeDay(shift.startTime)}
      </p>
      <p className="mt-4 text-lg font-bold leading-snug text-fg">{shift.title}</p>
      <p className="text-sm text-fg-muted">{shift.eventTitle}</p>
      <p className="mt-3 inline-flex items-center gap-2 font-mono text-[13px] text-fg-muted">
        <Clock className="size-4" />
        {fmtWeekday(shift.startTime)}, {fmtDayMonth(shift.startTime)} · {fmtTime(shift.startTime)} bis{' '}
        {fmtTime(shift.endTime)}
      </p>
      <Link href="/meine-schichten" className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'mt-5' })}>
        Alle meine Schichten <ArrowRight />
      </Link>
    </Card>
  );
}

function TenantNotFound() {
  return (
    <div className="grain flex min-h-[100dvh] items-center justify-center bg-campfire px-4">
      <EmptyState
        className="w-full max-w-md border-solid bg-surface"
        icon={<CalendarX2 />}
        title="Abteilung nicht gefunden"
        description="Unter dieser Adresse gibt es keinen Schichtplan. Prüfe den Link oder such deine Abteilung auf der Hauptseite."
        action={
          <a href="https://cevi-schichtplan.ch" className={buttonClasses()}>
            Zur Hauptseite <ArrowRight />
          </a>
        }
      />
    </div>
  );
}
