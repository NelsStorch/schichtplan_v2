'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  History,
  Info,
  Keyboard,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  Mail,
  Moon,
  Phone,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  Share2,
  Sparkles,
  Sun,
  Ticket,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { EventDto, ShiftDto, ShiftSignupDto } from '@schichtplan/shared';
import { useToast } from '@schichtplan/ui';
import { api, useLoginHref } from '@/lib/api';
import { eventStatus } from '@/components/EventTile';
import { fmtDayMonth, fmtShortDate, fmtShortWeekday, fmtTimeRange } from '@/lib/format';
import { displayName, usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { useCommandPalette } from './CommandContext';
import { getRecentCommandIds, recordRecentCommand } from './recentCommands';
import type { CommandItem, CommandSection, CommandSubAction, CommandPreviewData } from './types';

const THEME_STORAGE_KEY = 'schichtplan.theme';

interface DepartmentPerson {
  id: string;
  firstName: string;
  lastName?: string | null;
  ceviName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string;
  stufen?: { name: string }[];
}

export type PrefixMode = 'ALL' | 'PEOPLE' | 'EVENTS' | 'SHIFTS' | 'HELP';

export function useCommandItems(query: string) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const loginHref = useLoginHref();
  const { user, department, can, isDeptAdmin, logout } = usePortal();
  const { contextData, close } = useCommandPalette();

  const [allEvents, setAllEvents] = useState<EventDto[]>([]);
  const [people, setPeople] = useState<DepartmentPerson[]>([]);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, 'PRESENT' | null>>({});

  // Anlässe laden (und cachen)
  useEffect(() => {
    if (!department) return;
    api<EventDto[]>('/api/events')
      .then((data) => setAllEvents(data || []))
      .catch(() => setAllEvents([]));
  }, [department]);

  // Personen laden, falls Recht vorhanden
  const canViewPeople = can('PEOPLE_VIEW') || isDeptAdmin;
  useEffect(() => {
    if (!canViewPeople || !department) return;
    api<DepartmentPerson[]>('/api/departments/current/people?alle=1')
      .then((data) => setPeople(data || []))
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

  // Hilfsfunktion für Link-Kopieren
  const copyToClipboard = async (text: string, title: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${title} kopiert`, tone: 'success' });
    } catch {
      toast({ title: 'Kopieren fehlgeschlagen', tone: 'error' });
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
        choice === 'dark' ? 'Dunkelmodus aktiviert' : choice === 'light' ? 'Hellmodus aktiviert' : 'System-Farbschema aktiv',
      tone: 'info',
    });
    close();
  };

  // Inline Helfer Check-in
  const toggleAttendance = async (signupId: string, helperName: string, currentStatus: string | null) => {
    if (!activeSlug) return;
    const newStatus = currentStatus === 'PRESENT' ? null : 'PRESENT';
    try {
      await api(`/api/events/${activeSlug}/signups/${signupId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      setAttendanceOverrides((prev) => ({ ...prev, [signupId]: newStatus }));
      toast({
        title: newStatus === 'PRESENT' ? `${helperName} eingecheckt` : `Anwesenheit zurückgesetzt`,
        description: newStatus === 'PRESENT' ? 'Erfolgreich als anwesend markiert' : 'Status wurde zurückgesetzt',
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

  // Liste aller verfügbaren Befehle generieren
  const items = useMemo(() => {
    const list: CommandItem[] = [];

    // =========================================================================
    // 0. HILFE-BEFEHLE (bei '?' oder prefixMode === 'HELP')
    // =========================================================================
    if (prefixMode === 'HELP') {
      list.push({
        id: 'help-shortcuts',
        title: 'Tastatur-Navigation',
        subtitle: '↑ / ↓ zum Navigieren · ↵ zum Ausführen · ⇥ für Unteraktionen · Esc zum Schliessen',
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
          ],
        },
      });

      list.push({
        id: 'help-prefix-people',
        title: 'Präfix @ für Personen',
        subtitle: 'Tippe «@name», um blitzschnell nur nach Helfenden und Kontakten zu suchen',
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
        subtitle: 'Tippe «:kueche» oder «!frei», um direkt Schichten und freie Plätze zu finden',
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
      const eventUrl = typeof window !== 'undefined' ? `${window.location.origin}/events/${activeSlug}` : `/events/${activeSlug}`;
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
      const detailedEvent = contextData.event as EventDetails | undefined;
      const shiftsWithGaps = detailedEvent?.shifts?.filter(
        (s) => Math.max(0, s.requiredSlots - (s.signups?.length || 0)) > 0
      ) || [];

      if (shiftsWithGaps.length > 0) {
        const totalMissing = shiftsWithGaps.reduce(
          (acc, s) => acc + Math.max(0, s.requiredSlots - (s.signups?.length || 0)),
          0
        );

        list.push({
          id: `context-open-shifts`,
          title: `Lücken-Finder: Freie Schichten`,
          subtitle: `${totalMissing} offene Plätze in ${shiftsWithGaps.length} Schichten`,
          section: 'CONTEXT',
          badge: `${totalMissing} offen`,
          badgeTone: 'warning',
          icon: <Search className="size-4 text-warning-ink" />,
          keywords: ['lücken', 'frei', 'offen', 'unbesetzt', 'bedarf', 'helfer gesucht', activeSlug],
          onSelect: () => {
            recordRecentCommand(`context-open-shifts`);
            // Schalte Suche auf freie Schichten um
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
              id: 'copy-link',
              title: 'Anlass-Link zum Eintragen kopieren',
              icon: <Copy className="size-3.5" />,
              onSelect: () => copyToClipboard(eventUrl, 'Link zum Eintragen'),
            },
          ],
          preview: {
            type: 'ACTION',
            details: [
              { label: 'Offene Plätze', value: `${totalMissing} Helfer gesucht` },
              { label: 'Betroffene Schichten', value: `${shiftsWithGaps.length} von ${detailedEvent?.shifts?.length || 0}` },
            ],
          },
        });
      }

      // Neue Schicht erfassen (im aktuellen Anlass)
      if (canManageEvent) {
        list.push({
          id: `context-add-shift`,
          title: `Neue Schicht anlegen`,
          subtitle: `In ${eventTitle} eine weitere Schicht erfassen`,
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
          subtitle: `Person für eine Schicht in ${eventTitle} einteilen`,
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
        subtitle: `Druckversion oder PDF für ${eventTitle} erstellen`,
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
        title: `Anlass-Link in Zwischenablage kopieren`,
        subtitle: eventUrl,
        section: 'CONTEXT',
        icon: <Share2 className="size-4 text-accent-ink" />,
        keywords: ['link', 'kopieren', 'teilen', 'url', activeSlug, eventTitle],
        onSelect: () => {
          recordRecentCommand(`context-copy-link`);
          copyToClipboard(eventUrl, 'Anlass-Link');
          close();
        },
      });

      // INLINE-HELFER-CHECK-IN: Alle Helfer des aktuellen Anlasses auflisten
      if (canManageEvent && detailedEvent?.shifts?.length) {
        for (const shift of detailedEvent.shifts) {
          if (!shift.signups?.length) continue;
          for (const signup of shift.signups) {
            const currentAttendance = attendanceOverrides[signup.id] ?? (signup as unknown as { attendance?: 'PRESENT' | null }).attendance ?? null;
            const isPresent = currentAttendance === 'PRESENT';

            list.push({
              id: `attendance-${signup.id}`,
              title: signup.displayName,
              subtitle: `${shift.title} · ${isPresent ? 'Bereits anwesend' : 'Noch nicht eingecheckt'}`,
              section: 'PEOPLE',
              badge: isPresent ? 'Anwesend' : 'Offen',
              badgeTone: isPresent ? 'success' : 'neutral',
              icon: isPresent ? (
                <CheckCircle2 className="size-4 text-success-ink" />
              ) : (
                <UserRound className="size-4 text-accent-ink" />
              ),
              keywords: [
                'helfer',
                'checkin',
                'anwesend',
                signup.displayName,
                signup.guestName || '',
                shift.title,
                activeSlug,
              ],
              onSelect: async () => {
                recordRecentCommand(`attendance-${signup.id}`);
                await toggleAttendance(signup.id, signup.displayName, currentAttendance);
              },
              subActions: [
                {
                  id: 'toggle-checkin',
                  title: isPresent ? 'Anwesenheit zurücksetzen' : 'Als anwesend einchecken',
                  icon: isPresent ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />,
                  onSelect: async () => {
                    await toggleAttendance(signup.id, signup.displayName, currentAttendance);
                  },
                },
                ...(signup.guestEmail
                  ? [
                      {
                        id: 'mail',
                        title: `E-Mail an ${signup.guestEmail}`,
                        icon: <Mail className="size-3.5" />,
                        onSelect: () => {
                          window.location.href = `mailto:${signup.guestEmail}`;
                        },
                      },
                    ]
                  : []),
                ...(signup.guestPhone
                  ? [
                      {
                        id: 'phone',
                        title: `Anrufen: ${signup.guestPhone}`,
                        icon: <Phone className="size-3.5" />,
                        onSelect: () => {
                          window.location.href = `tel:${signup.guestPhone}`;
                        },
                      },
                    ]
                  : []),
              ],
              preview: {
                type: 'PERSON',
                person: {
                  name: signup.displayName,
                  email: signup.guestEmail,
                  phone: signup.guestPhone,
                  role: `Schicht: ${shift.title}`,
                },
                details: [
                  { label: 'Schicht', value: shift.title },
                  { label: 'Zeit', value: fmtTimeRange(shift.startTime, shift.endTime) },
                  { label: 'Status', value: isPresent ? 'Eingecheckt' : 'Noch offen' },
                ],
              },
            });
          }
        }
      }

      // Schichten des aktuellen Events
      if (detailedEvent?.shifts?.length) {
        for (const shift of detailedEvent.shifts) {
          const shiftTime = `${fmtShortWeekday(shift.startTime)} ${fmtTimeRange(shift.startTime, shift.endTime)}`;
          const freeSlots = Math.max(0, shift.requiredSlots - (shift.signups?.length || 0));
          const slotBadge = freeSlots > 0 ? `${freeSlots} frei` : 'Voll besetzt';

          list.push({
            id: `shift-${shift.id}`,
            title: shift.title,
            subtitle: `${shiftTime} · ${shift.category || 'Allgemein'} (${slotBadge})`,
            section: 'SHIFTS',
            badge: slotBadge,
            badgeTone: freeSlots > 0 ? (freeSlots <= 2 ? 'warning' : 'accent') : 'neutral',
            icon: <Ticket className="size-4 text-accent-ink" />,
            keywords: [
              'schicht',
              shift.title,
              shift.category || '',
              shiftTime,
              freeSlots > 0 ? 'frei offen unbesetzt' : 'voll',
              activeSlug,
              eventTitle,
            ],
            onSelect: () => {
              recordRecentCommand(`shift-${shift.id}`);
              if (pathname.startsWith(`/events/${activeSlug}`)) {
                const el = document.getElementById(`shift-${shift.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              } else {
                router.push(`/events/${activeSlug}#shift-${shift.id}`);
              }
              close();
            },
            subActions: [
              {
                id: 'copy-shift-link',
                title: 'Direktlink zur Schicht kopieren',
                icon: <Copy className="size-3.5" />,
                onSelect: () => {
                  const url = `${eventUrl}#shift-${shift.id}`;
                  copyToClipboard(url, 'Schicht-Link');
                },
              },
              ...(canManageEvent
                ? [
                    {
                      id: 'manage-shift',
                      title: 'Im OK-Bereich bearbeiten',
                      icon: <Settings className="size-3.5" />,
                      onSelect: () => {
                        router.push(`/events/${activeSlug}/ok/schichten`);
                        close();
                      },
                    },
                  ]
                : []),
            ],
            preview: {
              type: 'SHIFT',
              shift,
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

    // =========================================================================
    // 3. ANLÄSSE DER ABTEILUNG
    // =========================================================================
    for (const event of allEvents) {
      const status = eventStatus(event);
      const statusBadge = status === 'past' ? 'Vergangen' : status === 'live' ? 'Findet statt' : 'Demnächst';
      const badgeTone = status === 'past' ? 'neutral' : status === 'live' ? 'accent' : 'success';
      const eventUrl = typeof window !== 'undefined' ? `${window.location.origin}/events/${event.slug}` : `/events/${event.slug}`;
      const dateText = fmtShortDate(event.startDate);

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
        subActions: [
          {
            id: 'open-event',
            title: 'Zum Anlass gehen',
            icon: <Ticket className="size-3.5" />,
            onSelect: () => {
              router.push(`/events/${event.slug}`);
              close();
            },
          },
          {
            id: 'copy-link',
            title: 'Anlass-Link kopieren',
            icon: <Copy className="size-3.5" />,
            onSelect: () => copyToClipboard(eventUrl, 'Anlass-Link'),
          },
          ...((can('EVENTS_EDIT_SETTINGS') || can('SHIFTS_MANAGE') || isDeptAdmin)
            ? [
                {
                  id: 'open-ok',
                  title: 'OK-Bereich öffnen',
                  icon: <LayoutDashboard className="size-3.5" />,
                  onSelect: () => {
                    router.push(`/events/${event.slug}/ok`);
                    close();
                  },
                },
                {
                  id: 'open-export',
                  title: 'Drucken & Export (PDF/Excel)',
                  icon: <Download className="size-3.5" />,
                  onSelect: () => {
                    router.push(`/events/${event.slug}/ok/export`);
                    close();
                  },
                },
              ]
            : []),
          {
            id: 'open-checkin',
            title: 'Helfer-Check-in',
            icon: <ClipboardCheck className="size-3.5" />,
            onSelect: () => {
              router.push(`/events/${event.slug}/checkin`);
              close();
            },
          },
        ],
        preview: {
          type: 'EVENT',
          event,
          details: [
            { label: 'Datum', value: `${fmtShortWeekday(event.startDate)} ${fmtShortDate(event.startDate)}` },
            { label: 'Status', value: statusBadge },
            { label: 'Slug', value: event.slug },
          ],
        },
      });
    }

    // =========================================================================
    // 4. PERSONEN & HELFER (FALLS BERECHTIGT)
    // =========================================================================
    if (canViewPeople && people.length > 0) {
      for (const person of people) {
        const pName = displayName(person);
        const fullName = `${person.firstName} ${person.lastName || ''}`.trim();
        const roleDesc = person.ceviName ? `${person.ceviName} (${fullName})` : fullName;

        list.push({
          id: `person-${person.id}`,
          title: pName,
          subtitle: `${roleDesc}${person.email ? ` · ${person.email}` : ''}`,
          section: 'PEOPLE',
          icon: <UserRound className="size-4 text-accent-ink" />,
          keywords: ['person', 'helfer', person.firstName, person.lastName || '', person.ceviName || '', person.email || ''],
          onSelect: () => {
            recordRecentCommand(`person-${person.id}`);
            if (person.email) {
              window.location.href = `mailto:${person.email}`;
            } else if (person.phone) {
              window.location.href = `tel:${person.phone}`;
            } else {
              toast({ title: pName, description: roleDesc });
            }
            close();
          },
          subActions: [
            ...(person.email
              ? [
                  {
                    id: 'email',
                    title: `E-Mail an ${person.email} schreiben`,
                    icon: <Mail className="size-3.5" />,
                    onSelect: () => {
                      window.location.href = `mailto:${person.email}`;
                    },
                  },
                  {
                    id: 'copy-email',
                    title: 'E-Mail-Adresse kopieren',
                    icon: <Copy className="size-3.5" />,
                    onSelect: () => copyToClipboard(person.email!, 'E-Mail'),
                  },
                ]
              : []),
            ...(person.phone
              ? [
                  {
                    id: 'call',
                    title: `Anrufen (${person.phone})`,
                    icon: <Phone className="size-3.5" />,
                    onSelect: () => {
                      window.location.href = `tel:${person.phone}`;
                    },
                  },
                  {
                    id: 'copy-phone',
                    title: 'Telefonnummer kopieren',
                    icon: <Copy className="size-3.5" />,
                    onSelect: () => copyToClipboard(person.phone!, 'Telefonnummer'),
                  },
                ]
              : []),
          ],
          preview: {
            type: 'PERSON',
            person: {
              name: pName,
              ceviName: person.ceviName,
              email: person.email,
              phone: person.phone,
              role: roleDesc,
              stufen: person.stufen?.map((s) => s.name),
            },
            details: [
              { label: 'Name', value: fullName },
              ...(person.ceviName ? [{ label: 'Cevi-Name', value: person.ceviName }] : []),
              ...(person.email ? [{ label: 'E-Mail', value: person.email }] : []),
              ...(person.phone ? [{ label: 'Telefon', value: person.phone }] : []),
            ],
          },
        });
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

      list.push({
        id: 'nav-cevidb',
        title: 'Cevi.DB Synchronisation',
        subtitle: 'Verknüpfte Hitobito-Daten und Stufen anzeigen',
        section: 'NAVIGATION',
        icon: <Sparkles className="size-4" />,
        keywords: ['cevidb', 'hitobito', 'daten', 'sync', 'abgleich'],
        onSelect: () => {
          recordRecentCommand('nav-cevidb');
          router.push('/cevidb-daten');
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
