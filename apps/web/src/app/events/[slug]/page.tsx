'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CalendarSearch, Crown, Palette, Plus, Shield, UserPlus, X } from 'lucide-react';
import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import {
  Avatar,
  Button,
  CeviLogo,
  Chip,
  EmptyState,
  ProgressRing,
  Skeleton,
  buttonClasses,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { EventFormDialog } from '@/components/EventFormDialog';
import { SignupModeBadge } from '@/components/event-meta';
import { GuestSignupDialog, OrganizerDialog, ShiftFormDialog } from '@/components/ShiftDialogs';
import { ShiftTicket } from '@/components/ShiftTicket';
import { ApiError, api, errorMessage, loginUrl } from '@/lib/api';
import {
  dayKeyToIso,
  fmtDateRange,
  fmtDayMonth,
  fmtShortWeekday,
  fmtTime,
  fmtWeekday,
  groupByBusinessDay,
} from '@/lib/format';
import { usePortal } from '@/lib/portal';
import { useDynamicFavicon } from '@/lib/favicon';
import type { EventDetails } from '@/lib/types';

export default function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, department, isDeptAdmin, isPlanner } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nicht ladbares Event-Logo -> Cevi-Standardlogo
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  const [day, setDay] = useState<string>('ALL');
  const [category, setCategory] = useState<string>('ALL');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [busyShift, setBusyShift] = useState<string | null>(null);

  const [guestShift, setGuestShift] = useState<ShiftDto | null>(null);
  const [guestTask, setGuestTask] = useState<ShiftTaskDto | null>(null);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOkForm, setShowOkForm] = useState(false);

  // Favicon: Event-Logo (falls vorhanden), sonst Abteilungs-Logo
  useDynamicFavicon(event?.logoUrl || department?.logoUrl, department?.logoUrl);

  const load = useCallback(async () => {
    try {
      setEvent(await api<EventDetails>(`/api/events/${slug}`));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'Diesen Anlass gibt es nicht (mehr).' : errorMessage(err));
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => groupByBusinessDay(event?.shifts ?? []), [event]);
  const categories = useMemo(() => Array.from(new Set(event?.shifts.map((s) => s.category))), [event]);

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pt-16">
          <EmptyState
            icon={<CalendarSearch />}
            title="Anlass nicht gefunden"
            description={error}
            action={
              <Link href="/" className={buttonClasses()}>
                Alle Anlässe
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  if (!event) return <EventSkeleton />;

  const isEventOk = Boolean(user && event.organizers?.some((o) => o.userId === user.id));
  const isOkLead = Boolean(user && event.organizers?.some((o) => o.userId === user.id && o.role === 'OK_LEAD'));
  const canManageShifts = isPlanner || isEventOk;
  const canManageEvent = isDeptAdmin || isOkLead;
  const needsLogin = !user && (event.signupMode === 'LOGIN_REQUIRED' || event.signupMode === 'CEVIDB_ONLY');

  const total = event.shifts.reduce((sum, s) => sum + s.requiredSlots, 0);
  const filled = event.shifts.reduce((sum, s) => sum + Math.min(s.signups?.length ?? 0, s.requiredSlots), 0);
  const free = Math.max(0, total - filled);
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;

  const visibleDays = days
    .filter((d) => day === 'ALL' || d.key === day)
    .map((d) => ({
      ...d,
      items: d.items.filter(
        (s) =>
          (category === 'ALL' || s.category === category) &&
          (!onlyOpen || (s.signups?.length ?? 0) < s.requiredSlots)
      ),
    }))
    .filter((d) => d.items.length > 0);

  const signup = async (shift: ShiftDto, task?: ShiftTaskDto) => {
    if (needsLogin) {
      window.location.href = loginUrl();
      return;
    }
    if (!user) {
      setGuestShift(shift);
      setGuestTask(task || null);
      return;
    }
    setBusyShift(shift.id);
    try {
      await api(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: {
          taskId: task?.id,
        },
      });
      toast({
        title: 'Du bist eingetragen!',
        description: `${shift.title}${task ? ` · ${task.title}` : ''}, ${fmtWeekday(shift.startTime)} ab ${fmtTime(shift.startTime)}`,
      });
      await load();
    } catch (err) {
      toast({ title: 'Eintragen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusyShift(null);
    }
  };

  const cancel = async (shift: ShiftDto, signupId?: string, name?: string) => {
    const ok = await confirm({
      title: name ? `${name} austragen?` : 'Aus Schicht austragen?',
      description: name
        ? `${name} wird aus "${shift.title}" entfernt.`
        : `Du wirst aus "${shift.title}" ausgetragen. Der Platz wird für andere frei.`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyShift(shift.id);
    try {
      const query = signupId ? `?signupId=${signupId}` : '';
      await api(`/api/shifts/${shift.id}/signup${query}`, { method: 'DELETE' });
      toast({ title: name ? `${name} ausgetragen` : 'Du bist ausgetragen' });
      await load();
    } catch (err) {
      toast({ title: 'Austragen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusyShift(null);
    }
  };

  const removeOrganizer = async (id: string, name: string) => {
    const ok = await confirm({
      title: `${name} aus dem OK entfernen?`,
      description: 'Die Person verliert die Planungsrechte für diesen Anlass.',
      confirmLabel: 'Entfernen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${event.slug}/organizers/${id}`, { method: 'DELETE' });
      toast({ title: `${name} ist nicht mehr im OK` });
      await load();
    } catch (err) {
      toast({ title: 'Entfernen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <AppShell
      actions={
        canManageShifts && (
          <div className="flex items-center gap-2">
            <Link
              href={`/events/${slug}/ok`}
              className={buttonClasses({ variant: 'secondary', size: 'sm' })}
            >
              <Shield className="size-4" /> <span className="hidden sm:inline">OK-Dashboard</span>
            </Link>
            <Button
              size="sm"
              onClick={() => {
                setEditingShift(null);
                setShowShiftForm(true);
              }}
              aria-label="Schicht anlegen"
            >
              <Plus /> <span className="hidden sm:inline">Schicht</span>
            </Button>
          </div>
        )
      }
    >
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-semibold text-fg-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-4" /> Alle Anlässe
        </Link>

        {/* Hero */}
        <section className="relative isolate flex min-h-[24rem] animate-fade-up flex-col justify-end overflow-hidden rounded-card bg-stone-900 text-white shadow-lift sm:min-h-[28rem]">
          {event.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.bannerUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/95 via-black/55 to-black/10" />
          <div className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-black/50 to-transparent lg:block" />

          <div className="grid gap-6 p-5 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-10">
            <div className="min-w-0">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-tile border border-white/20 bg-black/40 backdrop-blur-md sm:size-16">
                  {event.logoUrl && event.logoUrl !== brokenLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.logoUrl}
                      alt=""
                      onError={() => setBrokenLogo(event.logoUrl ?? null)}
                      className="size-full object-cover"
                    />
                  ) : (
                    <CeviLogo className="size-10" alt="" />
                  )}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <SignupModeBadge mode={event.signupMode} tone="glass" />
                </div>
              </div>
              <h1 className="font-display text-[2.5rem] font-extrabold leading-[0.92] tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
                {event.title}
              </h1>
              {event.description && (
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/80 sm:text-base">{event.description}</p>
              )}
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/85">
                <CalendarDays className="size-4" />
                {fmtDateRange(event.startDate, event.endDate)}
              </p>
            </div>

            {total > 0 && (
              <div className="flex items-center gap-5 rounded-card border border-white/15 bg-black/40 p-4 backdrop-blur-xl sm:p-5">
                <ProgressRing
                  value={filled}
                  max={total}
                  size={104}
                  stroke={10}
                  label={`${percent}%`}
                  sublabel="belegt"
                  tone={free === 0 ? 'success' : 'accent'}
                  trackClassName="text-white/15"
                />
                <div>
                  <p className="tabular font-display text-4xl font-extrabold leading-none tracking-tight">{free}</p>
                  <p className="mt-1 text-sm font-semibold text-white/80">{free === 1 ? 'Platz frei' : 'Plätze frei'}</p>
                  <p className="tabular mt-2 text-xs text-white/60">
                    {filled} von {total} besetzt
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Organisationskomitee */}
        {(event.organizers?.length || canManageEvent) && (
          <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center" aria-label="Organisationskomitee">
            <h2 className="shrink-0 text-sm font-semibold text-fg-subtle">OK</h2>
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
              {event.organizers?.map((org) => {
                const lead = org.role === 'OK_LEAD';
                return (
                  <li
                    key={org.id}
                    className="flex shrink-0 snap-start items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-4"
                  >
                    <Avatar name={org.userCeviName || org.userFirstName} highlight={lead} size="sm" className="size-8" />
                    <span className="leading-tight">
                      <span className="flex items-center gap-1 text-sm font-semibold text-fg">
                        {org.userCeviName || org.userFirstName}
                        {lead ? <Crown className="size-3.5 text-accent-ink" /> : <Shield className="size-3.5 text-fg-subtle" />}
                      </span>
                      <span className="block text-xs text-fg-subtle">{org.roleTitle || (lead ? 'OK-Leitung' : 'OK-Mitglied')}</span>
                    </span>
                    {canManageEvent && (
                      <button
                        type="button"
                        onClick={() => removeOrganizer(org.id, org.userCeviName || org.displayName)}
                        aria-label={`${org.displayName} aus dem OK entfernen`}
                        className="-mr-2 ml-1 rounded-full p-1.5 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {canManageEvent && (
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Link
                  href={`/events/${event.slug}/ok`}
                  className={buttonClasses({ variant: 'primary', size: 'sm' })}
                >
                  <Shield className="size-4" /> OK-Verwaltung
                </Link>
                <Button variant="secondary" size="sm" onClick={() => setShowOkForm(true)}>
                  <UserPlus /> OK ernennen
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
                  <Palette /> Design
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Filter: klebt unter dem Header */}
      {event.shifts.length > 0 && (
        <div className="sticky top-16 z-20 mt-8 border-b border-line/70 bg-canvas/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl snap-x gap-2 overflow-x-auto px-4 py-3 scrollbar-none sm:px-6">
            {days.length > 1 && (
              <>
                <Chip selected={day === 'ALL'} onClick={() => setDay('ALL')}>
                  Alle Tage
                </Chip>
                {days.map((d) => (
                  <Chip key={d.key} selected={day === d.key} onClick={() => setDay(d.key)}>
                    {fmtShortWeekday(dayKeyToIso(d.key))} {fmtDayMonth(dayKeyToIso(d.key)).replace(/ \S+$/, '')}
                  </Chip>
                ))}
                <span aria-hidden className="mx-1 w-px shrink-0 bg-line" />
              </>
            )}
            <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
              Nur mit freien Plätzen
            </Chip>
            {categories.length > 1 &&
              categories.map((c) => (
                <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? 'ALL' : c)}>
                  {c}
                </Chip>
              ))}
          </div>
        </div>
      )}

      {/* Schichten nach Tag */}
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        {event.shifts.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="Noch keine Schichten"
            description={
              canManageShifts
                ? 'Lege die erste Schicht an. Helfer:innen können sich danach sofort eintragen.'
                : 'Das OK plant die Schichten noch. Schau bald wieder vorbei.'
            }
            action={
              canManageShifts && (
                <Button onClick={() => setShowShiftForm(true)}>
                  <Plus /> Schicht anlegen
                </Button>
              )
            }
          />
        ) : visibleDays.length === 0 ? (
          <EmptyState
            icon={<CalendarSearch />}
            title="Keine passenden Schichten"
            description="Mit diesen Filtern bleibt nichts übrig."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setDay('ALL');
                  setCategory('ALL');
                  setOnlyOpen(false);
                }}
              >
                Filter zurücksetzen
              </Button>
            }
          />
        ) : (
          <div className="space-y-12">
            {visibleDays.map((group) => {
              const dayTotal = group.items.reduce((s, x) => s + x.requiredSlots, 0);
              const dayFilled = group.items.reduce((s, x) => s + Math.min(x.signups?.length ?? 0, x.requiredSlots), 0);
              const iso = dayKeyToIso(group.key);
              return (
                <section key={group.key} aria-labelledby={`day-${group.key}`}>
                  <header className="mb-5 flex items-end justify-between gap-4 border-b border-line pb-3">
                    <h2 id={`day-${group.key}`} className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-3xl font-extrabold tracking-[-0.03em] text-fg sm:text-4xl">
                        {fmtWeekday(iso)}
                      </span>
                      <span className="text-base font-semibold text-fg-subtle">{fmtDayMonth(iso)}</span>
                    </h2>
                    <span
                      className={cn(
                        'tabular shrink-0 text-sm font-semibold',
                        dayFilled >= dayTotal ? 'text-success-ink' : 'text-fg-muted'
                      )}
                    >
                      {dayFilled}/{dayTotal} belegt
                    </span>
                  </header>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {group.items.map((shift, i) => {
                      const mine = shift.signups?.find((s) => user && s.userId === user.id);
                      return (
                        <ShiftTicket
                          key={shift.id}
                          shift={shift}
                          index={i}
                          isMine={Boolean(mine)}
                          canManage={canManageShifts}
                          needsLogin={needsLogin}
                          busy={busyShift === shift.id}
                          onSignup={(task) => signup(shift, task)}
                          onCancel={(signupId) => cancel(shift, signupId)}
                          onRemoveHelper={(signupId, name) => cancel(shift, signupId, name)}
                          onEdit={() => {
                            setEditingShift(shift);
                            setShowShiftForm(true);
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <GuestSignupDialog
        shift={guestShift}
        task={guestTask}
        event={event}
        onClose={() => {
          setGuestShift(null);
          setGuestTask(null);
        }}
        onSignedUp={async (shift) => {
          setGuestShift(null);
          setGuestTask(null);
          toast({
            title: 'Du bist eingetragen!',
            description: `${shift.title}, ${fmtWeekday(shift.startTime)} ab ${fmtTime(shift.startTime)}`,
          });
          await load();
        }}
      />
      <ShiftFormDialog
        open={showShiftForm}
        event={event}
        shift={editingShift}
        onClose={() => {
          setShowShiftForm(false);
          setEditingShift(null);
        }}
        onSaved={async () => {
          setShowShiftForm(false);
          setEditingShift(null);
          await load();
        }}
      />
      <OrganizerDialog
        open={showOkForm}
        eventSlug={event.slug}
        onClose={() => setShowOkForm(false)}
        onSaved={async () => {
          setShowOkForm(false);
          await load();
        }}
      />
      <EventFormDialog
        open={showSettings}
        mode="edit"
        eventSlug={event.slug}
        initial={{
          title: event.title,
          description: event.description ?? '',
          logoUrl: event.logoUrl ?? '',
          bannerUrl: event.bannerUrl ?? '',
          signupMode: event.signupMode,
          requireEmailForGuests: event.requireEmailForGuests ?? false,
          requirePhoneForGuests: event.requirePhoneForGuests ?? false,
        }}
        onClose={() => setShowSettings(false)}
        onSaved={async () => {
          setShowSettings(false);
          await load();
        }}
      />
    </AppShell>
  );
}

function EventSkeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        <Skeleton className="mb-4 h-6 w-32" />
        <Skeleton className="h-[24rem] rounded-card sm:h-[28rem]" />
        <Skeleton className="mt-10 h-10 w-56" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-card" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
