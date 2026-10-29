'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarSearch,
  Check,
  Coffee,
  Crown,
  LayoutGrid,
  List,
  Lock,
  LogIn,
  Palette,
  Plus,
  Shield,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  cancelDeadlineAt,
  cancelDeadlineText,
  isSignupTimeOpen,
  type RequiredProfileField,
  type ShiftDto,
  type ShiftSignupDto,
  type ShiftTaskDto,
} from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  CeviLogo,
  Chip,
  EmptyState,
  NotFoundView,
  Skeleton,
  buttonClasses,
  cn,
  trackUi,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { useCommandPalette } from '@/components/command';
import { AccessTypeBadge } from '@/components/event-meta';
import { AccessNotice } from '@/components/event/AccessNotice';
import { SignupCountdown } from '@/components/SignupCountdown';
import { ParticipationDialog } from '@/components/event/ParticipationDialog';
import { ReplacementDialog } from '@/components/event/ReplacementDialog';
import { ShiftGrid } from '@/components/event/ShiftGrid';
import { NeededShifts, ShiftRows, type ShiftActions, type ShiftPauseHint } from '@/components/event/ShiftList';
import { replacementOffers, shiftStats, shiftTasks } from '@/components/event/shift-utils';
import { AssignHelperDialog, DayResponsiblesDialog, OrganizerDialog, ShiftFormDialog } from '@/components/ShiftDialogs';
import { ShiftDetailsDialog } from '@/components/ShiftDetailsDialog';
import { ApiError, api, departmentSetupUrl, errorMessage, loginUrl, useLoginHref } from '@/lib/api';
import {
  businessDayKey,
  dayKeyToIso,
  fmtDateRange,
  fmtDayMonth,
  fmtShortWeekday,
  fmtTime,
  fmtWeekday,
  groupByBusinessDay,
  fmtTimeRange,
} from '@/lib/format';
import { usePortal } from '@/lib/portal';
import { useDynamicFavicon } from '@/lib/favicon';
import type { EventDetails } from '@/lib/types';

type View = 'list' | 'grid';
const VIEW_STORAGE_KEY = 'schichtplan.eventView';

