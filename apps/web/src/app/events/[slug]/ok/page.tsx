'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  FileText,
  Filter,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ShiftDto, ShiftTaskDto, EventTemplateDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Input,
  ProgressRing,
  Skeleton,
  Textarea,
  buttonClasses,
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { EventFormDialog } from '@/components/EventFormDialog';
import { SignupModeBadge } from '@/components/event-meta';
import {
  AssignHelperDialog,
  DuplicateShiftDialog,
  OrganizerDialog,
  SaveTemplateDialog,
  ShiftFormDialog,
} from '@/components/ShiftDialogs';
import { ApiError, api, errorMessage, loginUrl } from '@/lib/api';
import {
  dayKeyToIso,
  fmtDateRange,
  fmtDayMonth,
  fmtDuration,
  fmtShortWeekday,
  fmtTime,
  fmtWeekday,
  groupByBusinessDay,
} from '@/lib/format';
import { usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';

interface HelperSummary {
  key: string;
  displayName: string;
  userId?: string | null;
  userCeviName?: string | null;
  userBirthDate?: string | null;
  userAge?: number | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  shifts: Array<{ shift: ShiftDto; taskTitle?: string | null; signupId: string }>;
}

export default function EventOkManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, isDeptAdmin, isPlanner, loading: portalLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [tab, setTab] = useState<'shifts' | 'helpers' | 'templates'>('shifts');

  // Filter Schichten
  const [day, setDay] = useState<string>('ALL');
  const [category, setCategory] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  // Filter Helfer
  const [helperSearch, setHelperSearch] = useState('');

  // Dialog-Zustände
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [duplicatingShift, setDuplicatingShift] = useState<ShiftDto | null>(null);

  const [assigningShift, setAssigningShift] = useState<ShiftDto | null>(null);
  const [assigningTask, setAssigningTask] = useState<ShiftTaskDto | null>(null);

  const [showEventSettings, setShowEventSettings] = useState(false);
  const [showOrganizerDialog, setShowOrganizerDialog] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);

  // Vorlagen
  const [templates, setTemplates] = useState<EventTemplateDto[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<EventDetails>(`/api/events/${slug}`);
      setEvent(data);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'Event nicht gefunden' : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const data = await api<EventTemplateDto[]>('/api/event-templates');
      setTemplates(data);
    } catch {
      // Fehler ignorieren
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'templates') {
      loadTemplates();
    }
  }, [tab, loadTemplates]);

  const days = useMemo(() => groupByBusinessDay(event?.shifts ?? []), [event]);
  const categories = useMemo(() => Array.from(new Set(event?.shifts.map((s) => s.category))), [event]);

  // Berechnungen für Statistiken
  const totalSlots = event?.shifts.reduce((sum, s) => sum + s.requiredSlots, 0) ?? 0;
  const filledSlots =
    event?.shifts.reduce((sum, s) => sum + Math.min(s.signups?.length ?? 0, s.requiredSlots), 0) ?? 0;
  const freeSlots = Math.max(0, totalSlots - filledSlots);
  const percentFilled = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;

  // Helfer-Aggregation
  const helpersMap = useMemo(() => {
    if (!event) return new Map<string, HelperSummary>();

    const map = new Map<string, HelperSummary>();
    for (const shift of event.shifts) {
      for (const signup of shift.signups ?? []) {
        const key = signup.userId || signup.guestName || signup.id;
        if (!map.has(key)) {
          map.set(key, {
            key,
            displayName: signup.displayName,
            userId: signup.userId,
            userCeviName: signup.userCeviName,
            userBirthDate: signup.userBirthDate,
            userAge: signup.userAge,
            guestEmail: signup.guestEmail,
            guestPhone: signup.guestPhone,
            shifts: [],
          });
        }
        map.get(key)!.shifts.push({
          shift,
          taskTitle: signup.taskTitle,
          signupId: signup.id,
        });
      }
    }
    return map;
  }, [event]);

  const uniqueHelpersCount = helpersMap.size;

  // Jugendschutz-Prüfung: Schichten mit AT_LEAST_ONE Mindestalter
  const ageComplianceWarnings = useMemo(() => {
    if (!event) return [];
    const warnings: Array<{ shift: ShiftDto; task: ShiftTaskDto; message: string }> = [];

    for (const shift of event.shifts) {
      for (const task of shift.tasks ?? []) {
        if (task.minAge && task.ageRequirementType === 'AT_LEAST_ONE') {
          const shiftSignups = shift.signups ?? [];
          const hasOldEnoughHelper = shiftSignups.some((su) => su.userAge !== null && su.userAge !== undefined && su.userAge >= task.minAge!);

          if (!hasOldEnoughHelper) {
            warnings.push({
              shift,
              task,
              message: `Arbeit "${task.title}": Mindestens 1 Person ab ${task.minAge} Jahren erforderlich (aktuell noch niemand ab ${task.minAge} eingeteilt).`,
            });
          }
        }
      }
    }
    return warnings;
  }, [event]);

  // Berechtigung
  const isEventOk = Boolean(user && event?.organizers?.some((o) => o.userId === user.id));
  const canManage = Boolean(isDeptAdmin || isPlanner || user?.isGlobalAdmin || isEventOk);

  if (loading || portalLoading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-4 pt-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-44 rounded-card mb-8" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !event) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pt-16">
          <EmptyState
            icon={<AlertTriangle />}
            title="Anlass nicht gefunden"
            description={error || 'Der gesuchte Anlass konnte nicht geladen werden.'}
            action={
              <Link href="/" className={buttonClasses()}>
                Zurück zur Startseite
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  if (!canManage) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pt-16">
          <EmptyState
            icon={<Shield className="size-12 text-warning-ink" />}
            title="Keine Berechtigung"
            description="Dieser Bereich ist ausschliesslich für das Event-OK und die Abteilungsleitung bestimmt."
            action={
              <Link href={`/events/${event.slug}`} className={buttonClasses()}>
                Zum öffentlichen Schichtplan
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  // Löschen einer Schicht
  const handleDeleteShift = async (shift: ShiftDto) => {
    const ok = await confirm({
      title: `Schicht "${shift.title}" löschen?`,
      description: `Die Schicht und alle ${shift.signups?.length || 0} Helfer-Eintragungen werden unwiderruflich gelöscht.`,
      confirmLabel: 'Schicht löschen',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await api(`/api/shifts/${shift.id}`, { method: 'DELETE' });
      toast({ title: 'Schicht gelöscht', description: shift.title });
      await load();
    } catch (err) {
      toast({ title: 'Löschen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  // Helfer aus einzelner Schicht austragen
  const handleRemoveSignup = async (shift: ShiftDto, signupId: string, name: string) => {
    const ok = await confirm({
      title: `${name} austragen?`,
      description: `Wird aus der Schicht "${shift.title}" entfernt.`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await api(`/api/shifts/${shift.id}/signup?signupId=${signupId}`, { method: 'DELETE' });
      toast({ title: `${name} ausgetragen` });
      await load();
    } catch (err) {
      toast({ title: 'Austragen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  // Helfer komplett vom Event abmelden
  const handleUnregisterHelperCompletely = async (helper: {
    displayName: string;
    userId?: string | null;
    guestName?: string | null;
    shiftsCount: number;
  }) => {
    const ok = await confirm({
      title: `${helper.displayName} komplett abmelden?`,
      description: `Person wird aus ALLEN ${helper.shiftsCount} Schichten dieses Events ausgetragen.`,
      confirmLabel: 'Komplett abmelden',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await api(`/api/events/${event.slug}/unregister-helper`, {
        method: 'POST',
        json: {
          userId: helper.userId || undefined,
          guestName: helper.guestName || (!helper.userId ? helper.displayName : undefined),
        },
      });
      toast({
        title: `${helper.displayName} abgemeldet`,
        description: `Aus ${helper.shiftsCount} Schichten entfernt`,
      });
      await load();
    } catch (err) {
      toast({ title: 'Abmelden fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  // Vorlage löschen
  const handleDeleteTemplate = async (template: EventTemplateDto) => {
    const ok = await confirm({
      title: `Vorlage "${template.title}" löschen?`,
      description: 'Diese Vorlage kann danach nicht mehr für künftige Events verwendet werden.',
      confirmLabel: 'Vorlage löschen',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await api(`/api/event-templates/${template.id}`, { method: 'DELETE' });
      toast({ title: 'Vorlage gelöscht', description: template.title });
      await loadTemplates();
    } catch (err) {
      toast({ title: 'Löschen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  // Filter für Schichten
  const filteredDays = days
    .filter((d) => day === 'ALL' || d.key === day)
    .map((d) => ({
      ...d,
      items: d.items.filter((s) => {
        const matchesCategory = category === 'ALL' || s.category === category;
        const matchesSearch =
          !search ||
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.tasks?.some((t) => t.title.toLowerCase().includes(search.toLowerCase()));
        const matchesOpen = !onlyOpen || (s.signups?.length ?? 0) < s.requiredSlots;
        return matchesCategory && matchesSearch && matchesOpen;
      }),
    }))
    .filter((d) => d.items.length > 0);

  // Filter für Helfer
  const filteredHelpers = Array.from(helpersMap.values()).filter((h) => {
    if (!helperSearch) return true;
    const q = helperSearch.toLowerCase();
    return (
      h.displayName.toLowerCase().includes(q) ||
      (h.userCeviName && h.userCeviName.toLowerCase().includes(q)) ||
      (h.guestEmail && h.guestEmail.toLowerCase().includes(q))
    );
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        {/* Navigation & Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link
            href={`/events/${event.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-semibold text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Zum öffentlichen Schichtplan
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => { setEditingShift(null); setShowShiftForm(true); }}>
              <Plus className="size-4" /> Neue Schicht
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSaveTemplateDialog(true)}>
              <Copy className="size-4" /> Als Vorlage speichern
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowEventSettings(true)}>
              <Edit className="size-4" /> Event-Einstellungen
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowOrganizerDialog(true)}>
              <UserPlus className="size-4" /> OK-Team
            </Button>
          </div>
        </div>

        {/* Hero / Titelbanner */}
        <section className="relative overflow-hidden rounded-card border border-line bg-surface p-6 shadow-soft sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge tone="accent">
                  <Shield className="size-3" /> OK-Dashboard
                </Badge>
                <SignupModeBadge mode={event.signupMode} />
              </div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
                {event.title}
              </h1>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-fg-muted">
                <CalendarDays className="size-4" />
                {fmtDateRange(event.startDate, event.endDate)}
              </p>
            </div>

            {/* Kachel Belegung */}
            <div className="flex items-center gap-4 rounded-card border border-line bg-surface-2 p-4">
              <ProgressRing
                value={filledSlots}
                max={totalSlots}
                size={84}
                stroke={8}
                label={`${percentFilled}%`}
                sublabel="belegt"
                tone={freeSlots === 0 ? 'success' : 'accent'}
              />
              <div>
                <p className="font-display text-2xl font-bold text-fg">
                  {filledSlots} <span className="text-sm font-normal text-fg-muted">/ {totalSlots} Plätzen</span>
                </p>
                <p className="text-xs text-fg-muted mt-0.5">
                  {freeSlots === 0 ? 'Voll besetzt!' : `${freeSlots} noch frei`}
                </p>
                <p className="text-xs font-semibold text-accent-ink mt-2">
                  {uniqueHelpersCount} Helfer:innen eingetragen
                </p>
              </div>
            </div>
          </div>

          {/* Warnung bei Altersrichtlinien */}
          {ageComplianceWarnings.length > 0 && (
            <div className="mt-6 rounded-field border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 shrink-0 text-warning-ink mt-0.5" />
                <div className="min-w-0 text-sm">
                  <p className="font-bold text-fg">
                    Jugendschutz-Hinweis: Mindestalter noch nicht erfüllt ({ageComplianceWarnings.length})
                  </p>
                  <ul className="mt-2 space-y-1 list-disc pl-4 text-xs text-fg-muted">
                    {ageComplianceWarnings.map((w, idx) => (
                      <li key={idx}>
                        <strong>{w.shift.title}:</strong> {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Tab-Auswahl */}
        <div className="mt-8 flex gap-2 border-b border-line pb-px">
          <button
            type="button"
            onClick={() => setTab('shifts')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'shifts'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Clock className="size-4" /> Schichten &amp; Einteilung ({event.shifts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('helpers')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'helpers'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Users className="size-4" /> Alle Helfer ({uniqueHelpersCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('templates')}
            className={cn(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'templates'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Copy className="size-4" /> Event-Vorlagen
          </button>
        </div>

        {/* ----------------- TAB 1: SCHICHTEN & ARBEITEN ----------------- */}
        {tab === 'shifts' && (
          <div className="py-6 space-y-6">
            {/* Filter-Leiste */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-subtle" />
                <Input
                  className="pl-9 h-9 text-sm"
                  placeholder="Schicht oder Arbeit suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {days.length > 1 && (
                <>
                  <Chip selected={day === 'ALL'} onClick={() => setDay('ALL')}>
                    Alle Tage
                  </Chip>
                  {days.map((d) => (
                    <Chip key={d.key} selected={day === d.key} onClick={() => setDay(d.key)}>
                      {fmtShortWeekday(dayKeyToIso(d.key))} {fmtDayMonth(dayKeyToIso(d.key))}
                    </Chip>
                  ))}
                  <span className="mx-1 h-4 w-px bg-line" />
                </>
              )}

              <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
                Nur offene Schichten
              </Chip>

              {categories.length > 1 &&
                categories.map((c) => (
                  <Chip key={c} selected={category === c} onClick={() => setCategory(category === c ? 'ALL' : c)}>
                    {c}
                  </Chip>
                ))}
            </div>

            {/* Schichten-Liste */}
            {event.shifts.length === 0 ? (
              <EmptyState
                icon={<CalendarDays />}
                title="Keine Schichten vorhanden"
                description="Lege die erste Schicht für diesen Anlass an."
                action={
                  <Button onClick={() => { setEditingShift(null); setShowShiftForm(true); }}>
                    <Plus className="size-4" /> Erste Schicht anlegen
                  </Button>
                }
              />
            ) : filteredDays.length === 0 ? (
              <EmptyState
                icon={<Filter />}
                title="Keine Schichten gefunden"
                description="Keine Schichten entsprechen deinen aktuellen Filtern."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDay('ALL');
                      setCategory('ALL');
                      setSearch('');
                      setOnlyOpen(false);
                    }}
                  >
                    Filter zurücksetzen
                  </Button>
                }
              />
            ) : (
              <div className="space-y-10">
                {filteredDays.map((group) => {
                  const iso = dayKeyToIso(group.key);
                  return (
                    <section key={group.key} className="space-y-4">
                      <header className="flex items-baseline justify-between border-b border-line pb-2">
                        <h2 className="font-display text-2xl font-extrabold text-fg">
                          {fmtWeekday(iso)}{' '}
                          <span className="text-base font-normal text-fg-muted">{fmtDayMonth(iso)}</span>
                        </h2>
                        <span className="text-xs font-semibold text-fg-muted">
                          {group.items.length} Schicht(en)
                        </span>
                      </header>

                      <div className="grid gap-4 lg:grid-cols-2">
                        {group.items.map((shift) => {
                          const shiftSignups = shift.signups ?? [];
                          const shiftFilled = shiftSignups.length;
                          const shiftTotal = shift.requiredSlots;
                          const isFull = shiftFilled >= shiftTotal;

                          return (
                            <Card key={shift.id} className="relative flex flex-col gap-4 p-5 shadow-soft">
                              {/* Schicht Header */}
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    <Badge>{shift.category}</Badge>
                                    {shift.minAge ? (
                                      <Badge tone="warning">Schicht ab {shift.minAge} J.</Badge>
                                    ) : null}
                                    <span
                                      className={cn(
                                        'rounded-full px-2 py-0.5 text-2xs font-semibold',
                                        isFull ? 'bg-success/15 text-success-ink' : 'bg-surface-2 text-fg-muted'
                                      )}
                                    >
                                      {shiftFilled}/{shiftTotal} besetzt
                                    </span>
                                  </div>
                                  <h3 className="text-lg font-bold text-fg">{shift.title}</h3>
                                  <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-fg-muted">
                                    <Clock className="size-3.5" />
                                    {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)} (
                                    {fmtDuration(shift.startTime, shift.endTime)})
                                  </p>
                                </div>

                                {/* Schicht-Aktionen */}
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    title="Schicht bearbeiten"
                                    onClick={() => {
                                      setEditingShift(shift);
                                      setShowShiftForm(true);
                                    }}
                                  >
                                    <Edit className="size-4" />
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    title="Schicht duplizieren (Folgeschicht)"
                                    onClick={() => setDuplicatingShift(shift)}
                                  >
                                    <Copy className="size-4" />
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    title="Schicht löschen"
                                    onClick={() => handleDeleteShift(shift)}
                                    className="hover:text-danger-ink"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>

                              {shift.description && (
                                <p className="text-xs leading-relaxed text-fg-muted">{shift.description}</p>
                              )}

                              {/* Sektion Arbeiten (Tasks) */}
                              <div className="space-y-3 rounded-field border border-line bg-surface-2/70 p-3">
                                <span className="block text-xs font-bold uppercase tracking-wider text-fg-subtle">
                                  Arbeiten &amp; Eingeteilte Helfer
                                </span>

                                <div className="space-y-2">
                                  {shift.tasks?.map((task) => {
                                    const taskSignups = shiftSignups.filter((s) => s.taskId === task.id);
                                    const taskFull = taskSignups.length >= task.requiredSlots;

                                    // Jugendschutzprüfung für diese Arbeit
                                    const hasAdult =
                                      !task.minAge ||
                                      taskSignups.some(
                                        (s) => s.userAge !== null && s.userAge !== undefined && s.userAge >= task.minAge!
                                      );

                                    return (
                                      <div
                                        key={task.id}
                                        className="rounded-field border border-line bg-surface p-2.5 text-xs"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">
                                            <span>{task.title}</span>
                                            {task.minAge ? (
                                              <Badge size="sm" tone="warning">
                                                ab {task.minAge} J. (
                                                {task.ageRequirementType === 'ALL' ? 'alle' : 'mind. 1 in Schicht'})
                                              </Badge>
                                            ) : null}
                                            <span className="text-2xs text-fg-muted">
                                              ({taskSignups.length}/{task.requiredSlots})
                                            </span>
                                          </div>

                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => {
                                              setAssigningShift(shift);
                                              setAssigningTask(task);
                                            }}
                                            disabled={taskFull}
                                          >
                                            <UserPlus className="size-3" /> Einteilen
                                          </Button>
                                        </div>

                                        {/* Statusanzeige für AT_LEAST_ONE */}
                                        {task.minAge && task.ageRequirementType === 'AT_LEAST_ONE' && (
                                          <p className="mt-1 text-2xs">
                                            {hasAdult ? (
                                              <span className="inline-flex items-center gap-1 text-success-ink font-semibold">
                                                <CheckCircle2 className="size-3" /> Altersvorgabe (ab {task.minAge}) erfüllt
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-warning-ink font-semibold">
                                                <AlertTriangle className="size-3" /> Noch niemand ab {task.minAge} in Schicht
                                              </span>
                                            )}
                                          </p>
                                        )}

                                        {/* Helfer-Liste */}
                                        {taskSignups.length > 0 ? (
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {taskSignups.map((su) => (
                                              <span
                                                key={su.id}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-1.5 pr-2 text-xs font-medium text-fg"
                                              >
                                                <Avatar name={su.displayName} size="sm" className="size-4 text-[8px]" />
                                                <span>{su.displayName}</span>
                                                {su.userAge !== null && su.userAge !== undefined && (
                                                  <span className="text-2xs text-fg-muted font-normal">
                                                    ({su.userAge} J.)
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => handleRemoveSignup(shift, su.id, su.displayName)}
                                                  className="rounded-full p-0.5 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                                                  title={`${su.displayName} austragen`}
                                                >
                                                  <X className="size-3" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="mt-1 text-2xs italic text-fg-muted">Noch niemand eingeteilt.</p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB 2: ALLE HELFER ----------------- */}
        {tab === 'helpers' && (
          <div className="py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative min-w-[16rem] flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-subtle" />
                <Input
                  className="pl-9 h-9 text-sm"
                  placeholder="Helfer nach Name, Cevi-Name oder E-Mail suchen…"
                  value={helperSearch}
                  onChange={(e) => setHelperSearch(e.target.value)}
                />
              </div>
              <span className="text-xs font-semibold text-fg-muted">
                {filteredHelpers.length} von {uniqueHelpersCount} Helfer:innen
              </span>
            </div>

            {filteredHelpers.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title="Keine Helfer:innen gefunden"
                description={helperSearch ? 'Kein Treffer für diese Suche.' : 'Es sind noch keine Helfer eingetragen.'}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredHelpers.map((helper) => (
                  <Card key={helper.key} className="flex flex-col justify-between p-5 shadow-soft">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={helper.displayName} size="md" />
                          <div>
                            <p className="font-bold text-fg">{helper.displayName}</p>
                            {helper.userAge !== null && helper.userAge !== undefined && (
                              <p className="text-xs text-fg-muted">Alter: {helper.userAge} Jahre</p>
                            )}
                          </div>
                        </div>
                        <Badge tone="accent">{helper.shifts.length} Schicht(en)</Badge>
                      </div>

                      {/* Kontaktdaten falls vorhanden */}
                      {(helper.guestEmail || helper.guestPhone) && (
                        <div className="mt-3 text-xs text-fg-muted space-y-0.5 border-t border-line pt-2">
                          {helper.guestEmail && <p>E-Mail: {helper.guestEmail}</p>}
                          {helper.guestPhone && <p>Tel: {helper.guestPhone}</p>}
                        </div>
                      )}

                      {/* Eingeteilte Schichten */}
                      <div className="mt-4 space-y-1.5 border-t border-line pt-3">
                        <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">Schichten:</p>
                        <ul className="space-y-1 text-xs">
                          {helper.shifts.map(({ shift, taskTitle, signupId }) => (
                            <li key={signupId} className="flex items-center justify-between gap-2 text-fg-muted">
                              <span className="truncate">
                                <strong>{shift.title}</strong>
                                {taskTitle ? ` (${taskTitle})` : ''} · {fmtShortWeekday(shift.startTime)}{' '}
                                {fmtTime(shift.startTime)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveSignup(shift, signupId, helper.displayName)}
                                className="shrink-0 p-1 text-fg-subtle hover:text-danger-ink"
                                title="Aus dieser Schicht austragen"
                              >
                                <X className="size-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Komplett abmelden Button */}
                    <div className="mt-5 border-t border-line pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleUnregisterHelperCompletely({
                            displayName: helper.displayName,
                            userId: helper.userId,
                            guestName: !helper.userId ? helper.displayName : undefined,
                            shiftsCount: helper.shifts.length,
                          })
                        }
                        className="w-full text-danger-ink hover:bg-danger/10"
                      >
                        <UserMinus className="size-3.5" /> Vom Event abmelden
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB 3: EVENT-VORLAGEN ----------------- */}
        {tab === 'templates' && (
          <div className="py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-fg">Gespeicherte Event-Vorlagen</h3>
                <p className="text-xs text-fg-muted">
                  Vorlagen speichern die gesamte Struktur (Schichten, Arbeiten, Mindestalter) für das nächste Jahr.
                </p>
              </div>
              <Button size="sm" onClick={() => setShowSaveTemplateDialog(true)}>
                <Copy className="size-4" /> Aktuelles Event als Vorlage speichern
              </Button>
            </div>

            {loadingTemplates ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-44 rounded-card" />
                <Skeleton className="h-44 rounded-card" />
              </div>
            ) : templates.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="Noch keine Vorlagen"
                description="Speichere diesen Anlass als Vorlage ab, um ihn künftig auf Knopfdruck für neue Daten anzuwenden."
                action={
                  <Button onClick={() => setShowSaveTemplateDialog(true)}>
                    <Copy className="size-4" /> Als Vorlage speichern
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {templates.map((tpl) => (
                  <Card key={tpl.id} className="flex flex-col justify-between p-5 shadow-soft">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-bold text-fg">{tpl.title}</h4>
                          <p className="text-xs text-fg-muted mt-0.5">
                            {tpl.shiftCount} Schichten hinterlegt · Modus: {tpl.signupMode}
                          </p>
                        </div>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDeleteTemplate(tpl)}
                          className="hover:text-danger-ink"
                          title="Vorlage löschen"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      {tpl.description && (
                        <p className="mt-2 text-xs leading-relaxed text-fg-muted">{tpl.description}</p>
                      )}

                      {/* Vorschau Schichten */}
                      <div className="mt-4 space-y-1 rounded-field bg-surface-2 p-3 text-xs text-fg-muted">
                        <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">Enthaltene Schichten:</p>
                        <ul className="space-y-1 list-disc pl-4 text-2xs">
                          {tpl.data?.shifts?.slice(0, 5).map((s, i) => (
                            <li key={i}>
                              <strong>{s.title}</strong> (Tag {s.dayOffset + 1}, {s.startTimeStr}–{s.endTimeStr}) ·{' '}
                              {s.tasks?.length || 1} Arbeit(en)
                            </li>
                          ))}
                          {(tpl.data?.shifts?.length || 0) > 5 && (
                            <li className="italic">... und {tpl.data.shifts.length - 5} weitere Schichten</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-line pt-3">
                      <Link
                        href={`/?templateId=${tpl.id}&createEvent=1`}
                        className={buttonClasses({ variant: 'primary', size: 'sm', className: 'w-full' })}
                      >
                        <Plus className="size-4" /> Neues Event aus dieser Vorlage erstellen
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialoge */}
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

      <AssignHelperDialog
        open={assigningShift !== null}
        shift={assigningShift}
        task={assigningTask}
        onClose={() => {
          setAssigningShift(null);
          setAssigningTask(null);
        }}
        onAssigned={async () => {
          setAssigningShift(null);
          setAssigningTask(null);
          await load();
        }}
      />

      <DuplicateShiftDialog
        open={duplicatingShift !== null}
        shift={duplicatingShift}
        onClose={() => setDuplicatingShift(null)}
        onDuplicated={async () => {
          setDuplicatingShift(null);
          await load();
        }}
      />

      <SaveTemplateDialog
        open={showSaveTemplateDialog}
        eventSlug={event.slug}
        defaultTitle={event.title}
        onClose={() => setShowSaveTemplateDialog(false)}
        onSaved={async () => {
          setShowSaveTemplateDialog(false);
          if (tab === 'templates') await loadTemplates();
        }}
      />

      <EventFormDialog
        open={showEventSettings}
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
        onClose={() => setShowEventSettings(false)}
        onSaved={async () => {
          setShowEventSettings(false);
          await load();
        }}
      />

      <OrganizerDialog
        open={showOrganizerDialog}
        eventSlug={event.slug}
        onClose={() => setShowOrganizerDialog(false)}
        onSaved={async () => {
          setShowOrganizerDialog(false);
          await load();
        }}
      />
    </AppShell>
  );
}
