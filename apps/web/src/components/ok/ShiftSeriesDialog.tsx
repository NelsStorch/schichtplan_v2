'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  Clock,
  Layers,
  LifeBuoy,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  DEFAULT_SHIFT_CATEGORIES,
  calculateShiftSeriesIntervals,
  helpUrl,
  toZurichInput,
  zurichInputToIso,
  type TaskDefinitionDto,
} from '@schichtplan/shared';
import {
  Badge,
  Button,
  Callout,
  Dialog,
  Field,
  Input,
  cn,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtShortWeekday, fmtTimeRange } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

const DURATION_PRESETS = [
  { label: '1 Std.', minutes: 60 },
  { label: '1.5 Std.', minutes: 90 },
  { label: '2 Std.', minutes: 120 },
  { label: '2.5 Std.', minutes: 150 },
  { label: '3 Std.', minutes: 180 },
  { label: '4 Std.', minutes: 240 },
];

const OVERLAP_PRESETS = [
  { label: '0 Min. (keine)', minutes: 0 },
  { label: '10 Min.', minutes: 10 },
  { label: '15 Min.', minutes: 15 },
  { label: '20 Min.', minutes: 20 },
  { label: '30 Min.', minutes: 30 },
];

interface SeriesTaskItem {
  taskDefinitionId: string | null;
  title: string;
  requiredSlots: number;
  minAge: number | '';
  ageRequirementType: 'ALL' | 'AT_LEAST_ONE';
  description: string;
}