export default function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { user, department, loading: portalLoading } = usePortal();
  const toast = useToast();
  const confirm = useConfirm();
  const loginHref = useLoginHref();
  const { registerContextData } = useCommandPalette();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Interner Anlass einer Abteilung «nur für Mitglieder», die Person gehört (noch) nicht dazu
  const [membersOnly, setMembersOnly] = useState(false);
  // Nicht ladbares Event-Logo -> Cevi-Standardlogo
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [day, setDay] = useState<string>('ALL');
  const [taskFilter, setTaskFilter] = useState<string>('ALL');
  const [onlySetup, setOnlySetup] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyReplacement, setOnlyReplacement] = useState(false);
  const [busyShift, setBusyShift] = useState<string | null>(null);
  // Einladungs-Link (?zugang=...), der noch eingelöst werden muss
  const [pendingToken, setPendingToken] = useState<string | null>(null);

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [assigningShift, setAssigningShift] = useState<ShiftDto | null>(null);
  const [assigningTask, setAssigningTask] = useState<ShiftTaskDto | null>(null);
  const [participationFor, setParticipationFor] = useState<{
    shift: ShiftDto;
    task?: ShiftTaskDto;
    showOnce: boolean;
    /** Nur für diese Schicht nötig, z. B. Geburtsdatum bei Mindestalter */
    extraFields?: RequiredProfileField[];
    /** Schicht übernehmen: diese Eintragung («Ersatz gesucht») wird ersetzt */
    replacesSignupId?: string;
  } | null>(null);
  const [replacementFor, setReplacementFor] = useState<{
    shift: ShiftDto;
    signupId: string;
    personName: string | null;
  } | null>(null);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showOkForm, setShowOkForm] = useState(false);
  const [dayResponsiblesTarget, setDayResponsiblesTarget] = useState<{ dayDate: string; dayLabel: string } | null>(null);

  // Deep-Link (?schicht=ID), Einladungs-Link (?zugang=TOKEN) und gespeicherte Ansicht
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const shiftParam = searchParams.get('schicht') || searchParams.get('shift');
    if (shiftParam) setSelectedShiftId(shiftParam);
    setPendingToken(searchParams.get('zugang'));
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'grid' || stored === 'list') setView(stored);
    } catch {
      // Speicher gesperrt: Standardansicht
    }
  }, []);

  const changeView = (next: View) => {
    setView(next);
    trackUi('UI_PLAN_VIEW', next === 'grid' ? 'EVENT_GRID' : 'EVENT_LIST');
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // egal
    }
  };

  // Favicon: Event-Logo (falls vorhanden), sonst Abteilungs-Logo
  useDynamicFavicon(event?.logoUrl || department?.logoUrl, department?.logoUrl);

  // Kontext für Befehlsmenü (Command Palette) registrieren
  useEffect(() => {
    if (!event) return;
    return registerContextData({
      event,
      slug,
      isOkArea: false,
      onOpenShiftForm: () => setShowShiftForm(true),
      onOpenAssignModal: () => {
        if (event.shifts && event.shifts.length > 0) {
          setAssigningShift(event.shifts[0]);
        }
      },
    });
  }, [event, slug, registerContextData]);

  const load = useCallback(async () => {
    try {
      // Ein noch nicht eingelöster Einladungs-Link erlaubt das Ansehen auch bei «nur für Mitglieder»
      const token = new URLSearchParams(window.location.search).get('zugang');
      setEvent(
        await api<EventDetails>(`/api/events/${slug}${token ? `?zugang=${encodeURIComponent(token)}` : ''}`)
      );
    } catch (err) {
      if (err instanceof ApiError && err.data.code === 'MEMBERS_ONLY') {
        setMembersOnly(true);
        return;
      }
      setError(err instanceof ApiError && err.status === 404 ? 'Diesen Anlass gibt es nicht (mehr).' : errorMessage(err));
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // Einladungs-Link einlösen, sobald jemand angemeldet ist
  useEffect(() => {
    if (!pendingToken || portalLoading || !user) return;
    const token = pendingToken;
    setPendingToken(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('zugang');
    window.history.replaceState(null, '', url);
    api<{ message: string }>(`/api/events/${slug}/access-links/redeem`, { method: 'POST', json: { token } })
      .then((res) => {
        toast({ title: res.message, description: 'Du kannst dich jetzt eintragen.' });
        return load();
      })
      .catch((err) => toast({ title: 'Link funktioniert nicht', description: errorMessage(err), tone: 'error' }));
  }, [pendingToken, portalLoading, user, slug, load, toast]);

  const days = useMemo(() => groupByBusinessDay(event?.shifts ?? [], event?.dayCutoffTime), [event]);
  const distinctTasks = useMemo(() => {
    const titles = new Set<string>();
    for (const s of event?.shifts ?? []) for (const t of shiftTasks(s)) if (t.title.trim()) titles.add(t.title.trim());
    return Array.from(titles);
  }, [event]);
  const selectedShift = useMemo(
    () => event?.shifts.find((s) => s.id === selectedShiftId) ?? null,
    [event, selectedShiftId]
  );

  if (membersOnly) {
    // Nach dem Anmelden lädt die Seite neu (Rückleitung), dann klappt es für Mitglieder
    if (portalLoading) return <EventSkeleton />;
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 pt-16 sm:px-6 sm:pt-24">
          <EmptyState
            icon={<Lock />}
            title="Nur für Mitglieder"
            description={
              user
                ? `Diesen Anlass sehen nur Mitglieder von ${department?.name ?? 'dieser Abteilung'}. Gehörst du dazu, gib deine Abteilung an. Sonst frag das OK nach einem Link.`
                : `Diesen Anlass sehen nur Mitglieder von ${department?.name ?? 'dieser Abteilung'}. Melde dich an, dann siehst du ihn, wenn du dazugehörst.`
            }
            action={
              user ? (
                <a href={departmentSetupUrl()} className={buttonClasses({})}>
                  <Building2 /> Abteilung angeben
                </a>
              ) : (
                <a href={loginHref} className={buttonClasses({})}>
                  <LogIn /> Anmelden
                </a>
              )
            }
          />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <NotFoundView
        badge="Anlass nicht gefunden"
        title="Diesen Anlass gibt es nicht"
        description={error}
        homeHref="/"
        homeLabel="Alle Anlässe anschauen"
        departmentName={department?.name}
        departmentLogoUrl={department?.logoUrl}
        secondaryActions={[
          {
            label: 'Meine Schichten',
            href: '/meine-schichten',
            icon: <CalendarDays className="size-3.5" />,
          },
        ]}
      />
    );
  }

  if (!event) return <EventSkeleton />;

  const { access } = event.viewer;
  // Was die Person hier darf, rechnet das Backend aus (OK-Rolle, Abteilungsrechte, Abteilungsleitung)
  const caps = new Set(access.capabilities ?? []);
  const canOpenOk = caps.has('VIEW');
  const canManageShifts = caps.has('SHIFTS');
  const canManageHelpers = caps.has('HELPERS');
  const canManageEvent = caps.has('SETTINGS');
  const canManageOk = caps.has('ORGANIZERS');
  const needsLogin = !user;
  // Eintragen-Knöpfe zeigen, wenn es geht oder nur noch der Login fehlt (und Freischaltzeit erreicht ist)
  const isSignupTimeOpenNow = isSignupTimeOpen(event.signupOpensAt);
  const showSignup = access.canSignup || (access.reason === 'LOGIN_REQUIRED' && isSignupTimeOpenNow);
  const isMine = (shift: ShiftDto) => Boolean(user && shift.signups?.some((s) => s.userId === user.id));
  const myShiftCount = event.shifts.filter(isMine).length;

  const total = event.shifts.reduce((sum, s) => sum + s.requiredSlots, 0);
  const filled = event.shifts.reduce((sum, s) => sum + shiftStats(s).filled, 0);
  const free = Math.max(0, total - filled);
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;

  const filtersActive = day !== 'ALL' || taskFilter !== 'ALL' || onlySetup || onlyOpen || onlyReplacement;
  const resetFilters = () => {
    setDay('ALL');
    setTaskFilter('ALL');
    setOnlySetup(false);
    setOnlyOpen(false);
    setOnlyReplacement(false);
  };

  const visibleDays = days
    .filter((d) => day === 'ALL' || d.key === day)
    .map((d) => ({
      ...d,
      items: d.items.filter((s) => {
        const matchesOpen = !onlyOpen || shiftStats(s).free > 0;
        const matchesSetup = !onlySetup || s.isSetupTeardown;
        const matchesTask = taskFilter === 'ALL' || shiftTasks(s).some((t) => t.title === taskFilter);
        const matchesReplacement = !onlyReplacement || replacementOffers(s).length > 0;
        return matchesOpen && matchesSetup && matchesTask && matchesReplacement;
      }),
    }))
    .filter((d) => d.items.length > 0);

  const findConflictingShift = (targetShift: ShiftDto) => {
    if (!user || !event?.shifts) return null;
    const tolerance = event.overlapToleranceMinutes ?? 15;
    const sStart = new Date(targetShift.startTime).getTime();
    const sEnd = new Date(targetShift.endTime).getTime();
    return (
      event.shifts.find((other) => {
        if (other.id === targetShift.id) return false;
        const isSignedUp = (other.signups ?? []).some((su) => su.userId === user.id);
        if (!isSignedUp) return false;
        const otherStart = new Date(other.startTime).getTime();
        const otherEnd = new Date(other.endTime).getTime();

        // Keine Überlappung
        if (sStart >= otherEnd || otherStart >= sEnd) return false;

        // Verschachtelung (liegt komplett in der anderen) = IMMER Kollision
        const isNested = (sStart <= otherStart && sEnd >= otherEnd) || (otherStart <= sStart && otherEnd >= sEnd);
        if (isNested) return true;

        // Überlappungszeit in Minuten
        const overlapMinutes = (Math.min(sEnd, otherEnd) - Math.max(sStart, otherStart)) / (60 * 1000);
        return overlapMinutes > tolerance;
      }) || null
    );
  };

  const findShiftHandover = (targetShift: ShiftDto) => {
    if (!user || !event?.shifts) return null;
    const tolerance = event.overlapToleranceMinutes ?? 15;
    if (tolerance <= 0) return null;
    const sStart = new Date(targetShift.startTime).getTime();
    const sEnd = new Date(targetShift.endTime).getTime();
    for (const other of event.shifts) {
      if (other.id === targetShift.id) continue;
      const isSignedUp = (other.signups ?? []).some((su) => su.userId === user.id);
      if (!isSignedUp) continue;
      const otherStart = new Date(other.startTime).getTime();
      const otherEnd = new Date(other.endTime).getTime();
      if (sStart >= otherEnd || otherStart >= sEnd) continue;
      const isNested = (sStart <= otherStart && sEnd >= otherEnd) || (otherStart <= sStart && otherEnd >= sEnd);
      if (isNested) continue;
      const overlapMinutes = Math.round((Math.min(sEnd, otherEnd) - Math.max(sStart, otherStart)) / (60 * 1000));
      if (overlapMinutes > 0 && overlapMinutes <= tolerance) {
        return { otherShift: other, overlapMinutes };
      }
    }
    return null;
  };

  const fmtBreakDuration = (mins: number) => {
    if (mins < 60) return `${mins} Min.`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
  };

  const findPauseHint = (targetShift: ShiftDto): ShiftPauseHint | null => {
    if (!user || !event?.shifts) return null;
    const dayKey = businessDayKey(targetShift.startTime, event.dayCutoffTime);
    const mySameDay = event.shifts
      .filter(
        (s) =>
          s.id !== targetShift.id &&
          isMine(s) &&
          businessDayKey(s.startTime, event.dayCutoffTime) === dayKey
      )
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
    if (mySameDay.length === 0) return null;

    const sStart = new Date(targetShift.startTime).getTime();
    const sEnd = new Date(targetShift.endTime).getTime();

    if (isMine(targetShift)) {
      const next = mySameDay.find((other) => new Date(other.startTime).getTime() >= sEnd);
      if (!next) return null;
      const diffMins = Math.round((new Date(next.startTime).getTime() - sEnd) / 60_000);
      if (diffMins === 0) {
        return {
          kind: 'direct',
          label: 'Direkter Anschluss',
          title: `Direkter Anschluss an deine nächste Schicht «${next.title}» (${fmtTime(next.startTime)})`,
        };
      }
      if (diffMins > 0) {
        const dur = fmtBreakDuration(diffMins);
        return {
          kind: 'break',
          label: `${dur} Pause danach`,
          title: `${dur} Pause bis zu deiner nächsten Schicht «${next.title}» (${fmtTime(next.startTime)})`,
        };
      }
      return null;
    }

    const adjacent = mySameDay.find((other) => {
      const oStart = new Date(other.startTime).getTime();
      const oEnd = new Date(other.endTime).getTime();
      return oEnd === sStart || sEnd === oStart;
    });
    if (adjacent) {
      return {
        kind: 'direct',
        label: 'Direkt im Anschluss',
        title: `Schliesst nahtlos an deine Schicht «${adjacent.title}» (${fmtTimeRange(adjacent.startTime, adjacent.endTime)}) an`,
      };
    }
    return null;
  };

  const doSignup = async (
    shift: ShiftDto,
    task?: ShiftTaskDto,
    answers?: Record<string, string>,
    replacesSignupId?: string
  ) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        title: 'Keine Internetverbindung',
        description: 'Im Offline-Modus ist nur die Leseansicht verfügbar. Zum Eintragen wird eine Internetverbindung benötigt.',
        tone: 'error',
      });
      return;
    }
    setBusyShift(shift.id);
    try {
      await api(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: { taskId: task && task.id !== 'default' ? task.id : undefined, answers, replacesSignupId },
      });
      const handover = findShiftHandover(shift);
      const handoverDesc = handover
        ? ` (${handover.overlapMinutes} Min. Übergabe mit «${handover.otherShift.title}»)`
        : '';
      toast({
        title: replacesSignupId ? 'Du hast die Schicht übernommen!' : 'Du bist eingetragen!',
        description: `${shift.title}${task && task.title !== shift.title ? ` · ${task.title}` : ''}${handoverDesc}, ${fmtWeekday(shift.startTime)} ab ${fmtTime(shift.startTime)}`,
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.data.code === 'MISSING_INFO') {
        await load();
        const extraFields = Array.isArray(err.data.missingFields)
          ? (err.data.missingFields as RequiredProfileField[])
          : [];
        setParticipationFor({ shift, task, showOnce: true, extraFields, replacesSignupId });
      } else if (err instanceof ApiError && err.data.code === 'TIME_COLLISION') {
        toast({ title: 'Zeitkollision', description: errorMessage(err), tone: 'error' });
      } else {
        toast({ title: 'Eintragen hat nicht geklappt', description: errorMessage(err), tone: 'error' });
      }
    } finally {
      setBusyShift(null);
    }
  };

  const signup = async (shift: ShiftDto, task?: ShiftTaskDto, replacesSignupId?: string) => {
    if (!user) {
      window.location.href = loginUrl();
      return;
    }
    // Übernehmen geht auch, wenn das Eintragen geschlossen ist (es kommt kein Platz dazu)
    if (replacesSignupId ? !event.viewer.canTakeOver : !access.canSignup) {
      toast({ title: 'Eintragen nicht möglich', description: access.message ?? undefined, tone: 'error' });
      return;
    }
    const conflict = findConflictingShift(shift);
    if (conflict) {
      toast({
        title: 'Zeitkollision',
        description: `Du bist zur gleichen Zeit bereits für die Schicht «${conflict.title}» (${fmtTimeRange(conflict.startTime, conflict.endTime)}) eingetragen.`,
        tone: 'error',
      });
      return;
    }
    // Fragen «einmal pro Anlass» beim ersten Eintragen (oder wenn eine Pflichtfrage fehlt),
    // Fragen «bei jeder Eintragung» immer
    const firstTime = myShiftCount === 0 && Object.keys(event.viewer.answers).length === 0;
    const hasOnceQuestions = event.questions.some((q) => q.scope !== 'PER_SIGNUP');
    const showOnce = event.viewer.missingQuestionIds.length > 0 || (firstTime && hasOnceQuestions);
    const needsDialog =
      event.viewer.missingFields.length > 0 || showOnce || event.questions.some((q) => q.scope === 'PER_SIGNUP');
    if (needsDialog) {
      setSelectedShiftId(null);
      setParticipationFor({ shift, task, showOnce, replacesSignupId });
      return;
    }
    await doSignup(shift, task, undefined, replacesSignupId);
  };

  const takeOver = async (shift: ShiftDto, offer: ShiftSignupDto, task?: ShiftTaskDto) => {
    const ok = await confirm({
      title: 'Schicht übernehmen?',
      description: `Du übernimmst «${shift.title}» (${fmtWeekday(shift.startTime)}, ${fmtTimeRange(shift.startTime, shift.endTime)}) von ${offer.displayName}. Danach bist du eingetragen und ${offer.displayName} nicht mehr.`,
      confirmLabel: 'Übernehmen',
    });
    if (!ok) return;
    await signup(shift, task, offer.id);
  };

  const offerReplacement = async (note: string) => {
    if (!replacementFor) return;
    setBusyShift(replacementFor.shift.id);
    try {
      await api(`/api/signups/${replacementFor.signupId}/replacement`, {
        method: 'PUT',
        json: { note: note || null },
      });
      toast({
        title: 'Ersatz wird gesucht',
        description: replacementFor.personName
          ? `${replacementFor.personName} bleibt eingetragen, bis jemand übernimmt.`
          : 'Du bleibst eingetragen, bis jemand übernimmt. Du bekommst dann eine Mail.',
      });
      setReplacementFor(null);
      await load();
    } catch (err) {
      toast({ title: 'Hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusyShift(null);
    }
  };

  const withdrawReplacement = async (shift: ShiftDto, signupId: string) => {
    setBusyShift(shift.id);
    try {
      await api(`/api/signups/${signupId}/replacement`, { method: 'DELETE' });
      toast({ title: 'Ersatz-Suche beendet', description: 'Die Eintragung bleibt bestehen.' });
      await load();
    } catch (err) {
      toast({ title: 'Hat nicht geklappt', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusyShift(null);
    }
  };

  // Schnell eintragen: eine offene Arbeit -> direkt, mehrere -> Auswahl im Detail-Dialog
  const quickSignup = (shift: ShiftDto) => {
    const open = shiftTasks(shift).filter((t) => t.filled < t.requiredSlots);
    if (open.length === 1) signup(shift, open[0]);
    else setSelectedShiftId(shift.id);
  };

  const cancel = async (shift: ShiftDto, signupId?: string, name?: string) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        title: 'Keine Internetverbindung',
        description: 'Im Offline-Modus ist nur die Leseansicht verfügbar. Zum Austragen wird eine Internetverbindung benötigt.',
        tone: 'error',
      });
      return;
    }
    // Falls Helfer*in sich selbst austragen möchte, Austrag-Sperre prüfen
    const isSelfCancel = !name;
    if (
      isSelfCancel &&
      !canManageHelpers &&
      !user?.isGlobalAdmin &&
      event.cancelDeadlineDays !== null &&
      event.cancelDeadlineDays !== undefined
    ) {
      const deadline = cancelDeadlineAt(event.startDate, event.cancelDeadlineDays);
      if (new Date() >= deadline) {
        const daysText = cancelDeadlineText(deadline, event.cancelDeadlineDays);
        const contactInfo = event.contactUser
          ? `Bitte melde dich bei ${event.contactUser.displayName}${event.contactUser.phone ? ` (${event.contactUser.phone})` : ''}${event.contactUser.email ? ` oder per Mail an ${event.contactUser.email}` : ''}.`
          : 'Bitte wende dich direkt an das Event-OK.';

        await confirm({
          title: 'Austragen nicht mehr selbst möglich',
          description: `Das selbständige Austragen ist ${daysText} gesperrt. ${contactInfo}`,
          confirmLabel: 'Verstanden',
          tone: 'default',
        });
        return;
      }
    }

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

  const actions: ShiftActions = {
    canSignup: showSignup,
    canTakeOver: needsLogin || event.viewer.canTakeOver,
    isMine,
    hasConflict: (shift) => Boolean(findConflictingShift(shift)),
    getHandover: (shift) => findShiftHandover(shift),
    getPauseHint: (shift) => findPauseHint(shift),
    busyShiftId: busyShift,
    contactName: event?.contactUser?.displayName,
    dayResponsibles: event?.dayResponsibles,
    responsibleMode: event?.responsibleMode,
    dayCutoffTime: event?.dayCutoffTime,
    onOpen: (shift) => setSelectedShiftId(shift.id),
    onQuickSignup: quickSignup,
  };

  return (
    <AppShell
      actions={
        canOpenOk && (
          <div className="flex items-center gap-2">
            <Link href={`/events/${slug}/ok`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              <Shield className="size-4" /> <span className="hidden sm:inline">OK-Bereich</span>
            </Link>
            {canManageShifts && (
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
            )}
          </div>
        )
      }
    >
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Bei «nur für Mitglieder» sehen Aussenstehende die Startseite nicht */}
        {!(department?.membersOnly && !department.viewerIsMember) && (
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-semibold text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Alle Anlässe
          </Link>
        )}

        {/* Kopf: kompakt, damit die Schichten schnell sichtbar sind */}
        <section className="relative isolate animate-fade-up overflow-hidden rounded-card bg-stone-900 text-white shadow-lift">
          {event.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.bannerUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          )}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/95 via-black/70 to-black/30" />

          <div className="flex flex-col gap-5 p-5 sm:p-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-tile border border-white/20 bg-black/40 backdrop-blur-md">
                  {event.logoUrl && event.logoUrl !== brokenLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.logoUrl}
                      alt=""
                      onError={() => setBrokenLogo(event.logoUrl ?? null)}
                      className="size-full object-cover"
                    />
                  ) : (
                    <CeviLogo className="size-8" alt="" />
                  )}
                </span>
                <AccessTypeBadge type={event.accessType} leadersOnly={event.leadersOnly} tone="glass" />
              </div>
              <h1 className="font-display text-[2rem] font-extrabold leading-[0.95] tracking-[-0.035em] text-balance sm:text-5xl">
                {event.title}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-white/85">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  {fmtDateRange(event.startDate, event.endDate, event.dayCutoffTime)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-white/70">
                  <Users className="size-4" />
                  Für {event.audience}
                </span>
              </p>
              {event.description && (
                <p className="mt-3 line-clamp-3 max-w-2xl text-[15px] leading-relaxed text-white/75 sm:line-clamp-none">
                  {event.description}
                </p>
              )}
            </div>

            {total > 0 && (
              <div className="w-full shrink-0 rounded-card border border-white/15 bg-black/40 p-4 backdrop-blur-xl sm:p-5 lg:w-72">
                <div className="flex items-baseline justify-between gap-3">
                  <p>
                    <span className="tabular font-display text-4xl font-extrabold leading-none tracking-tight">
                      {free}
                    </span>
                    <span className="ml-2 text-sm font-semibold text-white/80">
                      {free === 1 ? 'Platz frei' : 'Plätze frei'}
                    </span>
                  </p>
                  <span className="tabular text-sm font-semibold text-white/70">{percent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={cn('h-full rounded-full', free === 0 ? 'bg-success' : 'bg-accent')}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="tabular mt-2 text-xs text-white/60">
                  {filled} von {total} besetzt
                </p>
                {myShiftCount > 0 && (
                  <Link
                    href="/meine-schichten"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success/25 px-3 py-1 text-xs font-semibold text-white transition hover:bg-success/35"
                  >
                    <Check className="size-3.5" /> Du bist {myShiftCount}× eingetragen
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Hinweise: Freischaltung, Einladungs-Link und Zugang */}
        <div className="mt-4 space-y-3">
          {event.signupOpensAt && !isSignupTimeOpen(event.signupOpensAt) && (
            <SignupCountdown
              opensAt={event.signupOpensAt}
              onOpen={load}
              autoReload
              reloadShiftId={selectedShiftId}
            />
          )}
          {pendingToken && !user && !portalLoading && (
            <Callout tone="info" title="Du hast einen Einladungs-Link">
              <p>Melde dich an, damit der Link gilt. Ein Cevi-Name ohne Passwort reicht.</p>
              <a href={loginHref} className={buttonClasses({ size: 'sm', className: 'mt-3' })}>
                <LogIn /> Anmelden
              </a>
            </Callout>
          )}
          {!(pendingToken && !user) && <AccessNotice event={event} loggedIn={Boolean(user)} />}
        </div>

        {/* Organisationskomitee */}
        {(event.organizers?.length || canManageEvent || canManageOk) && (
          <section className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center" aria-label="Organisationskomitee">
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
                    {canManageOk && (
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
            {(canManageEvent || canManageOk) && (
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                {canManageOk && (
                  <Button variant="secondary" size="sm" onClick={() => setShowOkForm(true)}>
                    <UserPlus /> OK ernennen
                  </Button>
                )}
                {canManageEvent && (
                  <Link href={`/events/${event.slug}/ok/einstellungen`} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                    <Palette className="size-4" /> Einstellungen
                  </Link>
                )}
              </div>
            )}
          </section>
        )}

        {/* Noch gesucht (nur Listenansicht ohne Filter) */}
        {view === 'list' && !filtersActive && event.shifts.length > 0 && (
          <div className="mt-8">
            <NeededShifts
              shifts={event.shifts}
              actions={actions}
              onShowAll={() => {
                setOnlyOpen(true);
                document.getElementById('schichten')?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          </div>
        )}
      </div>

      {/* Werkzeugleiste: Ansicht und Filter, klebt unter dem Header */}
      {event.shifts.length > 0 && (
        <div id="schichten" className="sticky top-16 z-20 mt-8 scroll-mt-16 border-b border-line/70 bg-canvas/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3 scrollbar-none sm:px-6">
            <div role="radiogroup" aria-label="Ansicht" className="flex shrink-0 rounded-full border border-line bg-surface p-0.5">
              {(
                [
                  { value: 'list', label: 'Liste', icon: List },
                  { value: 'grid', label: 'Raster', icon: LayoutGrid },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const active = view === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => changeView(option.value)}
                    className={cn(
                      'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition',
                      active ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                );
              })}
            </div>
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />
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
                <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line" />
              </>
            )}
            <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
              Nur mit freien Plätzen
            </Chip>
            {event.shifts.some((s) => replacementOffers(s).length > 0) && (
              <Chip selected={onlyReplacement} onClick={() => setOnlyReplacement((v) => !v)}>
                Ersatz gesucht
              </Chip>
            )}
            {event.shifts.some((s) => s.isSetupTeardown) && (
              <Chip selected={onlySetup} onClick={() => setOnlySetup((v) => !v)}>
                Auf- &amp; Abbau
              </Chip>
            )}
            {distinctTasks.length > 1 &&
              distinctTasks.map((title) => (
                <Chip
                  key={title}
                  selected={taskFilter === title}
                  onClick={() => setTaskFilter(taskFilter === title ? 'ALL' : title)}
                >
                  {title}
                </Chip>
              ))}
          </div>
        </div>
      )}

      {/* Schichten nach Tag */}
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {event.shifts.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="Noch keine Schichten"
            description={
              canManageShifts
                ? 'Lege die erste Schicht an. Helfer*innen können sich danach sofort eintragen.'
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
              <Button variant="secondary" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            }
          />
        ) : (
          <div className="space-y-10">
            {visibleDays.map((group) => {
              const dayTotal = group.items.reduce((s, x) => s + x.requiredSlots, 0);
              const dayFilled = group.items.reduce((s, x) => s + shiftStats(x).filled, 0);
              const dayFree = dayTotal - dayFilled;
              const iso = dayKeyToIso(group.key);
              const allDayItems = days.find((d) => d.key === group.key)?.items ?? group.items;
              const myDayShifts = allDayItems
                .filter(isMine)
                .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
              return (
                <section key={group.key} aria-labelledby={`day-${group.key}`}>
                  <header className="mb-3 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 id={`day-${group.key}`} className="flex flex-wrap items-baseline gap-x-2.5">
                        <span className="font-display text-2xl font-extrabold tracking-[-0.03em] text-fg sm:text-3xl">
                          {fmtWeekday(iso)}
                        </span>
                        <span className="text-sm font-semibold text-fg-subtle">{fmtDayMonth(iso)}</span>
                      </h2>
                      {event.responsibleMode === 'BY_DAY' && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {event.dayResponsibles?.[group.key]?.length ? (
                            <Badge tone="neutral" size="sm" className="font-normal">
                              Tagesleitung: {event.dayResponsibles[group.key].map((r) => r.displayName).join(', ')}
                            </Badge>
                          ) : canManageShifts ? (
                            <span className="text-2xs text-fg-subtle italic">Keine Tagesleitung hinterlegt</span>
                          ) : null}
                          {canManageShifts && (
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
                          )}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        'tabular shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                        dayFree === 0 ? 'bg-success/12 text-success-ink' : 'bg-accent/10 text-accent-ink'
                      )}
                    >
                      {dayFree === 0 ? 'Alles besetzt' : `${dayFree} frei`} · {dayFilled}/{dayTotal}
                    </span>
                  </header>

                  {myDayShifts.length >= 2 && (
                    <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-tile border border-accent/25 bg-accent/5 px-3 py-2 text-xs">
                      <span className="mr-1 font-bold text-accent-ink">
                        Deine {myDayShifts.length} Einsätze an diesem Tag:
                      </span>
                      {myDayShifts.map((s, idx) => {
                        const prev = idx > 0 ? myDayShifts[idx - 1] : null;
                        const diffMins = prev
                          ? Math.round((new Date(s.startTime).getTime() - new Date(prev.endTime).getTime()) / 60_000)
                          : null;
                        return (
                          <span key={s.id} className="inline-flex flex-wrap items-center gap-1.5">
                            {diffMins !== null && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold',
                                  diffMins <= 0
                                    ? 'bg-accent/15 text-accent-ink'
                                    : 'border border-line bg-surface text-fg-muted'
                                )}
                              >
                                {diffMins === 0 ? (
                                  <>
                                    <Zap className="size-3 text-accent" /> Direkter Anschluss
                                  </>
                                ) : diffMins < 0 ? (
                                  <>
                                    <Zap className="size-3 text-accent" /> {Math.abs(diffMins)} Min. Übergabe
                                  </>
                                ) : (
                                  <>
                                    <Coffee className="size-3 text-fg-subtle" /> {fmtBreakDuration(diffMins)} Pause
                                  </>
                                )}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedShiftId(s.id)}
                              className="tabular inline-flex items-center gap-1 rounded-full border border-success/30 bg-surface px-2.5 py-0.5 font-semibold text-fg transition hover:border-accent"
                            >
                              <Check className="size-3 text-success-ink" />
                              <span>{fmtTimeRange(s.startTime, s.endTime)}</span>
                              <span className="max-w-[140px] truncate text-fg-muted">{s.title}</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {view === 'grid' ? (
                    <ShiftGrid shifts={group.items} isMine={isMine} onOpen={(s) => setSelectedShiftId(s.id)} />
                  ) : (
                    <ShiftRows shifts={group.items} actions={actions} />
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail-Dialog für Schicht & Arbeiten */}
      <ShiftDetailsDialog
        shift={selectedShift}
        event={event}
        isOpen={Boolean(selectedShift)}
        onClose={() => setSelectedShiftId(null)}
        currentUser={user}
        needsLogin={needsLogin}
        blockedReason={!access.canSignup ? access.message : null}
        canManage={canManageShifts || canManageHelpers}
        busy={Boolean(selectedShift && busyShift === selectedShift.id)}
        onSignup={(task) => {
          if (selectedShift) signup(selectedShift, task);
        }}
        onCancel={(signupId) => {
          if (selectedShift) cancel(selectedShift, signupId);
        }}
        onRemoveHelper={(signupId, name) => {
          if (selectedShift) cancel(selectedShift, signupId, name);
        }}
        onAssignHelper={(shift, task) => {
          setAssigningShift(shift);
          setAssigningTask(task ?? null);
        }}
        onEditShift={(shift) => {
          setSelectedShiftId(null);
          setEditingShift(shift);
          setShowShiftForm(true);
        }}
        onOfferReplacement={(signupId, personName) => {
          if (selectedShift) setReplacementFor({ shift: selectedShift, signupId, personName });
        }}
        onWithdrawReplacement={(signupId) => {
          if (selectedShift) withdrawReplacement(selectedShift, signupId);
        }}
        onTakeOver={(offer, task) => {
          if (selectedShift) takeOver(selectedShift, offer, task);
        }}
      />

      <ReplacementDialog
        open={Boolean(replacementFor)}
        personName={replacementFor?.personName}
        shiftLabel={
          replacementFor
            ? `${replacementFor.shift.title}, ${fmtShortWeekday(replacementFor.shift.startTime)} ${fmtTimeRange(replacementFor.shift.startTime, replacementFor.shift.endTime)}`
            : undefined
        }
        busy={Boolean(replacementFor && busyShift === replacementFor.shift.id)}
        onClose={() => setReplacementFor(null)}
        onSubmit={offerReplacement}
      />

      <ParticipationDialog
        open={Boolean(participationFor)}
        event={event}
        showOnceQuestions={participationFor?.showOnce ?? false}
        extraMissingFields={participationFor?.extraFields}
        shiftLabel={
          participationFor
            ? `${participationFor.shift.title}, ${fmtShortWeekday(participationFor.shift.startTime)} ${fmtTime(participationFor.shift.startTime)}`
            : undefined
        }
        onClose={() => setParticipationFor(null)}
        onSaved={async (answers) => {
          const pending = participationFor;
          setParticipationFor(null);
          if (pending) await doSignup(pending.shift, pending.task, answers, pending.replacesSignupId);
          else await load();
        }}
      />

      {/* Helfer manuell durch OK einteilen */}
      <AssignHelperDialog
        eventSlug={slug}
        open={Boolean(assigningShift)}
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
    </AppShell>
  );
}

function EventSkeleton() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6">
        <Skeleton className="mb-3 h-6 w-32" />
        <Skeleton className="h-64 rounded-card sm:h-72" />
        <Skeleton className="mt-8 h-8 w-48" />
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
