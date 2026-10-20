'use client';

import { use, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  KeyRound,
  Filter,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Wrench,
  X,
  History,
  RefreshCw,
} from 'lucide-react';
import type { ShiftDto, ShiftTaskDto, EventTemplateDto, TaskDefinitionDto, AgeRequirementType, ShiftSignupLogDto } from '@schichtplan/shared';
import { EVENT_ACCESS_TYPES } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
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
import { EventFormDialog, eventFormInitial } from '@/components/EventFormDialog';
import { AccessTypeBadge } from '@/components/event-meta';
import { EventAccessPanel } from '@/components/EventAccessPanel';
import { EventRosterPanel } from '@/components/EventRosterPanel';
import {
  AssignHelperDialog,
  DayResponsiblesDialog,
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

function fmtLogTimestamp(iso: string) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds} Uhr`;
}

export default function EventOkManagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { user, isDeptAdmin, isPlanner, loading: portalLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [tab, setTab] = useState<'shifts' | 'roster' | 'helpers' | 'access' | 'tasks' | 'templates' | 'logs'>('shifts');

  // Filter Schichten
  const [day, setDay] = useState<string>('ALL');
  const [taskFilter, setTaskFilter] = useState<string>('ALL');
  const [propertyFilter, setPropertyFilter] = useState<'ALL' | 'EVENT' | 'SETUP_TEARDOWN'>('ALL');
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
  const [dayResponsiblesTarget, setDayResponsiblesTarget] = useState<{ dayDate: string; dayLabel: string } | null>(null);

  // Arbeiten-Katalog (Task Definitions)
  const [taskDefinitions, setTaskDefinitions] = useState<TaskDefinitionDto[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDefinitionDto | null>(null);

  // Vorlagen
  const [templates, setTemplates] = useState<EventTemplateDto[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Protokoll
  const [logs, setLogs] = useState<ShiftSignupLogDto[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logActionFilter, setLogActionFilter] = useState<'ALL' | 'SIGNUP' | 'SIGNOFF'>('ALL');
  const [logSearch, setLogSearch] = useState('');

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

  const loadTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const data = await api<TaskDefinitionDto[]>('/api/tasks');
      setTaskDefinitions(data);
    } catch {
      // Fehler ignorieren
    } finally {
      setLoadingTasks(false);
    }
  }, []);

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

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const data = await api<ShiftSignupLogDto[]>(`/api/events/${slug}/logs`);
      setLogs(data);
    } catch (err) {
      toast({ title: 'Protokoll konnte nicht geladen werden', description: errorMessage(err), tone: 'error' });
    } finally {
      setLoadingLogs(false);
    }
  }, [slug, toast]);

  useEffect(() => {
    load();
    loadTasks();
  }, [load, loadTasks]);

  useEffect(() => {
    if (tab === 'templates') {
      loadTemplates();
    }
    if (tab === 'tasks') {
      loadTasks();
    }
    if (tab === 'logs') {
      loadLogs();
    }
  }, [tab, loadTemplates, loadTasks, loadLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (logActionFilter !== 'ALL' && l.action !== logActionFilter) return false;
      if (logSearch.trim()) {
        const query = logSearch.toLowerCase();
        const matchesHelper = l.helperName.toLowerCase().includes(query);
        const matchesShift = l.shiftTitle.toLowerCase().includes(query);
        const matchesTask = l.taskTitle?.toLowerCase().includes(query) ?? false;
        const matchesPerformer = l.performedByName?.toLowerCase().includes(query) ?? false;
        if (!matchesHelper && !matchesShift && !matchesTask && !matchesPerformer) return false;
      }
      return true;
    });
  }, [logs, logActionFilter, logSearch]);

  const signupLogCount = useMemo(() => logs.filter((l) => l.action === 'SIGNUP').length, [logs]);
  const signoffLogCount = useMemo(() => logs.filter((l) => l.action === 'SIGNOFF').length, [logs]);

  const days = useMemo(() => groupByBusinessDay(event?.shifts ?? [], event?.dayCutoffTime), [event]);
  const distinctTasks = useMemo(() => {
    if (!event?.shifts) return [];
    const titles = new Set<string>();
    for (const s of event.shifts) {
      if (s.tasks) {
        for (const t of s.tasks) {
          if (t.title?.trim()) titles.add(t.title.trim());
        }
      }
    }
    return Array.from(titles);
  }, [event]);
  const hasSetupTeardownShifts = useMemo(() => {
    return event?.shifts?.some((s) => s.isSetupTeardown) ?? false;
  }, [event]);

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

  // Arbeit (TaskDefinition) löschen
  const handleDeleteTaskDefinition = async (td: TaskDefinitionDto) => {
    const ok = await confirm({
      title: `Arbeit "${td.title}" löschen?`,
      description: 'Diese Arbeit wird aus dem Vorlagen-Katalog entfernt. Bereits erstellte Schichten bleiben unverändert.',
      confirmLabel: 'Arbeit löschen',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await api(`/api/tasks/${td.id}`, { method: 'DELETE' });
      toast({ title: 'Arbeit gelöscht', description: td.title });
      await loadTasks();
    } catch (err) {
      toast({ title: 'Löschen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
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
        const matchesProperty =
          propertyFilter === 'ALL' ||
          (propertyFilter === 'SETUP_TEARDOWN' && s.isSetupTeardown) ||
          (propertyFilter === 'EVENT' && !s.isSetupTeardown);
        const matchesTask =
          taskFilter === 'ALL' ||
          s.tasks?.some((t) => t.title.toLowerCase() === taskFilter.toLowerCase());
        const matchesSearch =
          !search ||
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.tasks?.some((t) => t.title.toLowerCase().includes(search.toLowerCase()));
        const matchesOpen = !onlyOpen || (s.signups?.length ?? 0) < s.requiredSlots;
        return matchesProperty && matchesTask && matchesSearch && matchesOpen;
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
                <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} />
                {event.minShiftsPerPerson ? (
                  <Badge tone="neutral" className="font-semibold text-fg">
                    🎯 Soll: mind. {event.minShiftsPerPerson} Schichten/Person
                  </Badge>
                ) : null}
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
        <div className="-mx-4 mt-8 flex gap-2 overflow-x-auto border-b border-line px-4 pb-px scrollbar-none sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setTab('shifts')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'shifts'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Clock className="size-4" /> Schichten &amp; Einteilung ({event.shifts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('roster')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'roster'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <UserCheck className="size-4" /> Helfer-Pool &amp; Soll
          </button>
          <button
            type="button"
            onClick={() => setTab('helpers')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'helpers'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Users className="size-4" /> Eingetragene Helfer ({uniqueHelpersCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('access')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'access'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <KeyRound className="size-4" /> Zugang &amp; Angaben
          </button>
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'tasks'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Wrench className="size-4" /> Arbeiten-Katalog ({taskDefinitions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('templates')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'templates'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <Copy className="size-4" /> Event-Vorlagen
          </button>
          <button
            type="button"
            onClick={() => setTab('logs')}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition',
              tab === 'logs'
                ? 'border-accent text-accent-ink'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <History className="size-4" /> Protokoll {logs.length > 0 ? `(${logs.length})` : ''}
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

              {/* Aufbau / Abbau Eigenschaft */}
              {hasSetupTeardownShifts && (
                <Chip
                  selected={propertyFilter === 'SETUP_TEARDOWN'}
                  onClick={() => setPropertyFilter(propertyFilter === 'SETUP_TEARDOWN' ? 'ALL' : 'SETUP_TEARDOWN')}
                >
                  🛠️ Nur Auf- &amp; Abbau
                </Chip>
              )}

              {/* Spezifische Arbeiten Filter */}
              {distinctTasks.length > 0 && (
                <>
                  <span className="mx-1 h-4 w-px bg-line" />
                  {distinctTasks.map((title) => (
                    <Chip
                      key={title}
                      selected={taskFilter === title}
                      onClick={() => setTaskFilter(taskFilter === title ? 'ALL' : title)}
                    >
                      {title}
                    </Chip>
                  ))}
                </>
              )}
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
                      setTaskFilter('ALL');
                      setPropertyFilter('ALL');
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
                      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2">
                        <div className="flex flex-wrap items-baseline gap-3">
                          <h2 className="font-display text-2xl font-extrabold text-fg">
                            {fmtWeekday(iso)}{' '}
                            <span className="text-base font-normal text-fg-muted">{fmtDayMonth(iso)}</span>
                          </h2>
                          {event.responsibleMode === 'BY_DAY' && (
                            <div className="flex flex-wrap items-center gap-2">
                              {event.dayResponsibles?.[group.key]?.length ? (
                                <Badge tone="neutral" size="sm" className="font-normal">
                                  Tagesleitung: {event.dayResponsibles[group.key].map((r) => r.displayName).join(', ')}
                                </Badge>
                              ) : (
                                <span className="text-2xs text-fg-subtle italic">Keine Tagesleitung hinterlegt</span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-2xs"
                                onClick={() =>
                                  setDayResponsiblesTarget({
                                    dayDate: group.key,
                                    dayLabel: `${fmtWeekday(iso)} ${fmtDayMonth(iso)}`,
                                  })
                                }
                              >
                                Tagesleitung bearbeiten
                              </Button>
                            </div>
                          )}
                        </div>
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
                                    {shift.isSetupTeardown && (
                                      <Badge tone="warning" className="border-warning/30 bg-warning/15 font-bold text-warning-ink">
                                        🛠️ Aufbau / Abbau
                                      </Badge>
                                    )}
                                    {shift.category ? <Badge>{shift.category}</Badge> : null}
                                    {shift.responsibles && shift.responsibles.length > 0 && (
                                      <Badge tone="neutral" size="sm" className="max-w-[200px] truncate">
                                        Leitung: {shift.responsibles.map((r) => r.displayName).join(', ')}
                                      </Badge>
                                    )}
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
                                  {isFull && event.contactUser && (
                                    <p className="mt-1 text-2xs text-accent-ink font-semibold">
                                      Fragen an: {event.contactUser.displayName}
                                    </p>
                                  )}
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

        {/* ----------------- TAB: HELFER-POOL & SOLL ----------------- */}
        {tab === 'roster' && (
          <EventRosterPanel event={event} onOpenSettings={() => setShowEventSettings(true)} />
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

        {/* ----------------- TAB 3: ARBEITEN-KATALOG ----------------- */}
        {tab === 'access' && <EventAccessPanel event={event} />}

        {tab === 'tasks' && (
          <div className="py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-fg">Wiederverwendbare Arbeiten (Katalog)</h3>
                <p className="text-xs text-fg-muted">
                  Definiere Arbeiten (z.B. Bar, Grill, Kasse, Zeltbau) einmalig und füge sie mit 1 Klick in beliebig viele Schichten ein.
                </p>
              </div>
              <Button size="sm" onClick={() => { setEditingTask(null); setShowTaskDialog(true); }}>
                <Plus className="size-4" /> Neue Arbeit anlegen
              </Button>
            </div>

            {loadingTasks ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-44 rounded-card" />
                <Skeleton className="h-44 rounded-card" />
                <Skeleton className="h-44 rounded-card" />
              </div>
            ) : taskDefinitions.length === 0 ? (
              <EmptyState
                icon={<Wrench />}
                title="Noch keine Arbeiten im Katalog"
                description="Lege typische Arbeiten deiner Abteilung an, um Schichten künftig in Sekunden zu erstellen."
                action={
                  <Button onClick={() => { setEditingTask(null); setShowTaskDialog(true); }}>
                    <Plus className="size-4" /> Erste Arbeit anlegen
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {taskDefinitions.map((taskDef) => {
                  const activeInShifts = event.shifts.filter((s) =>
                    s.tasks?.some(
                      (t) =>
                        (t.taskDefinitionId && t.taskDefinitionId === taskDef.id) ||
                        t.title.toLowerCase() === taskDef.title.toLowerCase()
                    )
                  );

                  return (
                    <Card key={taskDef.id} className="relative flex flex-col justify-between p-5 shadow-soft hover:border-line-strong transition">
                      <div>
                        {/* Header: Icon, Titel & Actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent-ink">
                              <Wrench className="size-4" />
                            </div>
                            <h4 className="font-display text-base font-bold text-fg">{taskDef.title}</h4>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingTask(taskDef);
                                setShowTaskDialog(true);
                              }}
                              aria-label="Arbeit bearbeiten"
                            >
                              <Edit className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => handleDeleteTaskDefinition(taskDef)}
                              className="text-fg-subtle hover:text-danger-ink"
                              aria-label="Arbeit löschen"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Beschreibung */}
                        {taskDef.description ? (
                          <p className="mt-3 text-xs leading-relaxed text-fg-muted">
                            {taskDef.description}
                          </p>
                        ) : (
                          <p className="mt-3 text-xs italic text-fg-subtle">Keine Beschreibung hinterlegt</p>
                        )}

                        {/* Badges: Altersrichtlinie */}
                        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                          {taskDef.minAge ? (
                            <Badge tone="warning">
                              ab {taskDef.minAge} J.{' '}
                              {taskDef.ageRequirementType === 'AT_LEAST_ONE'
                                ? '(mind. 1 in Schicht)'
                                : '(alle Helfer)'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">Kein Mindestalter</Badge>
                          )}
                        </div>
                      </div>

                      {/* Footer: Verwendung & Schnellaktion */}
                      <div className="mt-5 border-t border-line/80 pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-fg-subtle">
                            {activeInShifts.length === 0
                              ? 'In diesem Event noch unbenutzt'
                              : `In ${activeInShifts.length} Schicht(en) aktiv`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowShiftForm(true);
                              setEditingShift(null);
                            }}
                            className="font-bold text-accent-ink hover:underline"
                          >
                            + Schicht erstellen
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB 4: EVENT-VORLAGEN ----------------- */}
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
                            {tpl.shiftCount} Schichten hinterlegt · Zugang: {EVENT_ACCESS_TYPES[tpl.accessType]?.short ?? 'Öffentlich'}
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

        {/* ----------------- TAB: PROTOKOLL (SIGNUP / SIGNOFF LOGS) ----------------- */}
        {tab === 'logs' && (
          <div className="py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-fg">Aktivitäts-Protokoll</h3>
                <p className="text-xs text-fg-muted">
                  Vollständiger Verlauf aller Schichteintragungen und -austragungen für diesen Anlass.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={loadingLogs}
                onClick={loadLogs}
              >
                <RefreshCw className="size-3.5" /> Aktualisieren
              </Button>
            </div>

            {/* Statistik-Karten */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Gesamt-Aktivitäten</p>
                  <p className="font-display text-2xl font-extrabold text-fg mt-1 tabular">{logs.length}</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-tile bg-surface-2 text-fg-subtle">
                  <History className="size-5" />
                </div>
              </Card>

              <Card className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-success-ink uppercase tracking-wider">Eintragungen</p>
                  <p className="font-display text-2xl font-extrabold text-success-ink mt-1 tabular">{signupLogCount}</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-tile bg-success/15 text-success-ink">
                  <UserPlus className="size-5" />
                </div>
              </Card>

              <Card className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-danger-ink uppercase tracking-wider">Austragungen</p>
                  <p className="font-display text-2xl font-extrabold text-danger-ink mt-1 tabular">{signoffLogCount}</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-tile bg-danger/15 text-danger-ink">
                  <UserMinus className="size-5" />
                </div>
              </Card>
            </div>

            {/* Filter-Leiste */}
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip
                  selected={logActionFilter === 'ALL'}
                  onClick={() => setLogActionFilter('ALL')}
                >
                  Alle ({logs.length})
                </Chip>
                <Chip
                  selected={logActionFilter === 'SIGNUP'}
                  onClick={() => setLogActionFilter('SIGNUP')}
                >
                  Nur Eintragungen ({signupLogCount})
                </Chip>
                <Chip
                  selected={logActionFilter === 'SIGNOFF'}
                  onClick={() => setLogActionFilter('SIGNOFF')}
                >
                  Nur Austragungen ({signoffLogCount})
                </Chip>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                <input
                  type="text"
                  placeholder="Helfer, Schicht oder OK..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full rounded-field border border-line bg-surface-1 py-1.5 pl-9 pr-8 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
                {logSearch && (
                  <button
                    type="button"
                    onClick={() => setLogSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Log-Liste */}
            {loadingLogs && logs.length === 0 ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-card" />
                <Skeleton className="h-16 w-full rounded-card" />
                <Skeleton className="h-16 w-full rounded-card" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <EmptyState
                icon={<History />}
                title={logs.length === 0 ? 'Noch keine Aktivitäten' : 'Keine passenden Einträge'}
                description={
                  logs.length === 0
                    ? 'Sobald sich Helfer:innen für Schichten ein- oder austragen, wird der Verlauf hier mit Zeitstempel und Verantwortlichen angezeigt.'
                    : 'Passe den Filter oder den Suchbegriff an.'
                }
              />
            ) : (
              <div className="space-y-2">
                {filteredLogs.map((item) => {
                  const isSignup = item.action === 'SIGNUP';
                  return (
                    <Card
                      key={item.id}
                      className={cn(
                        'flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between transition',
                        isSignup
                          ? 'border-line/70 hover:border-success/40'
                          : 'border-line/70 hover:border-danger/40'
                      )}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full mt-0.5',
                            isSignup
                              ? 'bg-success/15 text-success-ink'
                              : 'bg-danger/15 text-danger-ink'
                          )}
                        >
                          {isSignup ? <UserPlus className="size-4" /> : <UserMinus className="size-4" />}
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-fg">{item.helperName}</span>
                            <Badge tone={isSignup ? 'success' : 'danger'} size="sm">
                              {isSignup ? 'Eintragung' : 'Austragung'}
                            </Badge>
                            {item.performedByName && (
                              <Badge tone="neutral" size="sm">
                                durch {item.performedByName}
                              </Badge>
                            )}
                            {!item.performedByName && (
                              <span className="text-[11px] text-fg-subtle">
                                (selbstständig)
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-fg">«{item.shiftTitle}»</span>
                            {item.taskTitle && (
                              <>
                                <span className="text-fg-subtle">•</span>
                                <span>Arbeit: <strong className="text-fg-muted">{item.taskTitle}</strong></span>
                              </>
                            )}
                            {item.shiftStartTime && item.shiftEndTime && (
                              <>
                                <span className="text-fg-subtle">•</span>
                                <span className="font-mono text-[11px]">
                                  {fmtWeekday(item.shiftStartTime)}, {fmtTime(item.shiftStartTime)} – {fmtTime(item.shiftEndTime)}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-left sm:text-right border-t border-line/50 pt-2 sm:border-0 sm:pt-0">
                        <span className="text-[11px] font-mono text-fg-subtle tabular">
                          {fmtLogTimestamp(item.createdAt)}
                        </span>
                      </div>
                    </Card>
                  );
                })}
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
        eventSlug={event.slug}
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
        initial={eventFormInitial(event)}
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

      <DayResponsiblesDialog
        open={Boolean(dayResponsiblesTarget)}
        event={event}
        dayDate={dayResponsiblesTarget?.dayDate ?? ''}
        dayLabel={dayResponsiblesTarget?.dayLabel ?? ''}
        onClose={() => setDayResponsiblesTarget(null)}
        onSaved={async () => {
          setDayResponsiblesTarget(null);
          await load();
        }}
      />

      <TaskDefinitionDialog
        open={showTaskDialog}
        task={editingTask}
        onClose={() => {
          setShowTaskDialog(false);
          setEditingTask(null);
        }}
        onSaved={async () => {
          setShowTaskDialog(false);
          setEditingTask(null);
          await loadTasks();
        }}
      />
    </AppShell>
  );
}

function TaskDefinitionDialog({
  open,
  task,
  onClose,
  onSaved,
}: {
  open: boolean;
  task: TaskDefinitionDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(task);
  const toast = useToast();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [minAge, setMinAge] = useState(task?.minAge || 0);
  const [ageRequirementType, setAgeRequirementType] = useState<AgeRequirementType>(task?.ageRequirementType || 'ALL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setMinAge(task.minAge || 0);
      setAgeRequirementType(task.ageRequirementType || 'ALL');
    } else {
      setTitle('');
      setDescription('');
      setMinAge(0);
      setAgeRequirementType('ALL');
    }
    setError(null);
  }, [task, open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Bitte einen Namen für die Arbeit angeben.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        minAge: minAge > 0 ? minAge : null,
        ageRequirementType,
      };

      if (isEdit && task) {
        await api(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          json: payload,
        });
        toast({ title: 'Arbeit aktualisiert', description: title });
      } else {
        await api('/api/tasks', {
          method: 'POST',
          json: payload,
        });
        toast({ title: 'Arbeit angelegt', description: title });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Wrench />}
      title={isEdit ? 'Arbeit bearbeiten' : 'Neue Arbeit definieren'}
      description="Wiederverwendbare Arbeit für alle Schichten deiner Abteilung."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <Field label="Titel der Arbeit" required>
          <Input
            value={title}
            autoFocus
            placeholder="z.B. Bar, Grill, Kasse, Zeltbau, Küche"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label="Beschreibung / Aufgaben">
          <Textarea
            rows={2}
            value={description}
            placeholder="Aufgabenbeschreibung für Helfer..."
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {/* Mindestalter */}
        <div className="flex flex-col gap-1.5 rounded-field border border-line bg-surface-2 p-3">
          <span className="text-[13px] font-semibold text-fg">Mindestalter für diese Arbeit</span>
          <div className="mt-1 grid h-9 grid-cols-4 gap-1">
            {[0, 14, 16, 18].map((age) => (
              <button
                key={age}
                type="button"
                onClick={() => setMinAge(age)}
                className={cn(
                  'rounded-[0.5rem] text-xs font-semibold transition',
                  minAge === age ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
                )}
              >
                {age === 0 ? 'Keins' : `ab ${age}`}
              </button>
            ))}
          </div>
        </div>

        {minAge > 0 && (
          <div className="flex flex-col gap-1.5 rounded-field border border-line bg-surface-2 p-3">
            <span className="text-[13px] font-semibold text-fg">Alters-Anforderung in der Schicht</span>
            <div className="mt-1 grid h-9 grid-cols-2 gap-1 rounded-field border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setAgeRequirementType('ALL')}
                className={cn(
                  'rounded-[0.4rem] text-xs font-semibold transition',
                  ageRequirementType === 'ALL'
                    ? 'bg-accent/15 text-accent-ink font-bold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                Alle Helfer
              </button>
              <button
                type="button"
                onClick={() => setAgeRequirementType('AT_LEAST_ONE')}
                className={cn(
                  'rounded-[0.4rem] text-xs font-semibold transition',
                  ageRequirementType === 'AT_LEAST_ONE'
                    ? 'bg-accent/15 text-accent-ink font-bold'
                    : 'text-fg-muted hover:text-fg'
                )}
                title="Mindestens 1 Person in der Schicht muss das Alter haben"
              >
                Mind. 1 in Schicht
              </button>
            </div>
            <p className="text-2xs text-fg-muted mt-1">
              {ageRequirementType === 'ALL'
                ? 'Jede:r Helfer:in für diese Arbeit muss mindestens das Mindestalter erfüllen.'
                : 'Nur die letzte offene Stelle wird gesperrt, falls noch niemand in der Schicht das Alter erfüllt.'}
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} type="button">
            Abbrechen
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Änderungen speichern' : 'Arbeit anlegen'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
