'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Info,
  Layers,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  DEFAULT_SHIFT_CATEGORIES,
  calculateShiftSeriesIntervals,
  toZurichInput,
  zurichInputToIso,
  type TaskDefinitionDto,
} from '@schichtplan/shared';
import {
  Badge,
  Button,
  Callout,
  Chip,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  cn,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtShortWeekday, fmtTime } from '@/lib/format';
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

  const [title, setTitle] = useState('Grill');
  const [category, setCategory] = useState('');
  const [isSetupTeardown, setIsSetupTeardown] = useState(false);
  const [description, setDescription] = useState('');
  const [minAge, setMinAge] = useState<number | ''>('');
  const [requiredSlots, setRequiredSlots] = useState(2);

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

  const handleSelectTaskDefinition = (taskId: string) => {
    const def = availableTasks.find((t) => t.id === taskId);
    if (!def) return;
    setTitle(def.title);
    if (def.description) setDescription(def.description);
    if (def.minAge) setMinAge(def.minAge);
  };

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
    if (!title.trim()) {
      toast({ tone: 'error', title: 'Titel erforderlich', description: 'Bitte gib einen Stand oder Titel an.' });
      return;
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

    setSaving(true);
    try {
      await api<{ count: number }>('/api/shifts/series', {
        method: 'POST',
        json: {
          eventId: event.id,
          title: title.trim(),
          category: category.trim() || null,
          isSetupTeardown,
          startTime: startIso,
          endTime: endIso,
          durationMinutes,
          overlapMinutes,
          firstShiftIncludesOverlap,
          description: description.trim() || null,
          minAge: minAge ? Number(minAge) : null,
          tasks: [
            {
              title: title.trim(),
              description: description.trim() || null,
              requiredSlots: Number(requiredSlots) || 1,
              minAge: minAge ? Number(minAge) : null,
              ageRequirementType: 'ALL' as const,
            },
          ],
        },
      });

      toast({
        tone: 'success',
        title: 'Schicht-Serie erstellt',
        description: `Es wurden ${intervals.length} Schichten für «${title.trim()}» erstellt.`,
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Layers />}
      title="Schicht-Serie erstellen (Raster-Planung)"
      description={`Automatische Schicht-Generierung für Stände oder Arbeiten bei ${event.title}`}
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-fg-muted">
            {intervals.length > 0 ? (
              <span className="font-semibold text-fg">
                {intervals.length} Schichten · {intervals.length * requiredSlots} Plätze
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
        {/* Vorlagen / Schnellauswahl aus Arbeiten-Katalog */}
        {availableTasks.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider block mb-1.5">
              Aus Arbeiten-Katalog übernehmen
            </label>
            <div className="flex flex-wrap gap-1.5">
              {availableTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleSelectTaskDefinition(task.id)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition',
                    title === task.title
                      ? 'border-accent bg-accent-soft text-accent-ink font-semibold'
                      : 'border-line bg-surface hover:bg-surface-elevated text-fg-muted'
                  )}
                >
                  {task.title}
                  {task.minAge ? <span className="text-[10px] opacity-75">ab {task.minAge}j</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stand / Titel & Plätze */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stand / Titel der Arbeit *" hint="z. B. Grill, Bar, Kasse, Fallbalken">
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Grill"
            />
          </Field>

          <Field label="Helfende pro Schicht (Plätze) *" hint="Wie viele Personen gleichzeitig helfen">
            <Input
              type="number"
              min={1}
              max={50}
              required
              value={requiredSlots}
              onChange={(e) => setRequiredSlots(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </Field>
        </div>

        {/* Kategorie & Mindestalter & Auf-/Abbau */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Field label="Kategorie" hint="Optional zur Gruppierung">
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

          <Field label="Mindestalter" hint="Optional, z. B. 16 für Bar">
            <Input
              type="number"
              min={0}
              max={99}
              value={minAge}
              onChange={(e) => setMinAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              placeholder="Keine Beschränkung"
            />
          </Field>

          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSetupTeardown}
                onChange={(e) => setIsSetupTeardown(e.target.checked)}
                className="size-4 rounded border-line text-accent focus:ring-accent"
              />
              <span className="text-sm font-medium text-fg">Auf- oder Abbau</span>
            </label>
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
              <Badge tone="neutral">
                {totalOperatingHours} Stunden Gesamtdauer
              </Badge>
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
              <span className="text-xs font-medium text-fg">{durationMinutes} Minuten ({Math.round(durationMinutes / 6) / 10} Std.)</span>
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
                  Jede Ablösung beginnt <strong>{overlapMinutes} Minuten vor Ende der vorherigen Schicht</strong> für die Übergabe.
                  Das Kollisions-Toleranzfenster des Anlasses erlaubt es Helfern, sich für aufeinanderfolgende Schichten einzutragen.
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
              <span className="text-xs text-fg-muted">
                {intervals.length * requiredSlots} Helfende benötigt
              </span>
            )}
          </div>

          {intervals.length === 0 ? (
            <div className="p-4 text-center text-xs text-fg-subtle border border-dashed border-line rounded-lg">
              Keine Schichten generiert. Bitte überprüfe Start- und Endzeit.
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {intervals.map((shift, idx) => {
                const shiftDurationMin = Math.round(
                  (shift.endTime.getTime() - shift.startTime.getTime()) / (60 * 1000)
                );
                const hasOverlap = overlapMinutes > 0 && (idx > 0 || firstShiftIncludesOverlap);

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-semibold text-fg-muted w-5">#{idx + 1}</span>
                      <div>
                        <span className="font-medium text-fg">
                          {fmtShortWeekday(shift.startTime.toISOString())} {fmtTime(shift.startTime.toISOString())} –{' '}
                          {fmtTime(shift.endTime.toISOString())}
                        </span>
                        <span className="text-[11px] text-fg-muted ml-2">({title})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
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
