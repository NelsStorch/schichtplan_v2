'use client';

import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CalendarPlus, Check, ChevronDown, Crown, LifeBuoy, Loader2, Palette, Plus, Shield, Trash2, Users } from 'lucide-react';
import {
  ATTENDANCE_MODES,
  REPLACEMENT_CUTOFF_HOURS,
  helpUrl,
  toZurichInput,
  zurichInputToIso,
  type AttendanceMode,
  type EventTemplateDto,
  type EventContactVisibility,
} from '@schichtplan/shared';
import { Badge, Button, Callout, Dialog, Field, Input, Select, Switch, Textarea, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { displayName, usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { BANNER_PRESETS } from './event-meta';
import { EMPTY_ACCESS, EventAccessFields, accessPayload, type EventAccessValues } from './EventAccessFields';
import { ImageUpload } from './ImageUpload';
import { questionDraft } from './ok/QuestionsEditor';
import { SectionBody, useSection } from './ok/SettingsSections';

export interface EventFormValues {
  title: string;
  slug: string;
  description: string;
  reminderNote: string;
  logoUrl: string;
  bannerUrl: string;
  /** Nur beim Anlegen: Tag des Anlasses (YYYY-MM-DD). Danach ergibt sich der Zeitraum aus den Schichten. */
  startDate: string;
  /** false = Eintragen geschlossen (nur noch das OK teilt ein) */
  allowPublicSignup: boolean;
  minShiftsPerPerson: number | null;
  cancelDeadlineDays: number | null;
  overlapToleranceMinutes: number;
  contactUserId: string | null;
  dayCutoffTime: string;
  responsibleMode: 'BY_SHIFT' | 'BY_DAY';
  contactVisibility: EventContactVisibility;
  signupOpensAt: string;
  attendanceMode: AttendanceMode;
  /** «Ersatz gesucht» erlaubt, bis so viele Stunden vor Schichtbeginn */
  allowReplacement: boolean;
  replacementCutoffHours: number;
  access: EventAccessValues;
}

/** Startwerte für «Design & Einstellungen» eines bestehenden Anlasses */
export function eventFormInitial(event: EventDetails): Partial<EventFormValues> {
  return {
    title: event.title,
    slug: event.slug,
    description: event.description ?? '',
    reminderNote: event.reminderNote ?? '',
    logoUrl: event.logoUrl ?? '',
    bannerUrl: event.bannerUrl ?? '',
    allowPublicSignup: event.allowPublicSignup,
    minShiftsPerPerson: event.minShiftsPerPerson ?? null,
    cancelDeadlineDays: event.cancelDeadlineDays ?? null,
    overlapToleranceMinutes: event.overlapToleranceMinutes ?? 15,
    contactUserId: event.contactUserId ?? null,
    dayCutoffTime: event.dayCutoffTime ?? '04:00',
    responsibleMode: event.responsibleMode ?? 'BY_SHIFT',
    contactVisibility: event.contactVisibility ?? 'BOTH',
    signupOpensAt: event.signupOpensAt ? toZurichInput(event.signupOpensAt) : '',
    attendanceMode: event.attendanceMode ?? 'OFF',
    allowReplacement: event.allowReplacement ?? true,
    replacementCutoffHours: event.replacementCutoffHours ?? 0,
    access: {
      accessType: event.accessType,
      leadersOnly: event.leadersOnly,
      requiredFields: event.requiredFields,
      allowedDepartmentIds: event.allowedDepartments.map((d) => d.id),
      allowedStufeIds: event.allowedStufen.map((s) => s.id),
      questions: event.questions.map(questionDraft),
    },
  };
}

export interface FormOrganizer {
  userId?: string;
  ceviName?: string;
  email?: string;
  displayName: string;
  role: 'OK_LEAD' | 'OK_MEMBER';
  roleTitle?: string;
}

interface DeptMemberItem {
  id: string;
  userId: string;
  role: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  email?: string | null;
  displayName: string;
  /** Nur Cevi-Name-Profil: kann nicht ins OK */
  isCeviNameProfile?: boolean;
}

const EMPTY: EventFormValues = {
  title: '',
  slug: '',
  description: '',
  reminderNote: '',
  logoUrl: '',
  bannerUrl: BANNER_PRESETS[0].url,
  startDate: '',
  allowPublicSignup: true,
  minShiftsPerPerson: null,
  cancelDeadlineDays: null,
  overlapToleranceMinutes: 15,
  contactUserId: null,
  dayCutoffTime: '04:00',
  responsibleMode: 'BY_SHIFT',
  contactVisibility: 'BOTH',
  signupOpensAt: '',
  attendanceMode: 'OFF',
  allowReplacement: true,
  replacementCutoffHours: 0,
  access: EMPTY_ACCESS,
};

/** Tag aus <input type="date"> als Zeitpunkt: 12:00 Schweizer Zeit, damit er nie als Vortag erscheint */
const dayToIso = (day: string) => zurichInputToIso(`${day}T12:00`)!;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Ein Formular für "Neuer Anlass" (POST) und "Design & Einstellungen" (PATCH). */
export function EventFormDialog({
  open,
  onClose,
  onSaved,
  mode,
  initial,
  eventSlug,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (slug: string) => void;
  mode: 'create' | 'edit';
  initial?: Partial<EventFormValues>;
  eventSlug?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon={mode === 'create' ? <CalendarPlus /> : <Palette />}
      title={mode === 'create' ? 'Neuer Anlass' : 'Design & Einstellungen'}
      description={
        mode === 'create'
          ? 'Lege Titel, Daten, Zugang und das OK fest. Schichten fügst du danach hinzu.'
          : 'Zugang, Pflichtangaben, Banner und Logo dieses Anlasses anpassen.'
      }
    >
      <EventForm mode={mode} initial={initial} eventSlug={eventSlug} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

/** Abschnitt im Dialog: nur Überschrift */
function DialogSection({
  title,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h4 className="text-[13px] font-semibold text-fg">{title}</h4>
      {children}
    </section>
  );
}

/** Abschnitt auf der Einstellungs-Seite: eigene Karte mit Sprungmarke, seltene lassen sich einklappen */
function PageSection({
  id,
  title,
  description,
  summary,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  /** Eingeklappt: die wichtigsten Werte des Abschnitts */
  summary?: string;
  children: ReactNode;
}) {
  const { open, collapsible, setOpen } = useSection(id);
  const bodyId = `${id}-inhalt`;

  return (
    <section id={id} className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
      {collapsible ? (
        <h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="flex w-full items-start justify-between gap-3 rounded-field text-left"
          >
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold text-fg">{title}</span>
              <span className="mt-0.5 block text-sm text-fg-muted">{open ? description : summary}</span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn('mt-1 size-5 shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-180')}
            />
          </button>
        </h3>
      ) : (
        <>
          <h3 className="font-display text-lg font-bold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </>
      )}
      <SectionBody id={bodyId} open={open} onFound={() => setOpen(true)}>
        {children}
      </SectionBody>
    </section>
  );
}

/** Stand des automatischen Speicherns in der Leiste unten */
function SaveStatus({
  saving,
  dirty,
  error,
  blocked,
  savedAt,
}: {
  saving: boolean;
  dirty: boolean;
  error: string | null;
  /** Warum gerade nicht automatisch gespeichert wird */
  blocked: string | null;
  savedAt: Date | null;
}) {
  const row = 'flex min-w-0 items-center gap-1.5 text-sm font-medium';
  if (saving) {
    return (
      <p role="status" className={cn(row, 'text-fg-muted')}>
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-accent" /> Wird gespeichert …
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className={cn(row, 'text-danger-ink')}>
        <AlertCircle aria-hidden className="size-4 shrink-0 text-danger" /> {error}
      </p>
    );
  }
  if (blocked) {
    return (
      <p role="status" className={cn(row, 'text-warning-ink')}>
        <AlertCircle aria-hidden className="size-4 shrink-0 text-warning" /> {blocked}
      </p>
    );
  }
  if (dirty) {
    return (
      <p role="status" className={cn(row, 'text-accent-ink')}>
        <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-accent" /> Wird gespeichert …
      </p>
    );
  }
  if (savedAt) {
    return (
      <p role="status" className={cn(row, 'text-success-ink')}>
        <Check aria-hidden className="size-4 shrink-0 text-success" /> Gespeichert um {fmtTime(savedAt.toISOString())} Uhr
      </p>
    );
  }
  return <p className={cn(row, 'font-normal text-fg-subtle')}>Änderungen werden automatisch gespeichert</p>;
}

/**
 * Formular für «Neuer Anlass» (POST, im Dialog) und die Einstellungen eines Anlasses (PATCH,
 * im OK-Bereich als Seite mit `layout="page"`).
 */
export function EventForm({
  mode,
  initial,
  eventSlug,
  onCancel,
  onSaved,
  onAutoSaved,
  layout = 'dialog',
  dateRange,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<EventFormValues>;
  eventSlug?: string;
  /** Nur im Dialog: Auf der Seite ersetzt «Rückgängig» das Abbrechen */
  onCancel?: () => void;
  onSaved: (slug: string) => void;
  /** Nach dem automatischen Speichern auf der Seite */
  onAutoSaved?: () => void;
  layout?: 'dialog' | 'page';
  /** Bearbeiten: Anzeige des Zeitraums (aus den Schichten) mit «Verschieben» */
  dateRange?: ReactNode;
}) {
  const toast = useToast();
  const { user } = usePortal();
  const [form, setForm] = useState<EventFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Nach einem Klick auf Speichern zur Fehlermeldung oben scrollen (nicht beim Auto-Speichern im Hintergrund)
  const [scrollToError, setScrollToError] = useState(false);
  useEffect(() => {
    if (!scrollToError || !error) return;
    errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollToError(false);
  }, [scrollToError, error]);
  const [slugTouched, setSlugTouched] = useState(false);
  const initialSlug = initial?.slug || eventSlug || '';

  // Auto-Save für Einstellungs-Seite (layout === 'page' && mode === 'edit')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify({ ...EMPTY, ...initial }));
  // Stand beim Öffnen der Seite: dorthin führt «Rückgängig», auch nach dem automatischen Speichern
  const openedSnapshotRef = useRef<string>(lastSavedSnapshotRef.current);

  const formSnapshot = JSON.stringify(form);
  const isDirty = formSnapshot !== lastSavedSnapshotRef.current;
  const changedSinceOpen = formSnapshot !== openedSnapshotRef.current;

  // Auto-Save Effect
  useEffect(() => {
    if (mode !== 'edit' || layout !== 'page' || !eventSlug) return;
    if (!isDirty || saving) return;

    // Slug-Änderung darf NIE im Hintergrund gespeichert werden (benötigt 10s Countdown)
    if (form.slug !== initialSlug) return;

    // Validierung: Mindestens Titel muss vorhanden sein
    if (!form.title.trim()) return;

    const timer = setTimeout(async () => {
      setAutoSaveStatus('saving');
      setError(null);
      try {
        const shared = {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          reminderNote: form.reminderNote.trim() || null,
          logoUrl: form.logoUrl.trim() || null,
          bannerUrl: form.bannerUrl.trim() || null,
          minShiftsPerPerson: form.minShiftsPerPerson ?? null,
          cancelDeadlineDays:
            form.cancelDeadlineDays !== null &&
            form.cancelDeadlineDays !== undefined &&
            (form.cancelDeadlineDays as unknown as string) !== ''
              ? Number(form.cancelDeadlineDays)
              : null,
          overlapToleranceMinutes: form.overlapToleranceMinutes ?? 15,
          contactUserId: form.contactUserId || null,
          dayCutoffTime: form.dayCutoffTime || '04:00',
          responsibleMode: form.responsibleMode,
          contactVisibility: form.contactVisibility,
          signupOpensAt: form.signupOpensAt ? zurichInputToIso(form.signupOpensAt) : null,
          attendanceMode: form.attendanceMode,
          allowReplacement: form.allowReplacement,
          replacementCutoffHours: form.replacementCutoffHours,
          ...accessPayload(form.access),
        };

        await api(`/api/events/${eventSlug}`, {
          method: 'PATCH',
          json: {
            ...shared,
            description: form.description.trim() || null,
            allowPublicSignup: form.allowPublicSignup,
          },
        });

        lastSavedSnapshotRef.current = JSON.stringify(form);
        setAutoSaveStatus('saved');
        setLastSavedAt(new Date());
        onAutoSaved?.();
      } catch (err) {
        setAutoSaveStatus('error');
        setError(errorMessage(err));
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [form, isDirty, saving, mode, layout, eventSlug, initialSlug, onAutoSaved]);

  // Schutz beim Verlassen des Fensters mit ungespeicherten Daten
  useEffect(() => {
    if (layout !== 'page') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty || autoSaveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [layout, isDirty, autoSaveStatus]);

  // 10s Countdown bei Adress-Änderung eines bestehenden Events
  const [showSlugWarning, setShowSlugWarning] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!showSlugWarning) return;
    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showSlugWarning]);

  // OK-Mitglieder für neues Event
  const [organizers, setOrganizers] = useState<FormOrganizer[]>([]);
  const [deptMembers, setDeptMembers] = useState<DeptMemberItem[]>([]);
  const [selectedMemberUserId, setSelectedMemberUserId] = useState('');
  const [customWho, setCustomWho] = useState('');
  const [newRole, setNewRole] = useState<'OK_LEAD' | 'OK_MEMBER'>('OK_MEMBER');
  const [newRoleTitle, setNewRoleTitle] = useState('');

  // Vorlagen
  const [templates, setTemplates] = useState<EventTemplateDto[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Abteilungsmitglieder & Vorlagen laden
  useEffect(() => {
    api<DeptMemberItem[]>('/api/departments/current/members')
      .then(setDeptMembers)
      .catch(() => setDeptMembers([]));

    if (mode === 'create') {
      api<EventTemplateDto[]>('/api/event-templates')
        .then(setTemplates)
        .catch(() => setTemplates([]));
    }
  }, [mode]);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addOrganizer = () => {
    if (selectedMemberUserId) {
      const found = deptMembers.find((m) => m.userId === selectedMemberUserId);
      if (found) {
        if (organizers.some((o) => o.userId === found.userId)) {
          toast({ title: 'Bereits im OK', description: `${found.displayName} ist schon eingetragen.` });
          return;
        }
        setOrganizers((prev) => [
          ...prev,
          {
            userId: found.userId,
            displayName: found.displayName,
            role: newRole,
            roleTitle: newRoleTitle.trim() || undefined,
          },
        ]);
        setSelectedMemberUserId('');
        setNewRoleTitle('');
        return;
      }
    }

    const who = customWho.trim();
    if (who) {
      const isEmail = who.includes('@');
      setOrganizers((prev) => [
        ...prev,
        {
          ...(isEmail ? { email: who } : { ceviName: who }),
          displayName: who,
          role: newRole,
          roleTitle: newRoleTitle.trim() || undefined,
        },
      ]);
      setCustomWho('');
      setNewRoleTitle('');
    }
  };

  const removeOrganizer = (index: number) => {
    setOrganizers((prev) => prev.filter((_, i) => i !== index));
  };

  const executeSave = async (slugToSave?: string) => {
    setSaving(true);
    setError(null);
    try {
      const shared = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        reminderNote: form.reminderNote.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        minShiftsPerPerson: form.minShiftsPerPerson ?? null,
        cancelDeadlineDays:
          form.cancelDeadlineDays !== null &&
          form.cancelDeadlineDays !== undefined &&
          (form.cancelDeadlineDays as unknown as string) !== ''
            ? Number(form.cancelDeadlineDays)
            : null,
        overlapToleranceMinutes: form.overlapToleranceMinutes ?? 15,
        contactUserId: form.contactUserId || null,
        dayCutoffTime: form.dayCutoffTime || '04:00',
        responsibleMode: form.responsibleMode,
        contactVisibility: form.contactVisibility,
        signupOpensAt: form.signupOpensAt ? zurichInputToIso(form.signupOpensAt) : null,
        attendanceMode: form.attendanceMode,
        allowReplacement: form.allowReplacement,
        replacementCutoffHours: form.replacementCutoffHours,
        ...accessPayload(form.access, mode === 'create'),
      };

      if (mode === 'create') {
        if (selectedTemplateId) {
          await api(`/api/event-templates/${selectedTemplateId}/instantiate`, {
            method: 'POST',
            json: {
              ...shared,
              slug: form.slug,
              logoUrl: shared.logoUrl ?? undefined,
              bannerUrl: shared.bannerUrl ?? undefined,
              startDate: dayToIso(form.startDate),
              allowPublicSignup: true,
            },
          });
          toast({
            title: 'Anlass aus Vorlage erstellt',
            description: `${form.title} inklusive aller Schichten angelegt.`,
          });
        } else {
          await api('/api/events', {
            method: 'POST',
            json: {
              ...shared,
              slug: form.slug,
              logoUrl: shared.logoUrl ?? undefined,
              bannerUrl: shared.bannerUrl ?? undefined,
              startDate: dayToIso(form.startDate),
              allowPublicSignup: true,
              organizers: organizers.map((o) => ({
                userId: o.userId,
                ceviName: o.ceviName,
                email: o.email,
                role: o.role,
                roleTitle: o.roleTitle?.trim() || undefined,
              })),
            },
          });
          toast({ title: 'Anlass erstellt', description: `${form.title} ist jetzt sichtbar.` });
        }
        onSaved(form.slug);
      } else {
        const targetSlug = slugToSave || form.slug;
        const res = await api<{ id: string; slug: string }>(`/api/events/${eventSlug}`, {
          method: 'PATCH',
          json: {
            ...shared,
            slug: targetSlug !== initialSlug ? targetSlug : undefined,
            description: form.description.trim() || null,
            allowPublicSignup: form.allowPublicSignup,
          },
        });
        lastSavedSnapshotRef.current = JSON.stringify(form);
        setAutoSaveStatus('saved');
        setLastSavedAt(new Date());
        toast({ title: 'Einstellungen gespeichert' });
        onSaved(res.slug || targetSlug);
      }
    } catch (err) {
      setError(errorMessage(err));
      setScrollToError(true);
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'edit' && form.slug !== initialSlug) {
      setShowSlugWarning(true);
      return;
    }
    await executeSave();
  };

  // Verfügbare Mitglieder, die noch nicht im OK sind (Cevi-Name-Profile können keine Rolle haben)
  const availableMembers = deptMembers.filter(
    (m) => !m.isCeviNameProfile && !organizers.some((o) => o.userId === m.userId)
  );

  const undo = () => {
    setForm(JSON.parse(openedSnapshotRef.current));
    setError(null);
  };

  const S = layout === 'page' ? PageSection : DialogSection;
  // Auf der Seite passen kurze Felder nebeneinander, im Dialog bleibt alles untereinander
  const fieldColumns = layout === 'page' ? 'grid items-start gap-5 lg:grid-cols-2' : 'space-y-4';

  // Gründe, warum nicht automatisch gespeichert wird: Der Slug braucht die Bestätigung, ohne Titel gibt es keinen Anlass
  const titleMissing = !form.title.trim();
  const slugChanged = form.slug !== initialSlug;
  const autoSaveBlocked = titleMissing
    ? 'Titel fehlt: Es wird nichts gespeichert'
    : slugChanged
      ? 'Neue Adresse: Speichern und bestätigen'
      : null;
  const needsManualSave = isDirty && !titleMissing && (slugChanged || Boolean(error));

  const contactName = deptMembers.find((m) => m.userId === form.contactUserId)?.displayName;
  const bannerName = BANNER_PRESETS.find((p) => p.url === form.bannerUrl)?.name ?? (form.bannerUrl ? 'Eigenes Bild' : 'Keines');

  return (
    <form onSubmit={submit} className={layout === 'page' ? 'space-y-6' : 'space-y-7'}>
      {/* Auf der Seite steht die Meldung in der Speicherleiste, die immer sichtbar ist */}
      {error && layout === 'dialog' && (
        <div ref={errorRef} className="scroll-mt-24">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      <S id="grunddaten" title="Grunddaten" description="Name, Webadresse und Zeitraum des Anlasses.">
        <div className="grid gap-5 sm:grid-cols-2">
          {mode === 'create' && templates.length > 0 && (
            <Field
              label="Aus Vorlage erstellen (optional)"
              hint="Übernimmt alle Schichten, Arbeiten und Mindestalter automatisch"
              className="sm:col-span-2"
            >
              <Select
                value={selectedTemplateId}
                onChange={(e) => {
                  const tId = e.target.value;
                  setSelectedTemplateId(tId);
                  setSlugTouched(false);
                  if (tId) {
                    const found = templates.find((t) => t.id === tId);
                    if (found) {
                      const cleanTitle = found.title.replace(/\s*\(Vorlage\)\s*/i, '');
                      setForm((prev) => ({
                        ...prev,
                        title: cleanTitle,
                        slug: slugify(cleanTitle),
                        description: found.description || '',
                        reminderNote: found.data.reminderNote || '',
                        cancelDeadlineDays: found.cancelDeadlineDays ?? null,
                        overlapToleranceMinutes: found.overlapToleranceMinutes ?? 15,
                        allowReplacement: found.data.allowReplacement ?? true,
                        replacementCutoffHours: found.data.replacementCutoffHours ?? 0,
                        access: {
                          accessType: found.accessType,
                          leadersOnly: found.leadersOnly,
                          requiredFields: found.requiredFields,
                          allowedDepartmentIds: found.data.allowedDepartmentIds ?? [],
                          allowedStufeIds: found.data.allowedStufeIds ?? [],
                          questions: (found.data.questions ?? []).map(questionDraft),
                        },
                      }));
                    }
                  }
                }}
              >
                <option value="">Keine Vorlage (leerer Anlass)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.shiftCount} Schichten)
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Titel" required className={cn('sm:col-span-2', layout === 'page' && 'lg:col-span-1')}>
            <Input
              value={form.title}
              placeholder="Chilbi 2026"
              autoFocus={mode === 'create'}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({
                  ...f,
                  title: val,
                  slug: mode === 'create' && !slugTouched ? slugify(val) : f.slug,
                }));
              }}
            />
          </Field>

          <Field
            label={
              <span className="flex items-center justify-between gap-2 flex-wrap">
                <span>
                  Adresse (Slug) <span className="text-accent-ink" aria-hidden>*</span>
                </span>
                {mode === 'edit' && form.slug !== initialSlug ? (
                  <Badge tone="danger" size="sm" className="-my-1 font-normal">
                    Änderung bricht Links (10s Warnung)
                  </Badge>
                ) : mode === 'edit' ? (
                  <Badge tone="outline" size="sm" className="-my-1 font-normal text-fg-subtle">
                    Änderung bricht geteilte Links
                  </Badge>
                ) : null}
              </span>
            }
            hint={
              mode === 'create' ? (
                <span>
                  <span className="font-mono text-fg-muted">…/events/{form.slug || 'chilbi-2026'}</span>
                  <span className="mx-1.5 text-line-strong">·</span>
                  <span>
                    Empfehlung: Jahr ergänzen (z.&nbsp;B. <span className="font-mono">chilbi-2026</span>). Slugs sind abteilungsweit einmalig und bestimmen die Webadresse – so habt ihr nächstes Jahr wieder eine saubere Adresse.
                  </span>
                </span>
              ) : (
                <span>
                  <span className="font-mono text-fg-muted">…/events/{form.slug}</span>
                  <span className="mx-1.5 text-line-strong">·</span>
                  <span className={form.slug !== initialSlug ? 'text-danger-ink font-semibold' : 'text-fg-subtle'}>
                    Achtung: Eine Änderung macht alle bisher geteilten Links (WhatsApp, Einladungen) sowie Lesezeichen ungültig. Beim Speichern wird eine 10-sekündige Sicherheitsbestätigung verlangt.
                  </span>
                </span>
              )
            }
            className={cn('sm:col-span-2', layout === 'page' && 'lg:col-span-1')}
          >
            <Input
              value={form.slug}
              pattern="[a-z0-9\-]+"
              maxLength={50}
              required
              placeholder="chilbi-2026"
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', slugify(e.target.value));
              }}
              className="font-mono"
            />
          </Field>

          {mode === 'create' ? (
            <Field
              label={
                <span>
                  Datum <span className="text-accent-ink" aria-hidden>*</span>
                </span>
              }
              hint="Erster Tag des Anlasses. Sobald es Schichten gibt, ergibt sich der Zeitraum aus der ersten und letzten Schicht."
              className="sm:col-span-2"
            >
              <Input type="date" value={form.startDate} required onChange={(e) => set('startDate', e.target.value)} />
            </Field>
          ) : (
            dateRange && <div className="sm:col-span-2">{dateRange}</div>
          )}
          <Field label="Beschreibung" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.description}
              placeholder="Worum geht es? Was sollen die Helfenden wissen?"
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>
      </S>

      {/* Organisationskomitee (OK) bei neuem Event angeben */}
      {mode === 'create' && (
        <fieldset className="rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-4 text-accent-ink" />
            <legend className="text-[13px] font-semibold text-fg">Organisationskomitee (OK)</legend>
          </div>
          <p className="mb-4 text-xs text-fg-muted">
            Wer leitet diesen Anlass und teilt Helfende ein? Weitere Personen kannst du auch später unter «Einstellungen» hinzufügen.
          </p>

          {/* Bereits im OK eingetragene Personen */}
          <div className="mb-4 divide-y divide-line rounded-field border border-line bg-surface-1">
            {organizers.map((org, idx) => {
              const isLead = org.role === 'OK_LEAD';
              return (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full',
                        isLead ? 'bg-amber-500/15 text-amber-600' : 'bg-surface-3 text-fg-muted'
                      )}
                    >
                      {isLead ? <Crown className="size-3.5" /> : <Shield className="size-3.5" />}
                    </span>
                    <div className="min-w-0">
                      <span className="font-semibold text-fg truncate block">{org.displayName}</span>
                      <span className="text-xs text-fg-subtle">
                        {isLead ? 'OK-Leitung' : 'OK-Mitglied'}
                        {org.roleTitle && ` · ${org.roleTitle}`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeOrganizer(idx)}
                    title="Aus OK entfernen"
                    className="rounded p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
            {organizers.length === 0 && (
              <div className="p-3 text-xs text-fg-subtle text-center">Noch niemand im OK eingetragen.</div>
            )}
          </div>
          {/* Wer erstellt, kommt nicht automatisch ins OK: hier mit einem Klick, wenn gewünscht */}
          {user && !organizers.some((o) => o.userId === user.id) && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mb-4"
              onClick={() =>
                setOrganizers((prev) => [
                  ...prev,
                  { userId: user.id, displayName: displayName(user), role: 'OK_LEAD', roleTitle: 'Leitung' },
                ])
              }
            >
              <Crown /> Mich als OK-Leitung eintragen
            </Button>
          )}

          {/* Weitere Person hinzufügen */}
          <div className="space-y-3 rounded-field border border-line/70 bg-surface-2 p-3 text-xs">
            <span className="font-semibold text-fg block">Weitere Person zum OK hinzufügen</span>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-fg-subtle block mb-1">Aus Mitgliedern wählen</label>
                <select
                  value={selectedMemberUserId}
                  onChange={(e) => {
                    setSelectedMemberUserId(e.target.value);
                    if (e.target.value) setCustomWho('');
                  }}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                >
                  <option value="">-- Mitglied wählen --</option>
                  {availableMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-fg-subtle block mb-1">Oder Cevi-Name / E-Mail</label>
                <input
                  type="text"
                  placeholder="z.B. Falk oder falk@cevi.ch"
                  value={customWho}
                  onChange={(e) => {
                    setCustomWho(e.target.value);
                    if (e.target.value) setSelectedMemberUserId('');
                  }}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 items-end">
              <div>
                <label className="text-[11px] font-medium text-fg-subtle block mb-1">Rolle im OK</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'OK_LEAD' | 'OK_MEMBER')}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                >
                  <option value="OK_MEMBER">OK-Mitglied (Schichten planen und Helfende einteilen)</option>
                  <option value="OK_LEAD">OK-Leitung (zusätzlich Einstellungen und OK-Team)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-fg-subtle block mb-1">Ressort / Bezeichnung (optional)</label>
                <input
                  type="text"
                  placeholder="z. B. Bau & Technik, Kasse, Grill"
                  value={newRoleTitle}
                  onChange={(e) => setNewRoleTitle(e.target.value)}
                  className="w-full rounded-field border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedMemberUserId && !customWho.trim()}
                onClick={addOrganizer}
              >
                <Plus className="size-3.5" /> Person hinzufügen
              </Button>
            </div>
          </div>
        </fieldset>
      )}


      <S
        id="eintragen"
        title="Eintragen & Fristen"
        description="Ab wann und wie lange sich Helfende selbst eintragen und austragen können."
      >
        {mode === 'edit' && (
          <Switch
            checked={form.allowPublicSignup}
            onChange={(v) => set('allowPublicSignup', v)}
            label="Helfende können sich selbst eintragen"
            description="Ausgeschaltet teilen nur noch das OK und die Abteilungsleitung Personen ein."
          />
        )}
        <div className={fieldColumns}>
        <Field
          label="Eintragen erst ab (optional)"
          hint={
            <span>
              Schweizer Zeit. Leer lassen = sofort offen. Mit Live-Countdown bei Restzeit.{' '}
              <a
                href={helpUrl('/ok/anlass-erstellen/#die-angaben')}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
              >
                <LifeBuoy className="size-3 inline" /> Hilfe
              </a>
            </span>
          }
        >
          <Input
            type="datetime-local"
            value={form.signupOpensAt}
            onChange={(e) => set('signupOpensAt', e.target.value)}
          />
        </Field>

        <Field
          label="Austrage-Sperre in Tagen vor Beginn (optional)"
          hint={
            <span>
              Ab so vielen Tagen vor Beginn können sich Helfende nicht mehr selbst austragen, nur noch das OK.{' '}
              <a
                href={helpUrl('/ok/anlass-erstellen/#die-angaben')}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
              >
                <LifeBuoy className="size-3 inline" /> Hilfe
              </a>
            </span>
          }
        >
          <Input
            type="number"
            min={0}
            max={365}
            placeholder="z. B. 2 (leer lassen = keine Sperre)"
            value={form.cancelDeadlineDays ?? ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              set('cancelDeadlineDays', val === '' ? null : Math.max(0, parseInt(val, 10) || 0));
            }}
          />
        </Field>
        </div>

        <Switch
          checked={form.allowReplacement}
          onChange={(v) => set('allowReplacement', v)}
          label="Helfende können «Ersatz suchen»"
          description="Wer nicht kann, bietet die Schicht an und bleibt eingetragen, bis jemand übernimmt. Geht auch nach der Austrage-Sperre."
        />
        <div className={fieldColumns}>
        {form.allowReplacement && (
          <Field
            label="Ersatz suchen und übernehmen bis"
            hint={
              <span>
                Danach hilft nur noch das OK.{' '}
                <a
                  href={helpUrl('/helfen/ersatz-suchen/')}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
                >
                  <LifeBuoy className="size-3 inline" /> Hilfe
                </a>
              </span>
            }
          >
            <Select
              value={form.replacementCutoffHours}
              onChange={(e) => set('replacementCutoffHours', Number(e.target.value))}
            >
              {REPLACEMENT_CUTOFF_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? 'Schichtbeginn' : `${h} ${h === 1 ? 'Stunde' : 'Stunden'} vor Schichtbeginn`}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Schicht-Überlappung für Übergaben"
          hint={
            <span>
              Erlaubt es Helfenden, sich für zwei aufeinanderfolgende Schichten einzutragen, die sich zur Einweisung/Übergabe kurz überschneiden.{' '}
              <a
                href={helpUrl('/ok/anlass-erstellen/#die-angaben')}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-accent-ink hover:underline inline-flex items-center gap-0.5"
              >
                <LifeBuoy className="size-3 inline" /> Hilfe
              </a>
            </span>
          }
        >
          <Select
            value={form.overlapToleranceMinutes ?? 15}
            onChange={(e) => set('overlapToleranceMinutes', Number(e.target.value))}
          >
            <option value={0}>0 Minuten (Strikte Trennung, keine Überlappung)</option>
            <option value={10}>10 Minuten</option>
            <option value={15}>15 Minuten (Empfohlen für Feste, Chilbi & Lager)</option>
            <option value={20}>20 Minuten</option>
            <option value={30}>30 Minuten</option>
          </Select>
        </Field>

        <Field
          label="Soll: Schichten pro Person (optional)"
          hint="Unter «Helfende» siehst du dann, wer das Soll erfüllt hat. Leer lassen = kein Soll."
        >
          <Input
            type="number"
            min={1}
            max={50}
            placeholder="z. B. 2 (leer lassen = kein Soll)"
            value={form.minShiftsPerPerson ?? ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              set('minShiftsPerPerson', val === '' ? null : Math.max(1, parseInt(val, 10) || 1));
            }}
          />
        </Field>
        </div>

        <Field
          label="Hinweis in der Schicht-Erinnerung (optional)"
          hint="Wird automatisch in jede Schicht-Erinnerungs-Mail und Browser-Benachrichtigung vor Schichtbeginn eingefügt (z. B. Treffpunkt, Helfer-Check-in oder Kleidung)."
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={form.reminderNote}
            placeholder="z. B. Wir treffen uns 10 Minuten vor Schichtbeginn beim Helfer-Check-in hinter dem Festzelt. Denk bitte an wetterfeste Kleidung und dein Cevi-Hemd."
            onChange={(e) => set('reminderNote', e.target.value)}
          />
        </Field>
      </S>

      <S id="zugang" title="Zugang & Angaben" description="Wer sich eintragen darf und was ihr von den Helfenden wissen müsst.">
        <EventAccessFields values={form.access} onChange={(access) => set('access', access)} />
      </S>

      <S
        id="zustaendigkeiten"
        title="Zuständigkeiten"
        description="Wer bei Fragen hilft und wie die Tage eingeteilt sind."
        summary={[
          contactName ? `Ansprechperson: ${contactName}` : 'Keine Ansprechperson',
          form.responsibleMode === 'BY_DAY' ? 'Verantwortliche pro Tag' : 'Verantwortliche pro Schicht',
          `Tageswechsel ${form.dayCutoffTime}`,
        ].join(' · ')}
      >
        <div className={fieldColumns}>
        <Field
          label="Ansprechperson für Fragen (optional)"
          hint="Sehen die Helfenden bei vollen Schichten, damit sie sich bei Fragen melden können."
        >
          <Select
            value={form.contactUserId || ''}
            onChange={(e) => set('contactUserId', e.target.value || null)}
          >
            <option value="">-- Keine Person ausgewählt --</option>
            {deptMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Verantwortliche"
          hint="Pro Schicht festlegen oder eine Tagesleitung für ganze Tage."
        >
          <Select
            value={form.responsibleMode}
            onChange={(e) => set('responsibleMode', e.target.value as 'BY_SHIFT' | 'BY_DAY')}
          >
            <option value="BY_SHIFT">Pro Schicht einzeln festlegen</option>
            <option value="BY_DAY">Pro Tag festlegen (gilt automatisch für alle Schichten des Tages)</option>
          </Select>
        </Field>

        <Field
          label="Tageswechsel-Uhrzeit"
          hint="Schichten vor dieser Uhrzeit zählen zum Vortag, z. B. 04:00, damit Nachtschichten zum Abend davor gehören."
        >
          <Input
            type="time"
            value={form.dayCutoffTime}
            onChange={(e) => set('dayCutoffTime', e.target.value)}
          />
        </Field>

        <Field
          label="Sichtbare Kontaktdaten"
          hint="Was die Helfenden von Ansprechperson, Tagesleitung und Schichtverantwortlichen sehen."
        >
          <Select
            value={form.contactVisibility}
            onChange={(e) => set('contactVisibility', e.target.value as EventContactVisibility)}
          >
            <option value="BOTH">Handynummer und E-Mail anzeigen</option>
            <option value="PHONE">Nur Handynummer anzeigen</option>
            <option value="EMAIL">Nur E-Mail anzeigen</option>
            <option value="NONE">Keine Kontaktdaten anzeigen (nur Name)</option>
          </Select>
        </Field>
        </div>
      </S>

      <S
        id="anwesenheit"
        title="Anwesenheit"
        description="Am Anlass abhaken, wer da war."
        summary={ATTENDANCE_MODES[form.attendanceMode]}
      >
        <Field
          label="Anwesenheitsliste"
          hint="Das OK hakt pro Schicht ab, wer da war. Mit QR-Code checken sich die Helfenden zusätzlich selbst ein (ab 30 Minuten vor Schichtbeginn bis Schichtende)."
        >
          <Select
            value={form.attendanceMode}
            onChange={(e) => set('attendanceMode', e.target.value as AttendanceMode)}
          >
            {(Object.keys(ATTENDANCE_MODES) as AttendanceMode[]).map((key) => (
              <option key={key} value={key}>
                {ATTENDANCE_MODES[key]}
              </option>
            ))}
          </Select>
        </Field>

      </S>

      <S
        id="design"
        title="Design"
        description="Banner und Logo auf der Seite des Anlasses."
        summary={`Banner: ${bannerName} · Logo: ${form.logoUrl ? 'Eigenes Bild' : 'Cevi-Logo'}`}
      >
        <fieldset className="space-y-5">
          <div>
            <legend className="mb-3 text-[13px] font-semibold text-fg">Banner des Anlasses</legend>
            <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', layout === 'page' && 'xl:grid-cols-6')}>
              {BANNER_PRESETS.map((preset) => {
                const selected = form.bannerUrl === preset.url;
                return (
                  <button
                    key={preset.url}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set('bannerUrl', preset.url)}
                    className={cn(
                      'group relative aspect-[16/10] overflow-hidden rounded-tile ring-2 ring-offset-2 ring-offset-surface transition',
                      selected ? 'ring-accent' : 'ring-transparent hover:ring-line-strong'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.url} alt={preset.name} className="size-full object-cover transition duration-500 group-hover:scale-105" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6 text-left text-xs font-semibold text-white">
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={fieldColumns}>
          {/* Eigenes Bannerbild hochladen (kein Pfad/URL eingeben) */}
          <ImageUpload
            label="Oder eigenes Bannerbild hochladen"
            hint="Breitbild empfohlen (max. 6 MB)"
            aspectRatio="banner"
            value={BANNER_PRESETS.some((p) => p.url === form.bannerUrl) ? null : form.bannerUrl}
            onChange={(url) => set('bannerUrl', url ?? BANNER_PRESETS[0].url)}
            showCeviFallback={false}
          />

          {/* Logo des Anlasses hochladen (kein Pfad/URL eingeben) */}
          <ImageUpload
            label="Logo des Anlasses"
            hint="Leer lassen für das Cevi-Logo"
            aspectRatio="square"
            value={form.logoUrl}
            onChange={(url) => set('logoUrl', url ?? '')}
            showCeviFallback={true}
          />
          </div>
        </fieldset>

      </S>

      {layout === 'page' ? (
        <div className="sticky bottom-20 z-10 flex min-h-[3.125rem] flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card border border-line-strong bg-surface/95 px-4 py-1.5 shadow-lift backdrop-blur md:bottom-4">
          <SaveStatus
            saving={saving || autoSaveStatus === 'saving'}
            dirty={isDirty}
            error={error}
            blocked={autoSaveBlocked}
            savedAt={lastSavedAt}
          />
          {(changedSinceOpen || needsManualSave) && (
            <div className="ml-auto flex items-center gap-2">
              {changedSinceOpen && (
                <Button size="sm" variant="ghost" onClick={undo} title="Alle Felder auf den Stand beim Öffnen der Seite zurücksetzen">
                  Rückgängig
                </Button>
              )}
              {needsManualSave && (
                <Button size="sm" type="submit" loading={saving}>
                  Speichern
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving}>
            {mode === 'create' ? 'Anlass erstellen' : 'Speichern'}
          </Button>
        </div>
      )}

      {/* 10s Countdown-Warnungs-Dialog bei Adressänderung */}
      {showSlugWarning && (
        <Dialog
          open={showSlugWarning}
          onClose={() => setShowSlugWarning(false)}
          size="md"
          icon={<AlertTriangle className="text-danger-ink" />}
          title="Achtung: Webadresse (Slug) ändern?"
        >
          <div className="space-y-4">
            <Callout tone="danger">
              <p className="font-semibold text-danger-ink">
                Alle versendeten Links werden ungültig!
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">
                Wenn du die Adresse von <strong className="text-fg font-mono">{initialSlug}</strong> zu{' '}
                <strong className="text-fg font-mono">{form.slug}</strong> änderst, funktionieren alle bereits versendeten
                Links (z.&nbsp;B. in WhatsApp-Gruppen, Einladungs-Mails, Flyern) sowie Lesezeichen sofort nicht mehr. Die Helfenden brauchen den neuen Link.
              </p>
            </Callout>

            <div className="rounded-card border border-line bg-surface-2 p-3 text-xs space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-fg-subtle">
                <span>Alte URL:</span>
                <span className="line-through text-danger-ink/80">…/events/{initialSlug}</span>
              </div>
              <div className="flex items-center justify-between font-semibold text-fg">
                <span>Neue URL:</span>
                <span className="text-accent-ink">…/events/{form.slug}</span>
              </div>
            </div>

            <div className="rounded-card border border-line bg-surface-1 p-3 text-center">
              <p className="text-xs text-fg-muted">
                {countdown > 0 ? (
                  <span>
                    Sicherheits-Countdown: Bestätigung erst in{' '}
                    <strong className="text-accent-ink text-sm tabular-nums">{countdown} Sekunden</strong>{' '}
                    möglich…
                  </span>
                ) : (
                  <span className="font-medium text-success-ink">
                    Countdown abgelaufen. Du kannst die Änderung jetzt bestätigen.
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowSlugWarning(false)}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                disabled={countdown > 0}
                loading={saving}
                onClick={async () => {
                  setShowSlugWarning(false);
                  await executeSave(form.slug);
                }}
                className={countdown === 0 ? 'bg-danger text-white hover:bg-danger-hover' : ''}
              >
                {countdown > 0 ? `Bitte warten (${countdown}s)` : 'Trotzdem ändern & speichern'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </form>
  );
}
