'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  Keyboard,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Share2,
  Sparkles,
  Sun,
  Ticket,
  Trash2,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import {
  type DepartmentPersonDto,
  type EventDto,
  type ShiftDto,
  type ShiftSignupDto,
} from '@schichtplan/shared';
import { useToast, type BadgeTone } from '@schichtplan/ui';
import { api, errorMessage, useLoginHref } from '@/lib/api';
import { eventStatus } from '@/components/EventTile';
import { fmtShortDate, fmtShortWeekday, fmtTimeRange, shiftName } from '@/lib/format';
import { downloadIcs, googleCalendarUrl, type CalendarEntry } from '@/lib/ics';
import { displayName, usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { useCommandPalette } from './CommandContext';
import { getRecentCommandIds, recordRecentCommand } from './recentCommands';
import type {
  CommandItem,
  CommandQuickAction,
  CommandSection,
  CommandSubAction,
} from './types';

const THEME_STORAGE_KEY = 'schichtplan.theme';

interface DepartmentPerson {
  id: string;
  userId: string;
  firstName: string;
  lastName?: string | null;
  ceviName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  departmentRole?: string | null;
  stufen?: { name: string }[];
}

export type PrefixMode = 'ALL' | 'PEOPLE' | 'EVENTS' | 'SHIFTS' | 'HELP';

export function useCommandItems(query: string) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const loginHref = useLoginHref();
  const { user, department, can, isDeptAdmin, logout } = usePortal();
  const { contextData, close, setActiveSubActionItem } = useCommandPalette();

  const [allEvents, setAllEvents] = useState<EventDto[]>([]);
  const [people, setPeople] = useState<DepartmentPerson[]>([]);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, 'PRESENT' | null>>({});
  const [loadedEventDetails, setLoadedEventDetails] = useState<EventDetails | null>(null);

  // Anlässe laden (und cachen)
  useEffect(() => {
    if (!department) return;
    api<EventDto[]>('/api/events')
      .then((data) => setAllEvents(data || []))
      .catch(() => setAllEvents([]));
  }, [department]);

  // Personen laden, falls Berechtigung vorhanden
  const canViewPeople = can('PEOPLE_VIEW') || isDeptAdmin;
  useEffect(() => {
    if (!canViewPeople || !department) return;
    api<Array<DepartmentPersonDto & { id?: string }>>('/api/departments/current/people?alle=1')
      .then((data) => {
        const mapped: DepartmentPerson[] = (data || []).map((p) => ({
          ...p,
          id: p.userId || p.id || '',
          userId: p.userId || p.id || '',
          role: p.departmentRole || undefined,
        }));
        setPeople(mapped);
      })
      .catch(() => setPeople([]));
  }, [canViewPeople, department]);

  // Aktueller Anlass: entweder aus contextData oder aus dem Pfad (/events/[slug])
  const activeSlug = useMemo(() => {
    if (contextData.slug) return contextData.slug;
    const match = pathname.match(/^\/events\/([^/]+)/);
    return match ? match[1] : null;
  }, [contextData.slug, pathname]);

  const activeEvent = useMemo(() => {
    if (contextData.event) return contextData.event;
    if (!activeSlug || !allEvents.length) return null;
    return allEvents.find((e) => e.slug === activeSlug) || null;
  }, [contextData.event, activeSlug, allEvents]);

  // EventDetails mit Schichten laden, falls contextData.event noch keine Schichten hat
  useEffect(() => {
    if (!activeSlug) {
      setLoadedEventDetails(null);
      return;
    }
    const ctxEv = contextData.event as EventDetails | undefined;
    if (ctxEv && Array.isArray(ctxEv.shifts)) {
      setLoadedEventDetails(ctxEv);
      return;
    }
    api<EventDetails>(`/api/events/${activeSlug}`)
      .then((data) => {
        if (data && Array.isArray(data.shifts)) {
          setLoadedEventDetails(data);
        }
      })
      .catch(() => {});
  }, [activeSlug, contextData.event]);

  const detailedEvent = useMemo(() => {
    const ctxEv = contextData.event as EventDetails | undefined;
    if (ctxEv && Array.isArray(ctxEv.shifts)) return ctxEv;
    return loadedEventDetails;
  }, [contextData.event, loadedEventDetails]);

  const isOkArea = pathname.includes('/ok') || Boolean(contextData.isOkArea);

  // Erkennung von Präfixen (@, #, :, !, ?, >)
  const { prefixMode, cleanQuery } = useMemo(() => {
    const raw = query.trim();
    if (raw.startsWith('@')) return { prefixMode: 'PEOPLE' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    if (raw.startsWith('#') || raw.startsWith('>')) return { prefixMode: 'EVENTS' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    if (raw.startsWith(':') || raw.startsWith('!')) return { prefixMode: 'SHIFTS' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    if (raw.startsWith('?')) return { prefixMode: 'HELP' as PrefixMode, cleanQuery: raw.slice(1).trim() };
    return { prefixMode: 'ALL' as PrefixMode, cleanQuery: raw };
  }, [query]);

  // =========================================================================
  // DIREKTE HILFSFUNKTIONEN (KLIPPEN, TEILEN, KALENDER, CHAT)
  // =========================================================================

  const copyToClipboard = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${title} kopiert`, tone: 'success' });
    } catch {
      toast({ title: 'Kopieren fehlgeschlagen', tone: 'error' });
    }
  };

  const openWhatsAppDirect = (phone: string, firstName?: string) => {
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('0')) {
      cleanPhone = '41' + cleanPhone.slice(1);
    }
    const greeting = firstName ? `Hallo ${firstName}! ` : 'Hallo! ';
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(greeting)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openSmsDirect = (phone: string) => {
    const cleanPhone = phone.replace(/\s+/g, '');
    window.location.href = `sms:${cleanPhone}`;
  };

  const handleDownloadIcs = (event: EventDto | EventDetails) => {
    const entries: CalendarEntry[] = [
      {
        uid: `event-${event.id}`,
        title: event.title,
        description: event.description || undefined,
        start: event.startDate,
        end: event.endDate || event.startDate,
      },
    ];
    downloadIcs(`${event.slug}.ics`, entries);
    toast({
      title: 'Kalenderdatei heruntergeladen',
      description: `«${event.slug}.ics» wurde gespeichert.`,
      tone: 'success',
    });
  };

  const handleGoogleCalendar = (event: EventDto | EventDetails) => {
    const entry: CalendarEntry = {
      uid: `event-${event.id}`,
      title: event.title,
      description: event.description || undefined,
      start: event.startDate,
      end: event.endDate || event.startDate,
    };
    const url = googleCalendarUrl(entry);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyShiftWhatsAppCall = (eventTitle: string, shift: ShiftDto, eventUrl: string) => {
    const shiftTime = `${fmtShortWeekday(shift.startTime)} ${fmtTimeRange(shift.startTime, shift.endTime)}`;
    const freeSlots = Math.max(0, shift.requiredSlots - (shift.signups?.length || 0));
    const link = `${eventUrl}#shift-${shift.id}`;
    const text = [
      `*Helfer gesucht für «${eventTitle}»!* 🙋`,
      `Schicht: *${shift.title || shiftName(shift)}*`,
      `⏰ Zeit: ${shiftTime}`,
      shift.category ? `📍 Bereich: ${shift.category}` : null,
      `👥 Noch ${freeSlots} freie ${freeSlots === 1 ? 'Platz' : 'Plätze'}!`,
      '',
      `👉 Hier direkt ansehen & eintragen:`,
      link,
    ]
      .filter(Boolean)
      .join('\n');
    copyToClipboard(text, 'WhatsApp-Aufruf');
  };

  const copyEventWhatsAppCall = (
    event: EventDto | EventDetails,
    shiftsWithGaps: ShiftDto[],
    eventUrl: string
  ) => {
    const dateText = fmtShortDate(event.startDate);
    const totalMissing = shiftsWithGaps.reduce(
      (acc, s) => acc + Math.max(0, s.requiredSlots - (s.signups?.length || 0)),
      0
    );
    const text = [
      `*Helferaufruf für «${event.title}»!* ⛺`,
      `📅 Datum: ${dateText}`,
      '',
      `Wir suchen noch ${totalMissing} helfende ${totalMissing === 1 ? 'Hand' : 'Hände'} für folgende Schichten:`,
      ...shiftsWithGaps.slice(0, 8).map((s) => {
        const free = Math.max(0, s.requiredSlots - (s.signups?.length || 0));
        return `• *${s.title || shiftName(s)}* (${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}): noch ${free} ${free === 1 ? 'Platz' : 'Plätze'}`;
      }),
      shiftsWithGaps.length > 8 ? `... und weitere ${shiftsWithGaps.length - 8} Schichten.` : null,
      '',
      `👉 Jetzt Schichtplan öffnen & direkt eintragen:`,
      eventUrl,
    ]
      .filter(Boolean)
      .join('\n');
    copyToClipboard(text, `WhatsApp-Helferaufruf (${totalMissing} offene Plätze)`);
  };

  const copyEventTextPlan = (event: EventDto | EventDetails, shifts: ShiftDto[]) => {
    const dateText = fmtShortDate(event.startDate);
    const lines = [
      `📋 Schichtplan: ${event.title} (${dateText})`,
      `Total Schichten: ${shifts.length}`,
      '--------------------------------------------------',
      ...shifts.map((s) => {
        const time = `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`;
        const names = (s.signups || []).map((su) => su.displayName).join(', ') || 'Keine Helfenden eingeteilt';
        const count = `${s.signups?.length || 0}/${s.requiredSlots}`;
        return `• [${time}] ${s.title || shiftName(s)}${s.category ? ` (${s.category})` : ''}: ${names} [${count}]`;
      }),
    ];
    copyToClipboard(lines.join('\n'), 'Schichtplan als Text');
  };

  const copyHelpersEmailList = (shifts: ShiftDto[]) => {
    const emails = new Set<string>();
    for (const s of shifts) {
      for (const su of s.signups || []) {
        if (su.guestEmail) emails.add(su.guestEmail.trim());
      }
    }
    for (const p of people) {
      if (p.email && shifts.some((s) => s.signups?.some((su) => su.userId === p.id))) {
        emails.add(p.email.trim());
      }
    }
    const list = Array.from(emails).filter(Boolean);
    if (list.length === 0) {
      toast({ title: 'Keine E-Mail-Adressen hinterlegt', tone: 'info' });
      return;
    }
    copyToClipboard(list.join(', '), `${list.length} Helfer-E-Mail-Adressen`);
  };

  const copyHelpersPhoneList = (shifts: ShiftDto[], eventTitle: string) => {
    const helperMap = new Map<string, { name: string; phone?: string | null; shifts: string[] }>();
    for (const s of shifts) {
      const time = `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`;
      const sName = `${s.title || shiftName(s)} (${time})`;
      for (const su of s.signups || []) {
        const key = su.userId || su.displayName;
        const existing = helperMap.get(key) || { name: su.displayName, phone: su.guestPhone, shifts: [] };
        existing.shifts.push(sName);
        if (!existing.phone && su.userId) {
          const found = people.find((p) => p.id === su.userId);
          if (found?.phone) existing.phone = found.phone;
        }
        helperMap.set(key, existing);
      }
    }
    const lines = [
      `📞 Helfer-Telefonliste: ${eventTitle}`,
      '--------------------------------------------------',
      ...Array.from(helperMap.values()).map((h) => {
        const phoneStr = h.phone ? h.phone : 'Keine Telefonnummer';
        return `• ${h.name}: ${phoneStr} [${h.shifts.join('; ')}]`;
      }),
    ];
    copyToClipboard(lines.join('\n'), 'Telefonliste');
  };

  // =========================================================================
  // DIREKTE AKTIONEN (EINTRAGEN, STORNIEREN, ERSATZ, CHECK-IN)
  // =========================================================================

  const handleDirectSignup = async (shift: ShiftDto) => {
    if (!user) {
      window.location.href = loginHref;
      return;
    }
    try {
      const res = await api<{ id?: string; signupId?: string }>(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: {},
      });
      const newSignupId = res?.id || res?.signupId || `temp-${Date.now()}`;
      toast({
        title: 'Erfolgreich eingetragen!',
        description: `Du bist jetzt für «${shift.title || shiftName(shift)}» eingeteilt.`,
        tone: 'success',
      });

      // Optimistisches Update in den geladenen EventDetails
      setLoadedEventDetails((prev) => {
        if (!prev) return prev;
        const updatedShifts = prev.shifts.map((s) => {
          if (s.id !== shift.id) return s;
          const newSignup: ShiftSignupDto = {
            id: newSignupId,
            shiftId: shift.id,
            userId: user.id,
            displayName: displayName(user),
            guestName: null,
            guestEmail: null,
            guestPhone: null,
            taskTitle: null,
            createdAt: new Date().toISOString(),
            isConfirmed: true,
            attendance: null,
          };
          return {
            ...s,
            signups: [...(s.signups || []), newSignup],
          };
        });
        return { ...prev, shifts: updatedShifts };
      });
      if (contextData.onReloadEvent) {
        contextData.onReloadEvent();
      }
    } catch (err) {
      toast({
        title: 'Eintragen fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const handleDirectCancelSignup = async (shiftId: string, signupId: string, shiftTitle: string) => {
    try {
      await api(`/api/shifts/${shiftId}/signup?signupId=${signupId}`, {
        method: 'DELETE',
      });
      toast({
        title: 'Einsatz storniert',
        description: `Eintragung für «${shiftTitle}» wurde erfolgreich entfernt.`,
        tone: 'info',
      });
      setLoadedEventDetails((prev) => {
        if (!prev) return prev;
        const updatedShifts = prev.shifts.map((s) => {
          if (s.id !== shiftId) return s;
          return {
            ...s,
            signups: (s.signups || []).filter((su) => su.id !== signupId),
          };
        });
        return { ...prev, shifts: updatedShifts };
      });
      if (contextData.onReloadEvent) {
        contextData.onReloadEvent();
      }
    } catch (err) {
      toast({
        title: 'Stornieren fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const handleDirectReplacement = async (signupId: string, isAlreadyOffered: boolean) => {
    try {
      if (isAlreadyOffered) {
        await api(`/api/signups/${signupId}/replacement`, { method: 'DELETE' });
        toast({
          title: '«Ersatz gesucht» zurückgezogen',
          description: 'Du übernimmst die Schicht wieder regulär.',
          tone: 'info',
        });
      } else {
        await api(`/api/signups/${signupId}/replacement`, {
          method: 'PUT',
          json: { note: 'Ersatz gesucht (aus Befehlsmenü gemeldet)' },
        });
        toast({
          title: '«Ersatz gesucht» gemeldet',
          description: 'Deine Schicht wurde zur Übernahme durch andere Helfer ausgeschrieben.',
          tone: 'info',
        });
      }
      if (activeSlug) {
        api<EventDetails>(`/api/events/${activeSlug}`)
          .then((data) => {
            if (data && Array.isArray(data.shifts)) setLoadedEventDetails(data);
          })
          .catch(() => {});
      }
      if (contextData.onReloadEvent) {
        contextData.onReloadEvent();
      }
    } catch (err) {
      toast({
        title: 'Aktion fehlgeschlagen',
        description: errorMessage(err),
        tone: 'error',
      });
    }
  };

  const toggleAttendance = async (signupId: string, helperName: string, currentStatus: string | null) => {
    if (!activeSlug) return;
    const newStatus = currentStatus === 'PRESENT' ? null : 'PRESENT';
    try {
      await api(`/api/events/${activeSlug}/signups/${signupId}/attendance`, {
        method: 'PUT',
        json: { status: newStatus },
      });
      setAttendanceOverrides((prev) => ({ ...prev, [signupId]: newStatus }));
      toast({
        title: newStatus === 'PRESENT' ? `${helperName} eingecheckt` : `Anwesenheit zurückgesetzt`,
        description:
          newStatus === 'PRESENT' ? 'Erfolgreich als anwesend markiert' : 'Status wurde zurückgesetzt',
        tone: newStatus === 'PRESENT' ? 'success' : 'info',
      });
    } catch {
      toast({
        title: 'Check-in fehlgeschlagen',
        description: 'Die Anwesenheit konnte nicht aktualisiert werden.',
        tone: 'error',
      });
    }
  };

  const toggleShiftAllAttendance = async (shift: ShiftDto) => {
    if (!activeSlug || !shift.signups?.length) return;
    const allPresent = shift.signups.every(
      (su) => (attendanceOverrides[su.id] ?? su.attendance) === 'PRESENT'
    );
    const targetStatus = allPresent ? null : 'PRESENT';
    try {
      for (const su of shift.signups) {
        await api(`/api/events/${activeSlug}/signups/${su.id}/attendance`, {
          method: 'PUT',
          json: { status: targetStatus },
        });
      }
      const updates: Record<string, 'PRESENT' | null> = {};
      for (const su of shift.signups) {
        updates[su.id] = targetStatus;
      }
      setAttendanceOverrides((prev) => ({ ...prev, ...updates }));
      toast({
        title: targetStatus === 'PRESENT' ? 'Alle Helfenden eingecheckt' : 'Anwesenheit zurückgesetzt',
        description: `${shift.signups.length} ${shift.signups.length === 1 ? 'Person' : 'Personen'} aktualisiert`,
        tone: targetStatus === 'PRESENT' ? 'success' : 'info',
      });
    } catch {
      toast({ title: 'Aktualisierung fehlgeschlagen', tone: 'error' });
    }
  };

  // Theme wechseln
  const setTheme = (choice: 'system' | 'light' | 'dark') => {
    const root = document.documentElement;
    if (choice === 'system') delete root.dataset.theme;
    else root.dataset.theme = choice;
    try {
      if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {}
    toast({
      title:
        choice === 'dark'
          ? 'Dunkelmodus aktiviert'
          : choice === 'light'
            ? 'Hellmodus aktiviert'
            : 'System-Farbschema aktiv',
      tone: 'info',
    });
    close();
  };

  // =========================================================================
  // LISTE ALLER VERFÜGBAREN BEFEHLE GENERIEREN
  // =========================================================================

  const items = useMemo(() => {
    const list: CommandItem[] = [];

    // =========================================================================
    // 0. HILFE-BEFEHLE (bei '?' oder prefixMode === 'HELP')
    // =========================================================================
    if (prefixMode === 'HELP') {
      list.push({
        id: 'help-shortcuts',
        title: 'Tastatur-Navigation & Schnellbedienung',
        subtitle: '↑ / ↓ zum Navigieren · ↵ zum Ausführen · ⇥ Tab für Unteraktionen · Esc zum Schliessen',
        section: 'HELP',
        icon: <Keyboard className="size-4 text-accent-ink" />,
        keywords: ['hilfe', 'tastatur', 'shortcuts', 'navigation'],
        onSelect: () => {},
        preview: {
          type: 'ACTION',
          details: [
            { label: 'Öffnen', value: '⌘K oder Strg+K' },
            { label: 'Hauptaktion', value: '↵ Enter' },
            { label: 'Unteraktionen', value: '⇥ Tab' },
            { label: 'Zurück / Schliessen', value: 'Esc' },
            { label: 'Sofortaktionen', value: '⚡ Direkt ohne Seitenwechsel' },
          ],
        },
      });

      list.push({
        id: 'help-prefix-people',
        title: 'Präfix @ für Personen',
        subtitle: 'Tippe «@name», um blitzschnell nach Helfenden und Kontakten zu suchen',
        section: 'HELP',
        icon: <UserRound className="size-4 text-accent-ink" />,
        keywords: ['präfix', 'filter', 'person', 'helfer', '@'],
        onSelect: () => {},
      });

      list.push({
        id: 'help-prefix-events',
        title: 'Präfix # oder > für Anlässe',
        subtitle: 'Tippe «#herbst» oder «>lager», um ausschliesslich Anlässe zu durchsuchen',
        section: 'HELP',
        icon: <CalendarDays className="size-4 text-accent-ink" />,
        keywords: ['präfix', 'filter', 'anlass', 'event', '#', '>'],
        onSelect: () => {},
      });

      list.push({
        id: 'help-prefix-shifts',
        title: 'Präfix : oder ! für Schichten',
        subtitle: 'Tippe «:kueche» oder «!frei», um direkt freie Schichten zu finden',
        section: 'HELP',
        icon: <Ticket className="size-4 text-accent-ink" />,
        keywords: ['präfix', 'filter', 'schicht', 'aufgabe', ':', '!'],
        onSelect: () => {},
      });

      return list;
    }

    // =========================================================================
    // 1. POSITION / KONTEXTBEZOGEN: Aktueller Anlass
    // =========================================================================
    if (activeSlug && activeEvent) {
      const eventTitle = activeEvent.title;
      const eventUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/events/${activeSlug}`
          : `/events/${activeSlug}`;
      const canManageEvent = can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin;

      // Hauptaktionen für den aktuellen Anlass
      if (isOkArea) {
        list.push({
          id: `context-to-helper-view`,
          title: `Zur Helfer-Ansicht wechseln`,
          subtitle: `${eventTitle} aus Sicht der Helfenden öffnen`,
          section: 'CONTEXT',
          icon: <Ticket className="size-4 text-accent-ink" />,
          keywords: ['helfer', 'ansicht', 'eintragen', 'öffentlich', activeSlug, eventTitle],
          onSelect: () => {
            recordRecentCommand(`context-to-helper-view`);
            router.push(`/events/${activeSlug}`);
            close();
          },
          subActions: [
            {
              id: 'copy-link',
              title: 'Anlass-Link kopieren',
              icon: <Copy className="size-3.5" />,
              closeOnSelect: false,
              onSelect: () => copyToClipboard(eventUrl, 'Anlass-Link'),
            },
          ],
          preview: {
            type: 'EVENT',
            event: activeEvent,
            details: [
              { label: 'Bereich', value: 'Helfer-Ansicht' },
              { label: 'URL', value: eventUrl },
            ],
          },
        });
      } else {
        if (canManageEvent) {
          list.push({
            id: `context-to-ok-view`,
            title: `Zum OK-Bereich wechseln`,
            subtitle: `Planung, Schichten und Helfende für ${eventTitle} verwalten`,
            section: 'CONTEXT',
            icon: <LayoutDashboard className="size-4 text-accent-ink" />,
            keywords: ['ok', 'leitung', 'admin', 'planung', activeSlug, eventTitle],
            onSelect: () => {
              recordRecentCommand(`context-to-ok-view`);
              router.push(`/events/${activeSlug}/ok`);
              close();
            },
            subActions: [
              {
                id: 'ok-schichten',
                title: 'Direkt zu Schichten',
                icon: <CalendarDays className="size-3.5" />,
                onSelect: () => {
                  router.push(`/events/${activeSlug}/ok/schichten`);
                  close();
                },
              },
              {
                id: 'ok-helfende',
                title: 'Direkt zu Helfenden',
                icon: <Users className="size-3.5" />,
                onSelect: () => {
                  router.push(`/events/${activeSlug}/ok/helfende`);
                  close();
                },
              },
            ],
            preview: {
              type: 'EVENT',
              event: activeEvent,
              details: [
                { label: 'Bereich', value: 'OK-Zentrale' },
                { label: 'Rolle', value: isDeptAdmin ? 'Abteilungsleitung' : 'OK-Planung' },
              ],
            },
          });
        }
      }

      // Lücken-Finder: Unbesetzte Schichten im aktuellen Anlass
      const shiftsWithGaps =
        detailedEvent?.shifts?.filter(
          (s) => Math.max(0, s.requiredSlots - (s.signups?.length || 0)) > 0
        ) || [];

      if (shiftsWithGaps.length > 0) {
        const totalMissing = shiftsWithGaps.reduce(
          (acc, s) => acc + Math.max(0, s.requiredSlots - (s.signups?.length || 0)),
          0
        );

        list.push({
          id: `context-open-shifts`,
          title: `Lücken-Finder: ${totalMissing} offene Plätze`,
          subtitle: `${shiftsWithGaps.length} Schichten benötigen noch Unterstützung`,
          section: 'CONTEXT',
          badge: `${totalMissing} offen`,
          badgeTone: 'warning',
          icon: <Search className="size-4 text-warning-ink" />,
          keywords: ['lücken', 'frei', 'offen', 'unbesetzt', 'bedarf', 'helfer gesucht', activeSlug],
          onSelect: () => {
            recordRecentCommand(`context-open-shifts`);
            if (pathname.startsWith(`/events/${activeSlug}`)) {
              const el = document.getElementById(`shift-${shiftsWithGaps[0]?.id}`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              router.push(`/events/${activeSlug}`);
            }
            close();
          },
          subActions: [
            {
              id: 'copy-whatsapp-gaps',
              title: 'WhatsApp-Helferaufruf kopieren',
              subtitle: 'Fertige Nachricht mit allen offenen Schichten für den Chat',
              icon: <Share2 className="size-3.5 text-accent-ink" />,
              closeOnSelect: false,
              onSelect: () => copyEventWhatsAppCall(activeEvent, shiftsWithGaps, eventUrl),
            },
            {
              id: 'copy-link',
              title: 'Anlass-Link zum Eintragen kopieren',
              icon: <Copy className="size-3.5" />,
              closeOnSelect: false,
              onSelect: () => copyToClipboard(eventUrl, 'Link zum Eintragen'),
            },
          ],
          preview: {
            type: 'ACTION',
            details: [
              { label: 'Offene Plätze', value: `${totalMissing} Helfer gesucht` },
              {
                label: 'Betroffene Schichten',
                value: `${shiftsWithGaps.length} von ${detailedEvent?.shifts?.length || 0}`,
              },
            ],
            quickActions: [
              {
                id: 'wa-gaps',
                label: 'WhatsApp-Aufruf',
                icon: <Share2 className="size-3.5" />,
                tone: 'accent',
                onClick: () => copyEventWhatsAppCall(activeEvent, shiftsWithGaps, eventUrl),
              },
              {
                id: 'copy-url',
                label: 'Link kopieren',
                icon: <Copy className="size-3.5" />,
                onClick: () => copyToClipboard(eventUrl, 'Link zum Eintragen'),
              },
            ],
          },
        });
      }

      // Direkte Schnellaktionen für den aktuellen Anlass: WhatsApp-Aufruf, Plan kopieren, Kalender
      list.push({
        id: `context-share-whatsapp`,
        title: `WhatsApp-Helferaufruf kopieren`,
        subtitle: `Fertiger Text für Gruppenchats mit Datum, Lücken und Link`,
        section: 'CONTEXT',
        icon: <Share2 className="size-4 text-accent-ink" />,
        keywords: ['whatsapp', 'aufruf', 'teilen', 'chat', 'helfer gesucht', activeSlug],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-share-whatsapp`);
          copyEventWhatsAppCall(activeEvent, shiftsWithGaps, eventUrl);
        },
      });

      if (detailedEvent?.shifts?.length) {
        list.push({
          id: `context-copy-textplan`,
          title: `Schichtplan als Text kopieren`,
          subtitle: `Vollständige Übersicht aller Schichten und Helfer für E-Mail oder Chat`,
          section: 'CONTEXT',
          icon: <Copy className="size-4 text-accent-ink" />,
          keywords: ['plan', 'text', 'kopieren', 'übersicht', 'export', activeSlug],
          closeOnSelect: false,
          onSelect: () => {
            recordRecentCommand(`context-copy-textplan`);
            copyEventTextPlan(activeEvent, detailedEvent.shifts);
          },
        });

        list.push({
          id: `context-copy-helpers-email`,
          title: `E-Mail-Verteiler aller Helfenden kopieren`,
          subtitle: `Adressen aller eingeteilten Helfer für Rundmails`,
          section: 'CONTEXT',
          icon: <Mail className="size-4 text-accent-ink" />,
          keywords: ['mail', 'email', 'verteiler', 'helfer', 'rundmail', activeSlug],
          closeOnSelect: false,
          onSelect: () => {
            recordRecentCommand(`context-copy-helpers-email`);
            copyHelpersEmailList(detailedEvent.shifts);
          },
        });

        list.push({
          id: `context-copy-helpers-phone`,
          title: `Helfer-Telefonliste kopieren`,
          subtitle: `Name, Telefonnummer und Schichten für Notfälle und Koordination`,
          section: 'CONTEXT',
          icon: <Phone className="size-4 text-accent-ink" />,
          keywords: ['telefon', 'liste', 'notfall', 'kontakte', 'anrufen', activeSlug],
          closeOnSelect: false,
          onSelect: () => {
            recordRecentCommand(`context-copy-helpers-phone`);
            copyHelpersPhoneList(detailedEvent.shifts, eventTitle);
          },
        });
      }

      list.push({
        id: `context-download-ics`,
        title: `Kalendereintrag (.ics) herunterladen`,
        subtitle: `Direkt in Apple Kalender, Outlook oder Handy-Kalender importieren`,
        section: 'CONTEXT',
        icon: <Download className="size-4 text-accent-ink" />,
        keywords: ['kalender', 'ics', 'ical', 'outlook', 'apple', 'download', activeSlug],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-download-ics`);
          handleDownloadIcs(activeEvent);
        },
      });

      list.push({
        id: `context-add-gcal`,
        title: `Zu Google Kalender hinzufügen`,
        subtitle: `Öffnet Google Kalender mit vorausgefülltem Eintrag`,
        section: 'CONTEXT',
        icon: <ExternalLink className="size-4 text-accent-ink" />,
        keywords: ['google', 'kalender', 'termin', 'gcal', activeSlug],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-add-gcal`);
          handleGoogleCalendar(activeEvent);
        },
      });

      // Neue Schicht erfassen (im aktuellen Anlass)
      if (canManageEvent) {
        list.push({
          id: `context-add-shift`,
          title: `Neue Schicht anlegen`,
          subtitle: `In «${eventTitle}» eine weitere Schicht erfassen`,
          section: 'CONTEXT',
          icon: <CalendarPlus className="size-4 text-accent-ink" />,
          keywords: ['schicht', 'neu', 'erstellen', 'anlegen', activeSlug, eventTitle],
          onSelect: () => {
            recordRecentCommand(`context-add-shift`);
            if (contextData.onOpenShiftForm) {
              contextData.onOpenShiftForm();
            } else {
              router.push(`/events/${activeSlug}/ok/schichten`);
            }
            close();
          },
        });

        // Helfer zuweisen
        list.push({
          id: `context-assign-helper`,
          title: `Helfer manuell zuteilen`,
          subtitle: `Person für eine Schicht in «${eventTitle}» einteilen`,
          section: 'CONTEXT',
          icon: <UserPlus className="size-4 text-accent-ink" />,
          keywords: ['helfer', 'zuweisen', 'zuteilen', 'eintragen', activeSlug, eventTitle],
          onSelect: () => {
            recordRecentCommand(`context-assign-helper`);
            if (contextData.onOpenAssignModal) {
              contextData.onOpenAssignModal();
            } else {
              router.push(`/events/${activeSlug}/ok/helfende`);
            }
            close();
          },
        });
      }

      // Check-in & Anwesenheit
      list.push({
        id: `context-checkin`,
        title: `Helfer-Check-in & QR-Code`,
        subtitle: `Anwesenheit vor Ort am Anlass prüfen`,
        section: 'CONTEXT',
        icon: <ClipboardCheck className="size-4 text-accent-ink" />,
        keywords: ['checkin', 'anwesenheit', 'qr', 'scannen', 'vor ort', activeSlug, eventTitle],
        onSelect: () => {
          recordRecentCommand(`context-checkin`);
          router.push(`/events/${activeSlug}/checkin`);
          close();
        },
      });

      // Plan drucken / PDF-Export
      list.push({
        id: `context-print-pdf`,
        title: `Schichtplan drucken / PDF`,
        subtitle: `Druckversion oder PDF für «${eventTitle}» erstellen`,
        section: 'CONTEXT',
        icon: <Printer className="size-4 text-accent-ink" />,
        keywords: ['drucken', 'pdf', 'export', 'aushang', 'papier', activeSlug, eventTitle],
        onSelect: () => {
          recordRecentCommand(`context-print-pdf`);
          if (contextData.onPrintPlan) {
            contextData.onPrintPlan();
          } else {
            router.push(`/events/${activeSlug}/ok/export`);
          }
          close();
        },
      });

      // Link kopieren
      list.push({
        id: `context-copy-link`,
        title: `Anlass-Link kopieren`,
        subtitle: eventUrl,
        section: 'CONTEXT',
        icon: <Copy className="size-4 text-accent-ink" />,
        keywords: ['link', 'kopieren', 'teilen', 'url', activeSlug, eventTitle],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand(`context-copy-link`);
          copyToClipboard(eventUrl, 'Anlass-Link');
        },
      });

      // =========================================================================
      // SCHICHTEN DES AKTUELLEN ANLASSES (MIT DIREKTEN SOFORTAKTIONEN!)
      // =========================================================================
      if (detailedEvent?.shifts?.length) {
        for (const shift of detailedEvent.shifts) {
          const shiftTime = `${fmtShortWeekday(shift.startTime)} ${fmtTimeRange(shift.startTime, shift.endTime)}`;
          const freeSlots = Math.max(0, shift.requiredSlots - (shift.signups?.length || 0));
          const slotBadge = freeSlots > 0 ? `${freeSlots} frei` : 'Voll besetzt';

          // Hat der aktuell angemeldete Benutzer diese Schicht übernommen?
          const mySignup = user ? shift.signups?.find((su) => su.userId === user.id) : null;
          const isMyShift = Boolean(mySignup);
          const isMyShiftReplacement = Boolean(
            mySignup && (mySignup as unknown as { isReplacement?: boolean }).isReplacement
          );

          // Subaktionen für diese Schicht aufbauen
          const shiftSubActions: CommandSubAction[] = [];

          // 1. Direktaktion: Eintragen (ohne Seitenwechsel!)
          if (user && !isMyShift && freeSlots > 0) {
            shiftSubActions.push({
              id: 'direct-signup',
              title: `⚡ Direkt eintragen (als ${displayName(user)})`,
              subtitle: 'Schicht sofort übernehmen, ohne die Seite zu wechseln',
              icon: <UserPlus className="size-3.5 text-success-ink" />,
              closeOnSelect: false,
              onSelect: () => handleDirectSignup(shift),
            });
          }

          // 2. Direktaktion: Stornieren / Austragen
          if (isMyShift && mySignup) {
            shiftSubActions.push({
              id: 'direct-cancel',
              title: '⚡ Meinen Einsatz stornieren',
              subtitle: 'Sofort aus dieser Schicht austragen',
              icon: <Trash2 className="size-3.5 text-danger-ink" />,
              closeOnSelect: false,
              onSelect: () =>
                handleDirectCancelSignup(shift.id, mySignup.id, shift.title || shiftName(shift)),
            });

            shiftSubActions.push({
              id: 'direct-replacement',
              title: isMyShiftReplacement ? '«Ersatz gesucht» zurückziehen' : '«Ersatz gesucht» ausschreiben',
              subtitle: isMyShiftReplacement
                ? 'Du übernimmst die Schicht wieder regulär'
                : 'Schicht zur Übernahme für andere Helfer anbieten',
              icon: <RotateCcw className="size-3.5 text-warning-ink" />,
              closeOnSelect: false,
              onSelect: () => handleDirectReplacement(mySignup.id, isMyShiftReplacement),
            });
          }

          // 3. Direktaktion für OK: Alle Helfenden dieser Schicht einchecken
          if (canManageEvent && shift.signups && shift.signups.length > 0) {
            const allPresent = shift.signups.every(
              (su) => (attendanceOverrides[su.id] ?? su.attendance) === 'PRESENT'
            );
            shiftSubActions.push({
              id: 'checkin-all-shift',
              title: allPresent
                ? `Anwesenheit für Schicht zurücksetzen (${shift.signups.length})`
                : `Alle Helfenden dieser Schicht einchecken (${shift.signups.length})`,
              subtitle: allPresent ? 'Alle als offen markieren' : 'Alle eingeteilten Helfer als anwesend markieren',
              icon: allPresent ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5 text-success-ink" />,
              closeOnSelect: false,
              onSelect: () => toggleShiftAllAttendance(shift),
            });

            // Einzelne Helfer der Schicht direkt einchecken
            for (const su of shift.signups) {
              const curAtt = attendanceOverrides[su.id] ?? su.attendance;
              const isPres = curAtt === 'PRESENT';
              shiftSubActions.push({
                id: `checkin-helper-${su.id}`,
                title: isPres ? `${su.displayName} abmelden` : `${su.displayName} einchecken`,
                subtitle: isPres ? 'Als offen markieren' : 'Als anwesend bestätigen',
                icon: isPres ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5 text-success-ink" />,
                closeOnSelect: false,
                onSelect: () => toggleAttendance(su.id, su.displayName, isPres ? 'PRESENT' : null),
              });
            }

            // Einzelne Helfer der Schicht direkt per WhatsApp anschreiben
            for (const su of shift.signups) {
              const matchedPerson = people.find((p) => p.userId === su.userId || p.id === su.userId);
              const helperPhone = su.guestPhone || su.userPhone || matchedPerson?.phone;
              shiftSubActions.push({
                id: `wa-helper-${su.id}`,
                title: `WhatsApp an ${su.displayName} schreiben`,
                subtitle: helperPhone ? `Direktchat mit ${helperPhone} öffnen` : 'Handynummer eingeben & Direktchat starten',
                icon: <MessageSquare className="size-3.5 text-success-ink" />,
                closeOnSelect: false,
                onSelect: () => {
                  if (helperPhone) {
                    openWhatsAppDirect(helperPhone, su.userFirstName || su.displayName);
                  } else {
                    const input = window.prompt(`Handynummer für ${su.displayName} eingeben (z. B. 079 123 45 67):`);
                    if (input && input.trim()) {
                      openWhatsAppDirect(input.trim(), su.userFirstName || su.displayName);
                    }
                  }
                },
              });
            }
          }

          // 4. Direktaktion: WhatsApp-Aufruf für diese Schicht
          shiftSubActions.push({
            id: 'copy-shift-whatsapp',
            title: 'WhatsApp-Helferaufruf für diese Schicht kopieren',
            subtitle: 'Fertige Vorlage mit Zeit, Bereich und Link',
            icon: <Share2 className="size-3.5 text-accent-ink" />,
            closeOnSelect: false,
            onSelect: () => copyShiftWhatsAppCall(eventTitle, shift, eventUrl),
          });

          // 5. Direktaktion: Schichtdetails als Text kopieren
          shiftSubActions.push({
            id: 'copy-shift-text',
            title: 'Schichtdetails als Text kopieren',
            subtitle: `${shiftTime} · ${shift.category || 'Allgemein'} · ${shift.signups?.length || 0}/${shift.requiredSlots}`,
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => {
              const names = (shift.signups || []).map((su) => su.displayName).join(', ') || 'Niemand eingeteilt';
              const text = [
                `📋 Schicht: ${shift.title || shiftName(shift)}`,
                `Anlass: ${eventTitle}`,
                `Zeit: ${shiftTime}`,
                shift.category ? `Bereich: ${shift.category}` : null,
                `Besetzung: ${shift.signups?.length || 0} von ${shift.requiredSlots} (${freeSlots} frei)`,
                `Helfende: ${names}`,
                shift.description ? `Hinweise: ${shift.description}` : null,
                `Link: ${eventUrl}#shift-${shift.id}`,
              ]
                .filter(Boolean)
                .join('\n');
              copyToClipboard(text, 'Schichtdetails');
            },
          });

          // 6. Direktlink kopieren
          shiftSubActions.push({
            id: 'copy-shift-link',
            title: 'Direktlink zur Schicht kopieren',
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => {
              const url = `${eventUrl}#shift-${shift.id}`;
              copyToClipboard(url, 'Schicht-Link');
            },
          });

          // 7. Navigation
          shiftSubActions.push({
            id: 'select-shift-plan',
            title: 'Im Schichtplan anspringen',
            subtitle: `${shiftTime} · ${slotBadge}`,
            icon: <Ticket className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              if (activeSlug && pathname.startsWith(`/events/${activeSlug}`)) {
                if (contextData.onSelectShift) {
                  contextData.onSelectShift(shift.id);
                }
                const el = document.getElementById(`shift-${shift.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (activeSlug) {
                router.push(`/events/${activeSlug}?schicht=${shift.id}#shift-${shift.id}`);
              }
              close();
            },
          });

          if (canManageEvent) {
            shiftSubActions.push({
              id: 'manage-shift',
              title: 'Im OK-Bereich bearbeiten',
              icon: <Settings className="size-3.5" />,
              onSelect: () => {
                router.push(`/events/${activeSlug}/ok/schichten`);
                close();
              },
            });
          }

          // QuickActions für Desktop-Vorschau
          const quickActions: CommandQuickAction[] = [];
          if (user && !isMyShift && freeSlots > 0) {
            quickActions.push({
              id: 'quick-signup',
              label: 'Jetzt eintragen',
              icon: <UserPlus className="size-3.5" />,
              tone: 'success',
              onClick: () => handleDirectSignup(shift),
            });
          } else if (isMyShift && mySignup) {
            quickActions.push({
              id: 'quick-cancel',
              label: 'Einsatz stornieren',
              icon: <Trash2 className="size-3.5" />,
              tone: 'danger',
              onClick: () =>
                handleDirectCancelSignup(shift.id, mySignup.id, shift.title || shiftName(shift)),
            });
          }
          quickActions.push({
            id: 'quick-wa',
            label: 'WhatsApp',
            icon: <Share2 className="size-3.5" />,
            tone: 'accent',
            onClick: () => copyShiftWhatsAppCall(eventTitle, shift, eventUrl),
          });
          quickActions.push({
            id: 'quick-copy',
            label: 'Kopieren',
            icon: <Copy className="size-3.5" />,
            onClick: () => copyToClipboard(`${eventUrl}#shift-${shift.id}`, 'Schicht-Link'),
          });

          list.push({
            id: `shift-${shift.id}`,
            title: shift.title || shiftTime,
            subtitle: `${shiftTime} · ${shift.category || 'Allgemein'} (${slotBadge})${isMyShift ? ' · ★ Eingeteilt' : ''}`,
            section: 'SHIFTS',
            badge: isMyShift ? 'Mein Einsatz' : slotBadge,
            badgeTone: isMyShift
              ? 'success'
              : freeSlots > 0
                ? freeSlots <= 2
                  ? 'warning'
                  : 'accent'
                : 'neutral',
            icon: isMyShift ? (
              <CheckCircle2 className="size-4 text-success-ink" />
            ) : (
              <Ticket className="size-4 text-accent-ink" />
            ),
            keywords: [
              'schicht',
              shift.title || '',
              shift.category || '',
              shiftTime,
              freeSlots > 0 ? 'frei offen unbesetzt lücke' : 'voll',
              isMyShift ? 'meine einsatz ich' : '',
              activeSlug,
              eventTitle,
            ],
            onSelect: () => {
              recordRecentCommand(`shift-${shift.id}`);
              if (activeSlug && pathname.startsWith(`/events/${activeSlug}`)) {
                if (contextData.onSelectShift) {
                  contextData.onSelectShift(shift.id);
                }
                const el = document.getElementById(`shift-${shift.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (activeSlug) {
                router.push(`/events/${activeSlug}?schicht=${shift.id}#shift-${shift.id}`);
              }
              close();
            },
            subActions: shiftSubActions,
            preview: {
              type: 'SHIFT',
              shift: {
                id: shift.id,
                title: shift.title,
                startTime: shift.startTime,
                endTime: shift.endTime,
                requiredSlots: shift.requiredSlots,
                category: shift.category,
                description: shift.description,
                signups: (shift.signups || []).map((su) => ({
                  id: su.id,
                  displayName: su.displayName,
                  userId: su.userId,
                  attendance: attendanceOverrides[su.id] ?? su.attendance,
                  isSelf: user ? su.userId === user.id : false,
                })),
              },
              quickActions,
              details: [
                { label: 'Uhrzeit', value: shiftTime },
                { label: 'Kategorie', value: shift.category || 'Allgemein' },
                { label: 'Freie Plätze', value: `${freeSlots} von ${shift.requiredSlots}` },
                ...(shift.signups?.length
                  ? [{ label: 'Eingeteilt', value: shift.signups.map((s) => s.displayName).join(', ') }]
                  : []),
              ],
            },
          });
        }
      }
    }

    // =========================================================================
    // 2. SCHNELLAKTIONEN (GLOBAL)
    // =========================================================================
    if (can('EVENTS_CREATE') || isDeptAdmin) {
      list.push({
        id: 'action-create-event',
        title: 'Neuen Anlass erstellen',
        subtitle: 'Neues Cevi-Lager, Fest oder Veranstaltung erfassen',
        section: 'ACTIONS',
        icon: <CalendarPlus className="size-4 text-accent-ink" />,
        keywords: ['anlass', 'event', 'neu', 'erstellen', 'veranstaltung'],
        onSelect: () => {
          recordRecentCommand('action-create-event');
          if (pathname === '/') {
            const url = new URL(window.location.href);
            url.searchParams.set('createEvent', '1');
            window.history.pushState({}, '', url.toString());
            window.dispatchEvent(new PopStateEvent('popstate'));
          } else {
            router.push('/?createEvent=1');
          }
          close();
        },
      });
    }

    if (can('DEPARTMENT_SETTINGS') || isDeptAdmin) {
      list.push({
        id: 'action-dept-settings',
        title: 'Abteilung bearbeiten',
        subtitle: 'Name, Logo, Akzentfarbe und Startseiten-Einstellungen',
        section: 'ACTIONS',
        icon: <Settings2 className="size-4 text-accent-ink" />,
        keywords: ['abteilung', 'einstellungen', 'logo', 'farbe', 'design'],
        onSelect: () => {
          recordRecentCommand('action-dept-settings');
          router.push('/?settings=1');
          close();
        },
      });
    }

    if (can('STUFEN_MANAGE') || isDeptAdmin) {
      list.push({
        id: 'action-manage-stufen',
        title: 'Stufen verwalten',
        subtitle: 'Stufen erfassen, Cevi.DB verknüpfen oder bearbeiten',
        section: 'ACTIONS',
        icon: <Wrench className="size-4 text-accent-ink" />,
        keywords: ['stufen', 'gruppen', 'cevidb', 'verwalten'],
        onSelect: () => {
          recordRecentCommand('action-manage-stufen');
          router.push('/?stufen=1');
          close();
        },
      });
    }

    if (can('PEOPLE_MANAGE') || isDeptAdmin) {
      list.push({
        id: 'action-manage-people',
        title: 'Personen und Rechte verwalten',
        subtitle: 'Berechtigungen, Rollen und Abteilungsmitglieder pflegen',
        section: 'ACTIONS',
        icon: <UserCheck className="size-4 text-accent-ink" />,
        keywords: ['personen', 'rechte', 'rollen', 'mitglieder', 'admin'],
        onSelect: () => {
          recordRecentCommand('action-manage-people');
          router.push('/?people=1');
          close();
        },
      });
    }

    if (can('PEOPLE_VIEW') || can('DEPARTMENT_SETTINGS') || isDeptAdmin) {
      list.push({
        id: 'action-dept-stats',
        title: 'Abteilungsstatistik & Jahresrückblick (GV)',
        subtitle: 'Helferstunden, Stufenauswertung und Ehrentafel für den GV-Jahresbericht',
        section: 'ACTIONS',
        icon: <BarChart3 className="size-4 text-accent-ink" />,
        keywords: ['statistik', 'gv', 'jahresbericht', 'helferstunden', 'ehrentafel', 'stufen', 'ranking', 'auswertung', 'stunden'],
        onSelect: () => {
          recordRecentCommand('action-dept-stats');
          router.push('/?stats=1');
          close();
        },
      });
    }

    // Globale E-Mail-Verteiler-Aktion
    if (canViewPeople && people.length > 0) {
      list.push({
        id: 'action-copy-dept-emails',
        title: 'E-Mail-Verteiler aller Abteilungsmitglieder kopieren',
        subtitle: `Deduplizierte Adressen von ${people.filter((p) => p.email).length} Personen in die Zwischenablage`,
        section: 'ACTIONS',
        icon: <Mail className="size-4 text-accent-ink" />,
        keywords: ['mail', 'verteiler', 'abteilung', 'alle', 'rundmail'],
        closeOnSelect: false,
        onSelect: () => {
          recordRecentCommand('action-copy-dept-emails');
          const emails = Array.from(new Set(people.map((p) => p.email?.trim()).filter(Boolean)));
          if (emails.length === 0) {
            toast({ title: 'Keine E-Mail-Adressen vorhanden', tone: 'info' });
            return;
          }
          copyToClipboard(emails.join(', '), `${emails.length} Abteilungs-E-Mail-Adressen`);
        },
      });
    }

    // Direkter WhatsApp-Chat per Handynummer
    list.push({
      id: 'action-direct-whatsapp',
      title: 'WhatsApp-Nachricht an Handynummer senden',
      subtitle: 'Direktchat öffnen (Handynummer eingeben)',
      section: 'ACTIONS',
      icon: <MessageSquare className="size-4 text-success-ink" />,
      keywords: ['whatsapp', 'chat', 'nachricht', 'schreiben', 'direktchat', 'kontakt', 'handy', 'wa', 'message'],
      closeOnSelect: false,
      onSelect: () => {
        recordRecentCommand('action-direct-whatsapp');
        const input = window.prompt('Handynummer für WhatsApp-Direktchat eingeben (z. B. 079 123 45 67):');
        if (input && input.trim()) {
          openWhatsAppDirect(input.trim());
        }
      },
    });

    // =========================================================================
    // 3. ANLÄSSE DER ABTEILUNG (MIT KALENDER, WHATSAPP, TEILEN & EXPORT)
    // =========================================================================
    for (const event of allEvents) {
      const status = eventStatus(event);
      const statusBadge = status === 'past' ? 'Vergangen' : status === 'live' ? 'Findet statt' : 'Demnächst';
      const badgeTone: BadgeTone = status === 'past' ? 'neutral' : status === 'live' ? 'accent' : 'success';
      const eventUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/events/${event.slug}`
          : `/events/${event.slug}`;
      const dateText = fmtShortDate(event.startDate);

      const eventQuickActions: CommandQuickAction[] = [
        {
          id: 'quick-ics',
          label: 'Kalender (.ics)',
          icon: <Download className="size-3.5" />,
          onClick: () => handleDownloadIcs(event),
        },
        {
          id: 'quick-gcal',
          label: 'Google Kalender',
          icon: <ExternalLink className="size-3.5" />,
          onClick: () => handleGoogleCalendar(event),
        },
        {
          id: 'quick-link',
          label: 'Link kopieren',
          icon: <Copy className="size-3.5" />,
          onClick: () => copyToClipboard(eventUrl, 'Anlass-Link'),
        },
      ];

      const eventSubActions: CommandSubAction[] = [
        {
          id: 'open-event',
          title: 'Zum Anlass gehen',
          subtitle: `Schichtplan und Details öffnen`,
          icon: <Ticket className="size-3.5" />,
          onSelect: () => {
            router.push(`/events/${event.slug}`);
            close();
          },
        },
        {
          id: 'download-ics',
          title: 'Kalenderdatei (.ics) herunterladen',
          subtitle: 'Direkt in Apple/Outlook/Handy importieren',
          icon: <Download className="size-3.5 text-accent-ink" />,
          closeOnSelect: false,
          onSelect: () => handleDownloadIcs(event),
        },
        {
          id: 'add-gcal',
          title: 'Zu Google Kalender hinzufügen',
          subtitle: 'Neuen Termin in Google Kalender eintragen',
          icon: <ExternalLink className="size-3.5 text-accent-ink" />,
          closeOnSelect: false,
          onSelect: () => handleGoogleCalendar(event),
        },
        {
          id: 'copy-link',
          title: 'Anlass-Link kopieren',
          subtitle: eventUrl,
          icon: <Copy className="size-3.5" />,
          closeOnSelect: false,
          onSelect: () => copyToClipboard(eventUrl, 'Anlass-Link'),
        },
      ];

      if (can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin) {
        eventSubActions.push({
          id: 'open-ok',
          title: 'OK-Bereich öffnen',
          subtitle: 'Planung, Schichten und Helfende verwalten',
          icon: <LayoutDashboard className="size-3.5" />,
          onSelect: () => {
            router.push(`/events/${event.slug}/ok`);
            close();
          },
        });
        eventSubActions.push({
          id: 'open-export',
          title: 'Drucken & Export (PDF/Excel)',
          subtitle: 'Aushänge und Tabellen exportieren',
          icon: <Download className="size-3.5" />,
          onSelect: () => {
            router.push(`/events/${event.slug}/ok/export`);
            close();
          },
        });
      }

      eventSubActions.push({
        id: 'open-checkin',
        title: 'Helfer-Check-in & QR-Code',
        subtitle: 'Präsenz am Anlass erfassen',
        icon: <ClipboardCheck className="size-3.5" />,
        onSelect: () => {
          router.push(`/events/${event.slug}/checkin`);
          close();
        },
      });

      list.push({
        id: `event-${event.id}`,
        title: event.title,
        subtitle: `${dateText} · ${statusBadge}`,
        section: 'EVENTS',
        badge: statusBadge,
        badgeTone,
        icon: <CalendarDays className="size-4 text-accent-ink" />,
        keywords: ['anlass', 'event', event.title, event.slug, dateText, statusBadge],
        onSelect: () => {
          recordRecentCommand(`event-${event.id}`);
          router.push(`/events/${event.slug}`);
          close();
        },
        subActions: eventSubActions,
        preview: {
          type: 'EVENT',
          event,
          quickActions: eventQuickActions,
          details: [
            { label: 'Datum', value: `${fmtShortWeekday(event.startDate)} ${fmtShortDate(event.startDate)}` },
            { label: 'Status', value: statusBadge },
            { label: 'Slug', value: event.slug },
          ],
        },
      });
    }

    // =========================================================================
    // 4. PERSONEN & HELFENDE (UNIFIZIERT MIT SCHICHTEN & DIREKT-AKTIONEN)
    // =========================================================================
    if (canViewPeople || detailedEvent?.shifts?.length) {
      interface HelperShiftEntry {
        shiftId: string;
        signupId: string;
        title: string;
        taskTitle?: string | null;
        startTime: string;
        endTime: string;
        category?: string | null;
        attendance?: 'PRESENT' | null;
      }

      const eventSignupsByHelper = new Map<string, HelperShiftEntry[]>();
      const guestHelpers = new Map<
        string,
        {
          id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          shifts: HelperShiftEntry[];
        }
      >();

      if (detailedEvent?.shifts?.length) {
        for (const shift of detailedEvent.shifts) {
          for (const signup of shift.signups ?? []) {
            const curAtt =
              attendanceOverrides[signup.id] ??
              (signup as unknown as { attendance?: 'PRESENT' | null }).attendance ??
              null;
            const entry: HelperShiftEntry = {
              shiftId: shift.id,
              signupId: signup.id,
              title: shift.title || fmtTimeRange(shift.startTime, shift.endTime),
              taskTitle: signup.taskTitle,
              startTime: shift.startTime,
              endTime: shift.endTime,
              category: shift.category,
              attendance: curAtt,
            };

            if (signup.userId) {
              const existing = eventSignupsByHelper.get(signup.userId) ?? [];
              existing.push(entry);
              eventSignupsByHelper.set(signup.userId, existing);
            } else {
              const gKey = `guest:${signup.guestName || signup.displayName || signup.id}`;
              const existingGuest = guestHelpers.get(gKey) ?? {
                id: signup.id,
                name: signup.displayName,
                email: signup.guestEmail,
                phone: signup.guestPhone,
                shifts: [],
              };
              existingGuest.shifts.push(entry);
              guestHelpers.set(gKey, existingGuest);
            }
          }
        }
      }

      interface UnifiedPerson {
        id: string;
        name: string;
        firstName?: string;
        lastName?: string | null;
        ceviName?: string | null;
        email?: string | null;
        phone?: string | null;
        role?: string | null;
        stufen?: { name: string }[];
        shifts: HelperShiftEntry[];
        isGuest?: boolean;
      }

      const unifiedPeople: UnifiedPerson[] = [];

      // 1. Abteilungsmitglieder
      for (const person of people) {
        const pName = displayName(person);
        const pShifts = eventSignupsByHelper.get(person.id) ? [...eventSignupsByHelper.get(person.id)!] : [];

        // Zusätzliche Namens-Matches prüfen falls userId nicht verknüpft war
        if (pShifts.length === 0 && detailedEvent?.shifts?.length) {
          for (const [key, g] of guestHelpers.entries()) {
            if (
              g.name.toLowerCase() === pName.toLowerCase() ||
              (person.ceviName && g.name.toLowerCase() === person.ceviName.toLowerCase()) ||
              (person.email && g.email && person.email.toLowerCase() === g.email.toLowerCase())
            ) {
              pShifts.push(...g.shifts);
              guestHelpers.delete(key);
            }
          }
        }

        unifiedPeople.push({
          id: person.id,
          name: pName,
          firstName: person.firstName,
          lastName: person.lastName,
          ceviName: person.ceviName,
          email: person.email,
          phone: person.phone,
          role: person.role,
          stufen: person.stufen,
          shifts: pShifts,
        });
      }

      // 2. Gast-Helfer aus dem aktuellen Anlass, die noch nicht zugeordnet wurden
      for (const [, guest] of guestHelpers) {
        unifiedPeople.push({
          id: `guest-${guest.id}`,
          name: guest.name,
          firstName: guest.name,
          email: guest.email,
          phone: guest.phone,
          role: 'Gast-Helfer',
          shifts: guest.shifts,
          isGuest: true,
        });
      }

      // 3. Weitere angemeldete Helfende des aktuellen Anlasses (falls nicht in people)
      for (const [userId, shifts] of eventSignupsByHelper.entries()) {
        if (!unifiedPeople.some((p) => p.id === userId)) {
          const firstSignup = detailedEvent?.shifts
            ?.flatMap((s) => s.signups ?? [])
            .find((su) => su.userId === userId);
          if (firstSignup) {
            unifiedPeople.push({
              id: userId,
              name: firstSignup.displayName,
              firstName: firstSignup.userFirstName || firstSignup.displayName,
              lastName: firstSignup.userLastName,
              ceviName: firstSignup.userCeviName,
              email: firstSignup.userEmail || null,
              phone: firstSignup.userPhone || null,
              role: 'Helfer*in',
              shifts,
            });
          }
        }
      }

      // Sortieren: Helfer mit Schichten im aktuellen Anlass ZUERST!
      unifiedPeople.sort((a, b) => {
        if (a.shifts.length > 0 && b.shifts.length === 0) return -1;
        if (a.shifts.length === 0 && b.shifts.length > 0) return 1;
        if (a.shifts.length !== b.shifts.length) return b.shifts.length - a.shifts.length;
        return a.name.localeCompare(b.name, 'de-CH');
      });

      // CommandItems erzeugen
      for (const person of unifiedPeople) {
        const personShifts = person.shifts;
        const hasShifts = personShifts.length > 0;
        const presentCount = personShifts.filter((s) => s.attendance === 'PRESENT').length;
        const allPresent = hasShifts && presentCount === personShifts.length;

        let badgeText: string | undefined = undefined;
        let badgeTone: BadgeTone = 'neutral';

        if (hasShifts) {
          if (allPresent) {
            badgeText = `Anwesend (${personShifts.length})`;
            badgeTone = 'success';
          } else if (presentCount > 0) {
            badgeText = `${presentCount}/${personShifts.length} anwesend`;
            badgeTone = 'warning';
          } else {
            badgeText = `${personShifts.length} ${personShifts.length === 1 ? 'Schicht' : 'Schichten'}`;
            badgeTone = 'accent';
          }
        } else if (activeEvent && prefixMode === 'PEOPLE') {
          badgeText = '0 Schichten';
          badgeTone = 'neutral';
        }

        let subtitleText = '';
        if (hasShifts) {
          const shiftSummaries = personShifts
            .slice(0, 2)
            .map((s) => `${shiftName(s)} (${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)})`);
          subtitleText = `${personShifts.length} ${personShifts.length === 1 ? 'Schicht' : 'Schichten'}: ${shiftSummaries.join(', ')}${personShifts.length > 2 ? ` (+${personShifts.length - 2} weitere)` : ''}`;
        } else if (activeEvent) {
          subtitleText = `Keine Schichten in «${activeEvent.title}» · ${person.ceviName ? `«${person.ceviName}»` : person.role || 'Abteilungsmitglied'}`;
        } else {
          subtitleText = `${person.ceviName ? `«${person.ceviName}» · ` : ''}${person.email || person.phone || person.role || 'Abteilungsmitglied'}`;
        }

        const canManageCurrent = can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin;

        // Subaktionen für Person
        const personSubActions: CommandSubAction[] = [];

        // 1. Direktaktion: Check-in Toggle für alle Schichten
        if (hasShifts && canManageCurrent) {
          personSubActions.push({
            id: 'toggle-checkin-all',
            title: allPresent
              ? `Anwesenheit für ${person.name} zurücksetzen`
              : `Als anwesend einchecken (${personShifts.length} ${personShifts.length === 1 ? 'Schicht' : 'Schichten'})`,
            subtitle: `${presentCount} von ${personShifts.length} Schichten eingecheckt`,
            icon: allPresent ? (
              <RotateCcw className="size-3.5" />
            ) : (
              <CheckCircle2 className="size-3.5 text-success-ink" />
            ),
            closeOnSelect: false,
            onSelect: async () => {
              for (const s of personShifts) {
                await toggleAttendance(s.signupId, person.name, allPresent ? 'PRESENT' : null);
              }
            },
          });
        }

        // 2. Aktionen für jede einzelne übernommene Schicht
        for (const s of personShifts) {
          const isPres = s.attendance === 'PRESENT';
          personSubActions.push({
            id: `person-shift-${s.shiftId}-${s.signupId}`,
            title: `Schicht: ${s.title?.trim() || s.taskTitle || shiftName(s)}${s.title?.trim() && s.taskTitle ? ` (${s.taskTitle})` : ''}`,
            subtitle: `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}${s.category ? ` · ${s.category}` : ''} · ${isPres ? 'Eingecheckt' : 'Noch offen'}`,
            icon: <CalendarDays className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              if (activeSlug && pathname.startsWith(`/events/${activeSlug}`)) {
                if (contextData.onSelectShift) {
                  contextData.onSelectShift(s.shiftId);
                }
                const el = document.getElementById(`shift-${s.shiftId}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else if (activeSlug) {
                router.push(`/events/${activeSlug}?schicht=${s.shiftId}#shift-${s.shiftId}`);
              }
              close();
            },
          });

          if (canManageCurrent) {
            personSubActions.push({
              id: `toggle-single-att-${s.signupId}`,
              title: isPres ? `Anwesenheit für «${s.title}» zurücksetzen` : `Für «${s.title}» als anwesend markieren`,
              icon: isPres ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5 text-success-ink" />,
              closeOnSelect: false,
              onSelect: () => toggleAttendance(s.signupId, person.name, isPres ? 'PRESENT' : null),
            });
          }
        }

        // 3. Direkte Kommunikation (WhatsApp immer an erster Stelle)
        if (person.phone) {
          personSubActions.push({
            id: 'wa-chat',
            title: `WhatsApp-Nachricht an ${person.firstName || person.name} senden`,
            subtitle: `Direktchat mit ${person.phone} öffnen`,
            icon: <MessageSquare className="size-3.5 text-success-ink" />,
            closeOnSelect: false,
            onSelect: () => openWhatsAppDirect(person.phone!, person.firstName),
          });

          personSubActions.push({
            id: 'call-phone',
            title: `Anrufen (${person.phone})`,
            icon: <Phone className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              window.location.href = `tel:${person.phone}`;
            },
          });

          personSubActions.push({
            id: 'sms-phone',
            title: `SMS senden (${person.phone})`,
            icon: <Phone className="size-3.5" />,
            onSelect: () => openSmsDirect(person.phone!),
          });

          personSubActions.push({
            id: 'copy-phone',
            title: 'Telefonnummer kopieren',
            subtitle: person.phone,
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => copyToClipboard(person.phone!, 'Telefonnummer'),
          });
        } else {
          personSubActions.push({
            id: 'wa-chat-prompt',
            title: `WhatsApp-Nachricht an ${person.firstName || person.name} senden`,
            subtitle: 'Keine Handynummer hinterlegt (klicken für Direkteingabe)',
            icon: <MessageSquare className="size-3.5 text-success-ink" />,
            closeOnSelect: false,
            onSelect: () => {
              const input = window.prompt(
                `Handynummer für ${person.firstName || person.name} eingeben (z. B. 079 123 45 67):`
              );
              if (input && input.trim()) {
                openWhatsAppDirect(input.trim(), person.firstName);
              }
            },
          });
        }

        if (person.email) {
          personSubActions.push({
            id: 'send-email',
            title: `E-Mail an ${person.email} schreiben`,
            icon: <Mail className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              window.location.href = `mailto:${person.email}`;
            },
          });

          personSubActions.push({
            id: 'copy-email',
            title: 'E-Mail-Adresse kopieren',
            subtitle: person.email,
            icon: <Copy className="size-3.5" />,
            closeOnSelect: false,
            onSelect: () => copyToClipboard(person.email!, 'E-Mail'),
          });
        }

        // 4. Navigation & Einteilung
        if (activeSlug && canManageCurrent) {
          personSubActions.push({
            id: 'assign-shift',
            title: 'Für eine Schicht einteilen',
            subtitle: `Person manuell einer Schicht von «${activeEvent?.title || 'Anlass'}» zuweisen`,
            icon: <UserPlus className="size-3.5" />,
            onSelect: () => {
              if (contextData.onOpenAssignModal) {
                contextData.onOpenAssignModal();
              } else {
                router.push(`/events/${activeSlug}/ok/schichten`);
              }
              close();
            },
          });

          personSubActions.push({
            id: 'view-ok-helpers',
            title: 'Im OK-Bereich bei Helfenden öffnen',
            subtitle: `Filtert die Helfer-Tabelle nach «${person.name}»`,
            icon: <Users className="size-3.5 text-accent-ink" />,
            onSelect: () => {
              router.push(`/events/${activeSlug}/ok/helfende?search=${encodeURIComponent(person.name)}`);
              close();
            },
          });
        }

        // QuickActions für Desktop-Vorschau
        const personQuickActions: CommandQuickAction[] = [
          {
            id: 'p-wa',
            label: 'WhatsApp',
            icon: <MessageSquare className="size-3.5" />,
            tone: 'success',
            onClick: () => {
              if (person.phone) {
                openWhatsAppDirect(person.phone, person.firstName);
              } else {
                const input = window.prompt(
                  `Handynummer für ${person.firstName || person.name} eingeben (z. B. 079 123 45 67):`
                );
                if (input && input.trim()) {
                  openWhatsAppDirect(input.trim(), person.firstName);
                }
              }
            },
          },
        ];
        if (person.phone) {
          personQuickActions.push({
            id: 'p-call',
            label: 'Anrufen',
            icon: <Phone className="size-3.5" />,
            onClick: () => {
              window.location.href = `tel:${person.phone}`;
            },
          });
        }
        if (person.email) {
          personQuickActions.push({
            id: 'p-mail',
            label: 'E-Mail',
            icon: <Mail className="size-3.5" />,
            onClick: () => {
              window.location.href = `mailto:${person.email}`;
            },
          });
        }

        const item: CommandItem = {
          id: `person-${person.id}`,
          title: person.name,
          subtitle: subtitleText,
          section: 'PEOPLE',
          badge: badgeText,
          badgeTone,
          icon: allPresent ? (
            <CheckCircle2 className="size-4 text-success-ink" />
          ) : hasShifts ? (
            <UserRound className="size-4 text-accent-ink" />
          ) : (
            <UserRound className="size-4 text-fg-subtle" />
          ),
          keywords: [
            'person',
            'helfer',
            'whatsapp',
            'wa',
            'chat',
            'nachricht',
            'sms',
            'telefon',
            'kontakt',
            person.name,
            person.firstName || '',
            person.lastName || '',
            person.ceviName || '',
            person.email || '',
            person.phone || '',
            ...(hasShifts ? ['schichten', 'eingeteilt', ...personShifts.map((s) => s.title)] : []),
          ],
          onSelect: () => {
            recordRecentCommand(`person-${person.id}`);
            setActiveSubActionItem(item);
          },
          subActions: personSubActions,
          preview: {
            type: 'PERSON',
            person: {
              id: person.id,
              name: person.name,
              ceviName: person.ceviName,
              email: person.email,
              phone: person.phone,
              role: person.role || (hasShifts ? `${personShifts.length} Schichten eingeteilt` : 'Abteilungsmitglied'),
              stufen: person.stufen?.map((s) => s.name),
              shifts: personShifts.map((s) => ({
                id: s.shiftId,
                signupId: s.signupId,
                title: s.title,
                time: `${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`,
                category: s.category,
                attendance: s.attendance,
              })),
            },
            quickActions: personQuickActions,
            details: [
              { label: 'Name', value: `${person.firstName || ''} ${person.lastName || ''}`.trim() || person.name },
              ...(person.ceviName ? [{ label: 'Cevi-Name', value: person.ceviName }] : []),
              ...(person.email ? [{ label: 'E-Mail', value: person.email }] : []),
              ...(person.phone ? [{ label: 'Telefon', value: person.phone }] : []),
              ...(activeEvent
                ? [
                    {
                      label: 'Einsätze',
                      value: hasShifts
                        ? `${personShifts.length} ${personShifts.length === 1 ? 'Schicht' : 'Schichten'}`
                        : 'Keine Einsätze',
                    },
                  ]
                : []),
            ],
          },
        };

        list.push(item);
      }
    }

    // =========================================================================
    // 5. NAVIGATION (SEITEN & PORTAL)
    // =========================================================================
    list.push({
      id: 'nav-home',
      title: 'Anlässe & Startseite',
      subtitle: `Übersicht aller Veranstaltungen der ${department?.name || 'Abteilung'}`,
      section: 'NAVIGATION',
      icon: <CalendarDays className="size-4" />,
      keywords: ['start', 'home', 'anlässe', 'events', 'abteilung'],
      onSelect: () => {
        recordRecentCommand('nav-home');
        router.push('/');
        close();
      },
    });

    list.push({
      id: 'nav-my-shifts',
      title: 'Meine Schichten',
      subtitle: 'Deine angemeldeten Einsätze und Bestätigungen',
      section: 'NAVIGATION',
      icon: <Ticket className="size-4" />,
      keywords: ['meine', 'schichten', 'einsätze', 'termine', 'helfer'],
      onSelect: () => {
        recordRecentCommand('nav-my-shifts');
        router.push('/meine-schichten');
        close();
      },
      subActions: [
        {
          id: 'open-my-shifts',
          title: 'Meine Schichten öffnen',
          icon: <Ticket className="size-3.5" />,
          onSelect: () => {
            router.push('/meine-schichten');
            close();
          },
        },
      ],
    });

    if (user) {
      list.push({
        id: 'nav-profile',
        title: 'Mein Profil & Kontaktdaten',
        subtitle: `${displayName(user)} · Angaben, Benachrichtigungen und Stufen`,
        section: 'NAVIGATION',
        icon: <UserRound className="size-4" />,
        keywords: ['profil', 'konto', 'name', 'einstellungen', 'telefon', 'mail'],
        onSelect: () => {
          recordRecentCommand('nav-profile');
          router.push('/profil');
          close();
        },
      });
    }

    list.push({
      id: 'nav-help',
      title: 'Hilfe-Center öffnen',
      subtitle: 'Anleitungen für Helfende, OK-Teams und Abteilungsleiter',
      section: 'NAVIGATION',
      icon: <LifeBuoy className="size-4" />,
      keywords: ['hilfe', 'anleitung', 'support', 'doku', 'faq'],
      onSelect: () => {
        window.open('https://hilfe.cevi-schichtplan.ch', '_blank', 'noopener,noreferrer');
        close();
      },
      subActions: [
        {
          id: 'help-external',
          title: 'In neuem Tab öffnen',
          icon: <ExternalLink className="size-3.5" />,
          onSelect: () => {
            window.open('https://hilfe.cevi-schichtplan.ch', '_blank');
          },
        },
      ],
    });

    list.push({
      id: 'nav-status',
      title: 'System-Status prüfen',
      subtitle: 'Verfügbarkeit der Dienste, DB und Mailserver',
      section: 'NAVIGATION',
      icon: <ExternalLink className="size-4" />,
      keywords: ['status', 'uptime', 'server', 'betrieb'],
      onSelect: () => {
        window.open('https://status.cevi-schichtplan.ch', '_blank', 'noopener,noreferrer');
        close();
      },
    });

    // =========================================================================
    // 6. SYSTEM & THEME
    // =========================================================================
    list.push({
      id: 'system-theme-dark',
      title: 'Design: Dunkelmodus aktivieren',
      subtitle: 'Dunkles Farbschema (Nachtansicht)',
      section: 'SYSTEM',
      icon: <Moon className="size-4" />,
      keywords: ['dark', 'dunkel', 'nacht', 'theme', 'design', 'schwarz'],
      onSelect: () => setTheme('dark'),
    });

    list.push({
      id: 'system-theme-light',
      title: 'Design: Hellmodus aktivieren',
      subtitle: 'Helles Farbschema (Tagesansicht)',
      section: 'SYSTEM',
      icon: <Sun className="size-4" />,
      keywords: ['light', 'hell', 'tag', 'theme', 'design', 'weiss'],
      onSelect: () => setTheme('light'),
    });

    list.push({
      id: 'system-theme-system',
      title: 'Design: System-Standard folgen',
      subtitle: 'Automatisch an Geräte-Einstellung anpassen',
      section: 'SYSTEM',
      icon: <Sparkles className="size-4" />,
      keywords: ['system', 'automatisch', 'theme', 'design'],
      onSelect: () => setTheme('system'),
    });

    if (user) {
      list.push({
        id: 'system-logout',
        title: 'Abmelden',
        subtitle: `Als ${displayName(user)} abmelden`,
        section: 'SYSTEM',
        icon: <LogOut className="size-4 text-danger-ink" />,
        keywords: ['abmelden', 'logout', 'ausloggen', 'verlassen'],
        onSelect: () => {
          logout();
          close();
        },
      });
    } else {
      list.push({
        id: 'system-login',
        title: 'Anmelden',
        subtitle: 'Mit Cevi.DB oder E-Mail/Passwort anmelden',
        section: 'SYSTEM',
        icon: <LogIn className="size-4 text-accent-ink" />,
        keywords: ['anmelden', 'login', 'einloggen', 'cevidb'],
        onSelect: () => {
          window.location.href = loginHref;
          close();
        },
      });
    }

    return list;
  }, [
    prefixMode,
    activeSlug,
    activeEvent,
    detailedEvent,
    isOkArea,
    contextData,
    attendanceOverrides,
    allEvents,
    people,
    canViewPeople,
    department,
    user,
    can,
    isDeptAdmin,
    pathname,
    router,
    close,
    setActiveSubActionItem,
    loginHref,
    logout,
  ]);

  // Fuzzy-Suche & Relevanz-Berechnung
  const filteredItems = useMemo(() => {
    // Wenn im Hilfe-Modus, direkt alle Hilfe-Items zurückgeben
    if (prefixMode === 'HELP') return items;

    // Präfix-Filterung nach Sektion
    let pool = items;
    if (prefixMode === 'PEOPLE') pool = items.filter((i) => i.section === 'PEOPLE');
    else if (prefixMode === 'EVENTS') pool = items.filter((i) => i.section === 'EVENTS');
    else if (prefixMode === 'SHIFTS') pool = items.filter((i) => i.section === 'SHIFTS');

    const q = cleanQuery.trim().toLowerCase();

    // Wenn keine Suchanfrage eingetippt ist
    if (!q) {
      // Wenn im Präfix-Modus, zeige den gesamten Bereich
      if (prefixMode !== 'ALL') return pool;

      // Wenn normal leer: Zuletzt verwendete Befehle an den Anfang setzen
      const recentIds = getRecentCommandIds();
      const recentItems: CommandItem[] = [];

      for (const rId of recentIds) {
        const found = items.find((i) => i.id === rId);
        if (found && !recentItems.some((r) => r.id === found.id)) {
          recentItems.push({
            ...found,
            id: `recent-${found.id}`,
            section: 'RECENT',
            subtitle: `Zuletzt verwendet · ${found.subtitle || ''}`,
            onSelect: found.onSelect,
          });
        }
      }

      if (recentItems.length > 0) {
        return [...recentItems, ...items];
      }

      return items;
    }

    const terms = q.split(/\s+/).filter(Boolean);

    interface ScoredItem {
      item: CommandItem;
      score: number;
    }

    const scored: ScoredItem[] = [];

    for (const item of pool) {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const subLower = (item.subtitle || '').toLowerCase();
      const kwString = (item.keywords || []).join(' ').toLowerCase();

      // Prüfe jedes Suchwort
      let allTermsMatched = true;

      for (const term of terms) {
        let termScore = 0;

        if (titleLower === term) {
          termScore += 120;
        } else if (titleLower.startsWith(term)) {
          termScore += 80;
        } else if (titleLower.includes(` ${term}`)) {
          termScore += 60;
        } else if (titleLower.includes(term)) {
          termScore += 40;
        } else if (subLower.includes(term)) {
          termScore += 25;
        } else if (kwString.includes(term)) {
          termScore += 20;
        } else {
          // Akronym-Match (z. B. "soli" für "Sommer Lager")
          const initials = titleLower
            .split(/[\s-]+/)
            .map((w) => w[0])
            .join('');
          if (initials.includes(term)) {
            termScore += 30;
          } else {
            allTermsMatched = false;
            break;
          }
        }

        termScore += termScore;
      }

      if (allTermsMatched && score >= 0) {
        // Bonus für Kontext-Sektion
        if (item.section === 'CONTEXT') score += 50;
        else if (item.section === 'ACTIONS') score += 20;
        else if (item.section === 'EVENTS') score += 15;

        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [items, cleanQuery, prefixMode]);

  // Sektionen gruppieren
  const groupedSections = useMemo(() => {
    const sectionLabels: Record<CommandSection, string> = {
      RECENT: 'Zuletzt verwendet',
      CONTEXT: activeEvent ? `Aktueller Anlass: ${activeEvent.title}` : 'Aktueller Kontext',
      ACTIONS: 'Schnellaktionen & Verwaltung',
      EVENTS: 'Anlässe',
      SHIFTS: 'Schichten & Arbeitsbereiche',
      PEOPLE: 'Helfende & Personen',
      NAVIGATION: 'Seiten & Navigation',
      HELP: 'Tastaturkürzel & Hilfe',
      SYSTEM: 'System & Design',
    };

    const sectionOrder: CommandSection[] = [
      'RECENT',
      'CONTEXT',
      'ACTIONS',
      'EVENTS',
      'SHIFTS',
      'PEOPLE',
      'NAVIGATION',
      'HELP',
      'SYSTEM',
    ];

    const groups: { section: CommandSection; label: string; items: CommandItem[] }[] = [];

    for (const sec of sectionOrder) {
      const secItems = filteredItems.filter((i) => i.section === sec);
      if (secItems.length > 0) {
        groups.push({
          section: sec,
          label: sectionLabels[sec],
          items: secItems,
        });
      }
    }

    return groups;
  }, [filteredItems, activeEvent]);

  return {
    items: filteredItems,
    groupedSections,
    activeEvent,
    isOkArea,
    prefixMode,
    cleanQuery,
  };
}