export function ShiftSeriesDialog({
  open,
  event,
  onClose,
  onCreated,
}: {
  open: boolean;
  event: EventDetails;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<TaskDefinitionDto[]>([]);

  // Default times: starting on event startDate at 10:00 until 22:00
  const defaultStart = useMemo(() => {
    const d = new Date(event.startDate);
    const datePart = toZurichInput(d).slice(0, 10);
    return `${datePart}T10:00`;
  }, [event.startDate]);

  const defaultEnd = useMemo(() => {
    const d = new Date(event.startDate);
    const datePart = toZurichInput(d).slice(0, 10);
    return `${datePart}T22:00`;
  }, [event.startDate]);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [isSetupTeardown, setIsSetupTeardown] = useState(false);
  const [description] = useState('');
  const [minAge, setMinAge] = useState<number | ''>('');

  const [tasks, setTasks] = useState<SeriesTaskItem[]>([
    {
      taskDefinitionId: null,
      title: '',
      requiredSlots: 1,
      minAge: '',
      ageRequirementType: 'ALL',
      description: '',
    },
  ]);

  const [startInput, setStartInput] = useState(defaultStart);
  const [endInput, setEndInput] = useState(defaultEnd);
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [overlapMinutes, setOverlapMinutes] = useState(15);
  const [firstShiftIncludesOverlap, setFirstShiftIncludesOverlap] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStartInput(defaultStart);
    setEndInput(defaultEnd);
    api<TaskDefinitionDto[]>('/api/tasks')
      .then((data) => setAvailableTasks(data))
      .catch(() => {});
  }, [open, defaultStart, defaultEnd]);

  const addFromCatalog = (catalogItem: TaskDefinitionDto) => {
    // Falls nur 1 Task vorhanden ist und dieser noch leer ist, direkt belegen
    if (tasks.length === 1 && !tasks[0].title.trim()) {
      setTasks([
        {
          taskDefinitionId: catalogItem.id,
          title: catalogItem.title,
          requiredSlots: 1,
          minAge: catalogItem.minAge ?? '',
          ageRequirementType: (catalogItem.ageRequirementType as 'ALL' | 'AT_LEAST_ONE') || 'ALL',
          description: catalogItem.description || '',
        },
      ]);
      return;
    }

    // Prüfen, ob die Arbeit schon in der Liste ist -> Plätze erhöhen
    const existingIdx = tasks.findIndex(
      (t) =>
        (t.taskDefinitionId && t.taskDefinitionId === catalogItem.id) ||
        t.title.toLowerCase() === catalogItem.title.toLowerCase()
    );

    if (existingIdx >= 0) {
      const nextSlots = tasks[existingIdx].requiredSlots + 1;
      updateTask(existingIdx, { requiredSlots: nextSlots });
      toast({ title: `${catalogItem.title}: Plätze auf ${nextSlots} erhöht` });
      return;
    }

    // Neue Arbeit anhängen
    setTasks((prev) => [
      ...prev,
      {
        taskDefinitionId: catalogItem.id,
        title: catalogItem.title,
        requiredSlots: 1,
        minAge: catalogItem.minAge ?? '',
        ageRequirementType: (catalogItem.ageRequirementType as 'ALL' | 'AT_LEAST_ONE') || 'ALL',
        description: catalogItem.description || '',
      },
    ]);
  };

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        taskDefinitionId: null,
        title: '',
        requiredSlots: 1,
        minAge: '',
        ageRequirementType: 'ALL',
        description: '',
      },
    ]);
  };

  const removeTask = (index: number) => {
    if (tasks.length <= 1) {
      setTasks([
        {
          taskDefinitionId: null,
          title: '',
          requiredSlots: 1,
          minAge: '',
          ageRequirementType: 'ALL',
          description: '',
        },
      ]);
      return;
    }
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, patch: Partial<SeriesTaskItem>) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const totalSlotsPerShift = useMemo(() => {
    return tasks.reduce((sum, t) => sum + (Number(t.requiredSlots) || 1), 0);
  }, [tasks]);

  // Live calculation of shift intervals
  const intervals = useMemo(() => {
    try {
      const startIso = zurichInputToIso(startInput);
      const endIso = zurichInputToIso(endInput);
      if (!startIso || !endIso) return [];
      return calculateShiftSeriesIntervals({
        startTime: startIso,
        endTime: endIso,
        durationMinutes,
        overlapMinutes,
        firstShiftIncludesOverlap,
      });
    } catch {
      return [];
    }
  }, [startInput, endInput, durationMinutes, overlapMinutes, firstShiftIncludesOverlap]);

  const totalOperatingHours = useMemo(() => {
    try {
      const startIso = zurichInputToIso(startInput);
      const endIso = zurichInputToIso(endInput);
      if (!startIso || !endIso) return 0;
      const start = new Date(startIso).getTime();
      const end = new Date(endIso).getTime();
      if (end <= start) return 0;
      return Math.round(((end - start) / (60 * 60 * 1000)) * 10) / 10;
    } catch {
      return 0;
    }
  }, [startInput, endInput]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const validTasks = tasks.filter((t) => t.title.trim().length > 0);

    if (!cleanTitle && validTasks.length === 0) {
      toast({
        tone: 'error',
        title: 'Titel oder Arbeit erforderlich',
        description: 'Bitte gib entweder einen Schichttitel oder mindestens eine Arbeit an.',
      });
      return;
    }

    for (const t of validTasks) {
      if (t.title.trim().length < 2) {
        toast({
          tone: 'error',
          title: 'Ungültige Arbeit',
          description: `Die Arbeit «${t.title}» muss mindestens 2 Zeichen lang sein.`,
        });
        return;
      }
    }

    const startIso = zurichInputToIso(startInput);
    const endIso = zurichInputToIso(endInput);
    if (!startIso || !endIso || intervals.length === 0) {
      toast({
        tone: 'error',
        title: 'Ungültiges Zeitraster',
        description: 'Aus dem gewählten Zeitraum konnten keine Schichten generiert werden.',
      });
      return;
    }

    // Wenn keine spezifischen Arbeiten definiert wurden, den Titel als 1 Standard-Arbeit verwenden
    const resolvedTasks =
      validTasks.length > 0
        ? validTasks.map((t) => ({
            taskDefinitionId: t.taskDefinitionId || null,
            title: t.title.trim(),
            description: t.description.trim() || null,
            requiredSlots: Math.max(1, Number(t.requiredSlots) || 1),
            minAge: t.minAge ? Number(t.minAge) : null,
            ageRequirementType: t.ageRequirementType,
          }))
        : [
            {
              taskDefinitionId: null,
              title: cleanTitle,
              description: description.trim() || null,
              requiredSlots: 1,
              minAge: minAge ? Number(minAge) : null,
              ageRequirementType: 'ALL' as const,
            },
          ];

    setSaving(true);
    try {
      await api<{ count: number }>('/api/shifts/series', {
        method: 'POST',
        json: {
          eventId: event.id,
          title: cleanTitle,
          category: category.trim() || null,
          isSetupTeardown,
          startTime: startIso,
          endTime: endIso,
          durationMinutes,
          overlapMinutes,
          firstShiftIncludesOverlap,
          description: description.trim() || null,
          minAge: minAge ? Number(minAge) : null,
          tasks: resolvedTasks,
        },
      });

      const totalSlotsAllShifts = intervals.length * totalSlotsPerShift;
      toast({
        tone: 'success',
        title: 'Schicht-Serie erstellt',
        description: cleanTitle
          ? `Es wurden ${intervals.length} Schichten für «${cleanTitle}» erstellt (${totalSlotsAllShifts} Plätze).`
          : `Es wurden ${intervals.length} Schichten erstellt (${totalSlotsAllShifts} Plätze).`,
      });
      onCreated();
      onClose();
    } catch (err) {
      toast({
        tone: 'error',
        title: 'Erstellen fehlgeschlagen',
        description: errorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const definedTasks = useMemo(() => tasks.filter((t) => t.title.trim().length > 0), [tasks]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Layers />}
      title="Schicht-Serie erstellen (Raster-Planung)"
      description={
        <span>
          Automatische Schicht-Generierung für Stände oder Arbeiten bei {event.title}.{' '}
          <a
            href={helpUrl('/ok/schichten-planen/#schichtserien-erstellen-raster-planung')}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
          >
            <LifeBuoy className="size-3.5 inline" /> Anleitung im Hilfe-Center
          </a>
        </span>
      }
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-fg-muted">
            {intervals.length > 0 ? (
              <span className="font-semibold text-fg">
                {intervals.length} Schichten · je {totalSlotsPerShift} {totalSlotsPerShift === 1 ? 'Platz' : 'Plätze'} ={' '}
                {intervals.length * totalSlotsPerShift} Plätze total
              </span>
            ) : (
              <span className="text-warning-ink">Keine Schichten generiert</span>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} type="button" disabled={saving}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              form="shift-series-form"
              loading={saving}
              disabled={intervals.length === 0}
            >
              <Sparkles className="size-4" />
              {intervals.length > 0 ? `${intervals.length} Schichten erstellen` : 'Erstellen'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="shift-series-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Stand / Schichttitel & Kategorie */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Stand / Schichttitel (optional)"
            hint="z. B. Grillstand, Kasse, Bar oder leer lassen, wenn nur die Arbeiten zählen"
          >
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Grillstand (optional)"
            />
          </Field>

          <Field label="Kategorie (optional)" hint="Zur Gruppierung nach Ressort/Stand">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="z. B. Stände, Küche"
              list="series-categories"
            />
          </Field>
          <datalist id="series-categories">
            {DEFAULT_SHIFT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </div>

        {/* Auf-/Abbau & Gesamtes Mindestalter */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSetupTeardown}
              onChange={(e) => setIsSetupTeardown(e.target.checked)}
              className="size-4 rounded border-line text-accent focus:ring-accent"
            />
            <span className="text-sm font-medium text-fg">Auf- oder Abbau-Schichten</span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted font-medium">Mindestalter für gesamte Schicht:</span>
            <Input
              type="number"
              min={0}
              max={99}
              value={minAge}
              onChange={(e) => setMinAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="Keins"
              className="w-24 text-xs h-8"
            />
          </div>
        </div>

        {/* Arbeiten (Tasks) Konfigurator */}
        <div className="rounded-xl border border-line bg-surface p-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-fg flex items-center gap-2">
                <Users className="size-4 text-accent" />
                Arbeiten &amp; Plätze pro Schicht
              </h4>
              <p className="text-xs text-fg-muted">
                Lege fest, welche Aufgaben und wie viele Personen pro Schicht eingeteilt werden ({totalSlotsPerShift}{' '}
                {totalSlotsPerShift === 1 ? 'Platz' : 'Plätze'} pro Schicht).
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={addTask}>
              <Plus className="size-3.5" /> Arbeit hinzufügen
            </Button>
          </div>

          {/* Schnell-Auswahl aus dem Vorlagen-Katalog */}
          {availableTasks.length > 0 && (
            <div className="rounded-lg border border-line/70 bg-surface-2/60 p-3">
              <span className="mb-2 block text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                Aus Arbeiten-Katalog hinzufügen:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableTasks.map((catItem) => {
                  const inList = tasks.some(
                    (t) =>
                      (t.taskDefinitionId && t.taskDefinitionId === catItem.id) ||
                      t.title.toLowerCase() === catItem.title.toLowerCase()
                  );
                  return (
                    <button
                      key={catItem.id}
                      type="button"
                      onClick={() => addFromCatalog(catItem)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition active:scale-95',
                        inList
                          ? 'border-accent/40 bg-accent/15 text-accent-ink hover:bg-accent/25'
                          : 'border-line/80 bg-surface text-fg hover:border-accent hover:bg-accent/10 hover:text-accent-ink'
                      )}
                    >
                      <Plus className="size-3 text-accent-ink" />
                      <span>{catItem.title}</span>
                      {catItem.minAge ? (
                        <span className="rounded bg-warning/20 px-1 py-0.2 text-[10px] font-bold text-warning-ink">
                          {catItem.minAge}+
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Liste der Arbeiten */}
          <div className="space-y-3">
            {tasks.map((task, idx) => (
              <div key={idx} className="relative rounded-lg border border-line bg-surface-2 p-3 text-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-fg-muted uppercase tracking-wider text-[11px]">
                    Arbeit #{idx + 1}
                  </span>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(idx)}
                      className="rounded-full p-1 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                      title="Arbeit entfernen"
                      aria-label="Arbeit entfernen"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <Field label="Name der Arbeit *" hint="z. B. Grillieren, Kasse, Springer">
                    <Input
                      value={task.title}
                      placeholder="z. B. Grillieren"
                      onChange={(e) => updateTask(idx, { title: e.target.value })}
                    />
                  </Field>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-semibold text-fg">Plätze</span>
                    <div className="flex h-10 items-center justify-between rounded-field border border-line bg-surface px-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        type="button"
                        aria-label="Weniger"
                        onClick={() => updateTask(idx, { requiredSlots: Math.max(1, task.requiredSlots - 1) })}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="tabular px-2 text-sm font-bold">{task.requiredSlots}</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        type="button"
                        aria-label="Mehr"
                        onClick={() => updateTask(idx, { requiredSlots: Math.min(50, task.requiredSlots + 1) })}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 w-24">
                    <span className="text-[12px] font-semibold text-fg">Mindestalter</span>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      value={task.minAge}
                      onChange={(e) =>
                        updateTask(idx, {
                          minAge: e.target.value === '' ? '' : parseInt(e.target.value, 10),
                        })
                      }
                      placeholder="Keins"
                      className="h-10 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Input
                    value={task.description}
                    onChange={(e) => updateTask(idx, { description: e.target.value })}
                    placeholder="Notiz oder Aufgabenbeschreibung für diese Arbeit (optional)"
                    className="text-xs h-8"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Zeitraum der Serie */}
        <div className="rounded-xl border border-line bg-surface p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-fg flex items-center gap-2">
              <CalendarDays className="size-4 text-accent" />
              Gesamter Betriebs-Zeitraum
            </h4>
            {totalOperatingHours > 0 && (
              <Badge tone="neutral">{totalOperatingHours} Stunden Gesamtdauer</Badge>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Betriebsbeginn *">
              <Input
                type="datetime-local"
                required
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
              />
            </Field>

            <Field label="Betriebsende *">
              <Input
                type="datetime-local"
                required
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
              />
            </Field>
          </div>

          {/* Schichtdauer */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                Schichtdauer pro Einsatz
              </label>
              <span className="text-xs font-medium text-fg">
                {durationMinutes} Minuten ({Math.round(durationMinutes / 6) / 10} Std.)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  type="button"
                  onClick={() => setDurationMinutes(preset.minutes)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold border transition',
                    durationMinutes === preset.minutes
                      ? 'border-accent bg-accent text-canvas'
                      : 'border-line bg-surface-elevated text-fg-muted hover:text-fg'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Übergabetoleranz / Überlappung */}
          <div className="space-y-1.5 pt-2 border-t border-line/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
                Übergabe-Überlappung
              </label>
              <span className="text-xs font-medium text-fg">
                {overlapMinutes === 0 ? 'Keine' : `${overlapMinutes} Min. Vorlauf`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {OVERLAP_PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  type="button"
                  onClick={() => setOverlapMinutes(preset.minutes)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold border transition',
                    overlapMinutes === preset.minutes
                      ? 'border-accent bg-accent text-canvas'
                      : 'border-line bg-surface-elevated text-fg-muted hover:text-fg'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {overlapMinutes > 0 && (
              <div className="pt-2 flex flex-col gap-2">
                <Callout tone="info">
                  Jede Ablösung beginnt <strong>{overlapMinutes} Minuten vor Ende der vorherigen Schicht</strong> für
                  die Übergabe.
                </Callout>

                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={firstShiftIncludesOverlap}
                    onChange={(e) => setFirstShiftIncludesOverlap(e.target.checked)}
                    className="size-3.5 rounded border-line text-accent focus:ring-accent"
                  />
                  <span>Auch 1. Schicht {overlapMinutes} Min. früher beginnen (z. B. für Standaufbau vor Öffnung)</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Live-Vorschau der generierten Schichten */}
        <div className="rounded-xl border border-line bg-surface-subtle p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
              <Clock className="size-3.5 text-accent" />
              Live-Vorschau ({intervals.length} Schichten)
            </span>
            {intervals.length > 0 && (
              <span className="text-xs text-fg-muted font-medium">
                {intervals.length * totalSlotsPerShift} Helfende benötigt
              </span>
            )}
          </div>

          {intervals.length === 0 ? (
            <div className="p-4 text-center text-xs text-fg-subtle border border-dashed border-line rounded-lg">
              Keine Schichten generiert. Bitte überprüfe Start- und Endzeit.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {intervals.map((shift, idx) => {
                const shiftDurationMin = Math.round(
                  (shift.endTime.getTime() - shift.startTime.getTime()) / (60 * 1000)
                );
                const hasOverlap = overlapMinutes > 0 && (idx > 0 || firstShiftIncludesOverlap);

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-line bg-surface p-2.5 text-xs gap-2"
                  >
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                      <span className="font-mono font-semibold text-fg-muted w-6 shrink-0">#{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-fg">
                            {fmtShortWeekday(shift.startTime.toISOString())}{' '}
                            {fmtTimeRange(shift.startTime.toISOString(), shift.endTime.toISOString())}
                          </span>
                          {title.trim() && (
                            <span className="text-xs text-accent-ink font-semibold">({title.trim()})</span>
                          )}
                        </div>

                        {/* Arbeiten Vorschau */}
                        <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px] text-fg-muted">
                          {definedTasks.length > 0 ? (
                            definedTasks.map((t, tIdx) => (
                              <span
                                key={tIdx}
                                className="rounded bg-surface-2 px-1.5 py-0.5 border border-line/60 font-medium text-fg"
                              >
                                {t.title} <span className="font-bold text-accent-ink">({t.requiredSlots})</span>
                                {t.minAge ? (
                                  <span className="text-warning-ink ml-1 font-bold">ab {t.minAge}</span>
                                ) : null}
                              </span>
                            ))
                          ) : (
                            <span className="text-fg-subtle italic">1 Platz ({title.trim() || 'Schicht'})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {hasOverlap && (
                        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-ink">
                          +{overlapMinutes}m Übergabe
                        </span>
                      )}
                      <span className="font-mono text-fg-subtle">
                        {Math.floor(shiftDurationMin / 60)}h{' '}
                        {shiftDurationMin % 60 > 0 ? `${shiftDurationMin % 60}m` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}
