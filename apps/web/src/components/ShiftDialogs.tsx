'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  Clock,
  Copy,
  Crown,
  Minus,
  Plus,
  Shield,
  Ticket,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { ShiftDto, ShiftTaskDto, TaskDefinitionDto, AgeRequirementType } from '@schichtplan/shared';
import { DEFAULT_SHIFT_CATEGORIES } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Dialog,
  Field,
  Input,
  Select,
  Textarea,
  cn,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtDayMonth, fmtTime, fmtWeekday } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

/** ISO -> Wert für <input type="datetime-local"> in lokaler Zeit */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FormActions({
  onCancel,
  saving,
  label,
}: {
  onCancel: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
      <Button variant="ghost" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button type="submit" loading={saving}>
        {label}
      </Button>
    </div>
  );
}

export interface DeptMemberItem {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  displayName: string;
}

/* ------------------------------------------------------ Schicht anlegen / bearbeiten */

export interface TaskFormItem {
  id?: string;
  taskDefinitionId?: string | null;
  title: string;
  requiredSlots: number;
  minAge: number;
  ageRequirementType: AgeRequirementType;
  description: string;
}

export function ShiftFormDialog({
  open,
  event,
  shift,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventDetails;
  shift?: ShiftDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(shift);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={isEdit ? <Clock /> : <Plus />}
      title={isEdit ? 'Schicht bearbeiten' : 'Neue Schicht'}
      description={`Für ${event.title}`}
    >
      <ShiftForm event={event} shift={shift} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function ShiftForm({
  event,
  shift,
  onCancel,
  onSaved,
}: {
  event: EventDetails;
  shift?: ShiftDto | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = Boolean(shift);

  const [availableTasks, setAvailableTasks] = useState<TaskDefinitionDto[]>([]);
  const [members, setMembers] = useState<DeptMemberItem[]>([]);
  const [responsibleUserIds, setResponsibleUserIds] = useState<string[]>(
    () => shift?.responsibles?.map((r) => r.id) || []
  );

  useEffect(() => {
    api<TaskDefinitionDto[]>('/api/tasks')
      .then((data) => setAvailableTasks(data))
      .catch(() => {});

    if (event.responsibleMode === 'BY_SHIFT') {
      api<DeptMemberItem[]>('/api/departments/current/members')
        .then((data) => setMembers(data))
        .catch(() => {});
    }
  }, [event.responsibleMode]);

  const [form, setForm] = useState({
    title: shift?.title || '',
    category: shift?.category || '',
    isSetupTeardown: shift?.isSetupTeardown ?? false,
    startTime: shift ? toLocalInput(shift.startTime) : toLocalInput(event.startDate),
    endTime: shift ? toLocalInput(shift.endTime) : '',
    minAge: shift?.minAge || 0,
    description: shift?.description || '',
  });

  const [tasks, setTasks] = useState<TaskFormItem[]>(() => {
    if (shift?.tasks && shift.tasks.length > 0) {
      return shift.tasks.map((t) => ({
        id: t.id,
        taskDefinitionId: t.taskDefinitionId || null,
        title: t.title,
        requiredSlots: t.requiredSlots,
        minAge: t.minAge || 0,
        ageRequirementType: t.ageRequirementType || 'ALL',
        description: t.description || '',
      }));
    }
    return [
      {
        title: shift?.title || 'Helfer*in',
        requiredSlots: shift?.requiredSlots || 2,
        minAge: shift?.minAge || 0,
        ageRequirementType: 'ALL',
        description: '',
      },
    ];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aktualisiere Task 0 wenn Schichttitel sich ändert und nur 1 Task vorhanden ist
  const handleTitleChange = (newTitle: string) => {
    setForm((prev) => ({ ...prev, title: newTitle }));
    if (!isEdit && tasks.length === 1 && (tasks[0].title === 'Helfer*in' || tasks[0].title === form.title)) {
      setTasks((prev) => [{ ...prev[0], title: newTitle }]);
    }
  };

  const addFromCatalog = (catalogItem: TaskDefinitionDto) => {
    // Falls nur 1 Task vorhanden ist und er noch leer/Standard ist, überschreiben
    if (tasks.length === 1 && (!tasks[0].title.trim() || tasks[0].title === 'Helfer*in')) {
      setTasks([
        {
          taskDefinitionId: catalogItem.id,
          title: catalogItem.title,
          requiredSlots: 1,
          minAge: catalogItem.minAge || 0,
          ageRequirementType: catalogItem.ageRequirementType || 'ALL',
          description: catalogItem.description || '',
        },
      ]);
      if (!form.title.trim()) {
        setForm((prev) => ({ ...prev, title: catalogItem.title }));
      }
      return;
    }

    // Prüfen ob diese Arbeit schon in der Schicht ist -> dann Slots erhöhen
    const existingIdx = tasks.findIndex(
      (t) => (t.taskDefinitionId && t.taskDefinitionId === catalogItem.id) || t.title.toLowerCase() === catalogItem.title.toLowerCase()
    );
    if (existingIdx >= 0) {
      updateTask(existingIdx, { requiredSlots: tasks[existingIdx].requiredSlots + 1 });
      toast({ title: `${catalogItem.title}: Plätze auf ${tasks[existingIdx].requiredSlots + 1} erhöht` });
      return;
    }

    // Ansonsten neue Arbeit hinzufügen
    setTasks((prev) => [
      ...prev,
      {
        taskDefinitionId: catalogItem.id,
        title: catalogItem.title,
        requiredSlots: 1,
        minAge: catalogItem.minAge || 0,
        ageRequirementType: catalogItem.ageRequirementType || 'ALL',
        description: catalogItem.description || '',
      },
    ]);
  };

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        title: '',
        requiredSlots: 1,
        minAge: 0,
        ageRequirementType: 'ALL',
        description: '',
      },
    ]);
  };

  const removeTask = (index: number) => {
    if (tasks.length <= 1) return;
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, patch: Partial<TaskFormItem>) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const totalSlots = tasks.reduce((sum, t) => sum + (t.requiredSlots || 1), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Validierung
    for (const t of tasks) {
      if (!t.title.trim()) {
        setError('Jede Arbeit muss einen Namen haben (z.B. Grill, Bar, Kasse).');
        setSaving(false);
        return;
      }
    }

    try {
      const payload = {
        title: form.title.trim(),
        category: form.category || undefined,
        isSetupTeardown: form.isSetupTeardown,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        requiredSlots: totalSlots,
        minAge: form.minAge || undefined,
        description: form.description.trim() || undefined,
        responsibleUserIds: event.responsibleMode === 'BY_SHIFT' ? responsibleUserIds : undefined,
        tasks: tasks.map((t) => ({
          id: t.id,
          taskDefinitionId: t.taskDefinitionId || undefined,
          title: t.title.trim(),
          requiredSlots: t.requiredSlots || 1,
          minAge: t.minAge || undefined,
          ageRequirementType: t.ageRequirementType,
          description: t.description?.trim() || undefined,
        })),
      };

      if (isEdit && shift) {
        await api(`/api/shifts/${shift.id}`, {
          method: 'PATCH',
          json: payload,
        });
        toast({ title: 'Schicht aktualisiert', description: form.title });
      } else {
        await api('/api/shifts', {
          method: 'POST',
          json: {
            ...payload,
            eventId: event.id,
          },
        });
        toast({ title: 'Schicht angelegt', description: form.title });
      }

      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}

      <Field label="Schichttitel" required>
        <Input
          value={form.title}
          autoFocus
          placeholder="z.B. Bar & Grill Samstagabend"
          onChange={(e) => handleTitleChange(e.target.value)}
        />
      </Field>

      {/* Eigenschaften der Schicht */}
      <div className="rounded-field border border-line bg-surface-2 p-3.5">
        <label className="flex cursor-pointer items-start gap-3 select-none">
          <input
            type="checkbox"
            checked={form.isSetupTeardown}
            onChange={(e) => setForm({ ...form, isSetupTeardown: e.target.checked })}
            className="mt-0.5 size-4 rounded border-line text-accent focus:ring-accent"
          />
          <div className="space-y-0.5">
            <span className="text-sm font-bold text-fg flex items-center gap-1.5">
              🛠️ Aufbau- / Abbau-Schicht
            </span>
            <p className="text-xs text-fg-muted">
              Kennzeichnet diese Schicht speziell als Auf- oder Abbauarbeit für gezielte Helfer-Filter.
            </p>
          </div>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Beginn" required>
          <Input
            type="datetime-local"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          />
        </Field>
        <Field label="Ende" required>
          <Input
            type="datetime-local"
            value={form.endTime}
            min={form.startTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          />
        </Field>
      </div>

      {/* Mindestalter für die gesamte Schicht */}
      <div className="flex flex-col gap-1.5 rounded-field border border-line bg-surface-2 p-3">
        <span className="text-[13px] font-semibold text-fg">Mindestalter für die gesamte Schicht</span>
        <p className="text-xs text-fg-muted">
          Gilt übergreifend für alle Helfer:innen dieser Schicht (z.B. Nachtschicht ab 18).
        </p>
        <div className="mt-2 grid h-10 grid-cols-4 gap-1">
          {[0, 14, 16, 18].map((age) => (
            <button
              key={age}
              type="button"
              onClick={() => setForm({ ...form, minAge: age })}
              className={cn(
                'rounded-[0.5rem] text-xs font-semibold transition',
                form.minAge === age ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
              )}
            >
              {age === 0 ? 'Keins' : `ab ${age}`}
            </button>
          ))}
        </div>
      </div>

      {/* Arbeiten (Tasks) Konfigurator */}
      <div className="space-y-4 rounded-card border border-line bg-surface p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-fg">Arbeiten in dieser Schicht</h4>
            <p className="text-xs text-fg-muted">
              Wähle Arbeiten aus dem Katalog oder trage neue ein ({totalSlots} Helfer:innen total).
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={addTask}>
            <Plus className="size-3.5" /> Neue Arbeit
          </Button>
        </div>

        {/* Schnell-Auswahl aus dem Vorlagen-Katalog */}
        {availableTasks.length > 0 && (
          <div className="rounded-field border border-line/70 bg-surface-2/60 p-3">
            <span className="mb-2 block text-2xs font-bold uppercase tracking-wider text-fg-subtle">
              Katalog-Arbeiten schnell hinzufügen:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableTasks.map((at) => {
                const inShift = tasks.some(
                  (t) => (t.taskDefinitionId && t.taskDefinitionId === at.id) || t.title.toLowerCase() === at.title.toLowerCase()
                );
                return (
                  <button
                    key={at.id}
                    type="button"
                    onClick={() => addFromCatalog(at)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition active:scale-95',
                      inShift
                        ? 'border-accent/40 bg-accent/15 text-accent-ink hover:bg-accent/25'
                        : 'border-line/80 bg-surface text-fg hover:border-accent hover:bg-accent/10 hover:text-accent-ink'
                    )}
                  >
                    <Plus className="size-3 text-accent-ink" />
                    <span>{at.title}</span>
                    {at.minAge && (
                      <span className="rounded bg-warning/20 px-1 py-0.2 text-[10px] font-bold text-warning-ink">
                        {at.minAge}+
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {tasks.map((task, idx) => (
            <div key={idx} className="relative rounded-field border border-line bg-surface-2 p-3.5">
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTask(idx)}
                  className="absolute right-2 top-2 rounded-full p-1 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                  aria-label="Arbeit entfernen"
                >
                  <Trash2 className="size-4" />
                </button>
              )}

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label={`Arbeit #${idx + 1}`} required>
                  <Input
                    value={task.title}
                    placeholder="z.B. Grill, Bar, Kasse, Aufbau"
                    onChange={(e) => updateTask(idx, { title: e.target.value })}
                  />
                </Field>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-fg">Plätze</span>
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
                      onClick={() => updateTask(idx, { requiredSlots: Math.min(20, task.requiredSlots + 1) })}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Altersrichtlinien für diese Arbeit */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-fg">Mindestalter für diese Arbeit</span>
                  <div className="grid h-9 grid-cols-4 gap-1 rounded-field border border-line bg-surface p-0.5">
                    {[0, 14, 16, 18].map((age) => (
                      <button
                        key={age}
                        type="button"
                        onClick={() => updateTask(idx, { minAge: age })}
                        className={cn(
                          'rounded-[0.4rem] text-xs font-semibold transition',
                          task.minAge === age ? 'bg-surface-2 text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
                        )}
                      >
                        {age === 0 ? 'Keins' : `ab ${age}`}
                      </button>
                    ))}
                  </div>
                </div>

                {task.minAge > 0 && (
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-fg">Alters-Anforderung</span>
                    <div className="grid h-9 grid-cols-2 gap-1 rounded-field border border-line bg-surface p-0.5">
                      <button
                        type="button"
                        onClick={() => updateTask(idx, { ageRequirementType: 'ALL' })}
                        className={cn(
                          'rounded-[0.4rem] text-xs font-semibold transition',
                          task.ageRequirementType === 'ALL'
                            ? 'bg-accent/15 text-accent-ink font-bold'
                            : 'text-fg-muted hover:text-fg'
                        )}
                        title="Jeder Helfer bei dieser Arbeit muss mindestens das Alter haben"
                      >
                        Alle Helfer
                      </button>
                      <button
                        type="button"
                        onClick={() => updateTask(idx, { ageRequirementType: 'AT_LEAST_ONE' })}
                        className={cn(
                          'rounded-[0.4rem] text-xs font-semibold transition',
                          task.ageRequirementType === 'AT_LEAST_ONE'
                            ? 'bg-accent/15 text-accent-ink font-bold'
                            : 'text-fg-muted hover:text-fg'
                        )}
                        title="Mindestens 1 Person in der Schicht muss das Alter haben (z.B. Baraufsicht)"
                      >
                        Mind. 1 in Schicht
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {event.responsibleMode === 'BY_SHIFT' ? (
        <div className="space-y-3 rounded-card border border-line bg-surface p-4">
          <div>
            <h4 className="text-sm font-bold text-fg">Schicht-Verantwortliche</h4>
            <p className="text-xs text-fg-muted">
              Diese Person(en) leiten die Schicht (z. B. Standleitung, Grillchef) und werden auf den Schichtkarten als Ansprechpersonen aufgeführt.
            </p>
          </div>

          {responsibleUserIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {responsibleUserIds.map((userId) => {
                const member = members.find((m) => m.userId === userId);
                const shiftResp = shift?.responsibles?.find((r) => r.id === userId);
                const name = member?.displayName || shiftResp?.displayName || 'Verantwortliche Person';
                return (
                  <Badge key={userId} tone="neutral" size="md" className="flex items-center gap-1.5 py-1">
                    <span>{name}</span>
                    <button
                      type="button"
                      onClick={() => setResponsibleUserIds((prev) => prev.filter((id) => id !== userId))}
                      className="ml-1 rounded p-0.5 hover:bg-fg/10 text-fg-muted hover:text-fg"
                      title="Entfernen"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (val && !responsibleUserIds.includes(val)) {
                  setResponsibleUserIds((prev) => [...prev, val]);
                }
              }}
            >
              <option value="">+ Person als Schicht-Verantwortliche(n) hinzufügen…</option>
              {members
                .filter((m) => !responsibleUserIds.includes(m.userId))
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
            </Select>
          </div>
        </div>
      ) : (
        <Callout tone="info">
          <strong>Tages-Verantwortliche aktiv:</strong> Für diesen Anlass werden Verantwortliche pro Tag festgelegt. Alle Schichten an diesem Tag übernehmen automatisch die Tages-Verantwortlichen.
        </Callout>
      )}

      <Field label="Hinweise / Beschreibung">
        <Textarea
          rows={2}
          value={form.description}
          placeholder="Bequeme Schuhe, Schürze wird gestellt …"
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>

      <FormActions onCancel={onCancel} saving={saving} label={isEdit ? 'Änderungen speichern' : 'Schicht anlegen'} />
    </form>
  );
}

/* ---------------------------------------------------- Helfer durch OK einteilen */

export { AssignHelperDialog } from './AssignHelperDialog';

/* ---------------------------------------------------- Schicht duplizieren */

export function DuplicateShiftDialog({
  open,
  shift,
  onClose,
  onDuplicated,
}: {
  open: boolean;
  shift: ShiftDto | null;
  onClose: () => void;
  onDuplicated: () => void;
}) {
  return (
    <Dialog
      open={open && shift !== null}
      onClose={onClose}
      icon={<Copy />}
      title="Schicht duplizieren"
      description={shift ? `Kopie von "${shift.title}" erstellen` : ''}
    >
      {shift && <DuplicateShiftForm shift={shift} onCancel={onClose} onDuplicated={onDuplicated} />}
    </Dialog>
  );
}

function DuplicateShiftForm({
  shift,
  onCancel,
  onDuplicated,
}: {
  shift: ShiftDto;
  onCancel: () => void;
  onDuplicated: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(`${shift.title} (Folgeschicht)`);
  const [startTime, setStartTime] = useState(toLocalInput(shift.endTime)); // Standard: schliesst direkt an vorherige Schicht an!

  // Dauer der vorherigen Schicht berechnen
  const prevDurationMs = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
  const nextEndTime = new Date(new Date(shift.endTime).getTime() + prevDurationMs).toISOString();

  const [endTime, setEndTime] = useState(toLocalInput(nextEndTime));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shifts/${shift.id}/duplicate`, {
        method: 'POST',
        json: {
          title: title.trim(),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        },
      });
      toast({ title: 'Schicht dupliziert', description: title });
      onDuplicated();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Callout tone="danger">{error}</Callout>}

      <Field label="Titel der neuen Schicht" required>
        <Input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Beginn" required>
          <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Ende" required>
          <Input
            type="datetime-local"
            value={endTime}
            min={startTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
      </div>

      <p className="text-xs text-fg-muted">
        Alle Arbeiten ({shift.tasks?.length || 1} Aufgaben) und Plätze werden 1:1 kopiert. Die bisherigen Helfer-Eintragungen werden zurückgesetzt.
      </p>

      <FormActions onCancel={onCancel} saving={saving} label="Duplizieren" />
    </form>
  );
}

/* ---------------------------------------------------- Event als Vorlage speichern */

export function SaveTemplateDialog({
  open,
  eventSlug,
  defaultTitle,
  onClose,
  onSaved,
}: {
  open: boolean;
  eventSlug: string;
  defaultTitle: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(`${defaultTitle} (Vorlage)`);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${eventSlug}/save-as-template`, {
        method: 'POST',
        json: {
          title: title.trim(),
          description: description.trim() || undefined,
        },
      });
      toast({
        title: 'Vorlage gespeichert!',
        description: 'Kann künftig beim Erstellen neuer Events als Blueprint gewählt werden.',
      });
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
      icon={<Copy />}
      title="Als Event-Vorlage speichern"
      description="Speichert die gesamte Schicht- und Arbeitsstruktur relativ ab, um sie nächstes Jahr auf neue Daten anzuwenden."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <Field label="Name der Vorlage" required>
          <Input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Beschreibung / Notizen für kommende Jahre">
          <Textarea
            rows={3}
            value={description}
            placeholder="z.B. Standard 3-Tage-Chilbi mit Bar, Grill und Springer..."
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <FormActions onCancel={onClose} saving={saving} label="Vorlage anlegen" />
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------- OK-Mitglied ernennen */

export function OrganizerDialog({
  open,
  eventSlug,
  onClose,
  onSaved,
}: {
  open: boolean;
  eventSlug: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<UserPlus />}
      title="Ins OK aufnehmen"
      description="OK-Mitglieder planen Schichten und teilen Helfer:innen ein, ohne Abteilungs-Admin zu sein."
    >
      <OrganizerForm eventSlug={eventSlug} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function OrganizerForm({
  eventSlug,
  onCancel,
  onSaved,
}: {
  eventSlug: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ who: '', role: 'OK_MEMBER' as 'OK_LEAD' | 'OK_MEMBER', roleTitle: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const who = form.who.trim();
    try {
      await api(`/api/events/${eventSlug}/organizers`, {
        method: 'POST',
        json: {
          ...(who.includes('@') ? { email: who } : { ceviName: who }),
          role: form.role,
          roleTitle: form.roleTitle.trim() || undefined,
        },
      });
      toast({ title: `${who} ist jetzt im OK` });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const roles = [
    { value: 'OK_LEAD' as const, label: 'OK-Leitung', text: 'Design, Einstellungen und OK verwalten', icon: Crown },
    { value: 'OK_MEMBER' as const, label: 'OK-Mitglied', text: 'Schichten planen und Helfer:innen einteilen', icon: Shield },
  ];

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}
      <Field
        label="Cevi-Name oder E-Mail"
        required
        hint="Die Person braucht ein Konto mit Cevi.DB oder mit E-Mail und Passwort. Bei gleichen Cevi-Namen die E-Mail angeben."
      >
        <Input
          value={form.who}
          autoFocus
          placeholder="Cevi-Name oder E-Mail"
          onChange={(e) => setForm({ ...form, who: e.target.value })}
        />
      </Field>
      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold text-fg">Rolle</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {roles.map((r) => {
            const Icon = r.icon;
            const selected = form.role === r.value;
            return (
              <label
                key={r.value}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-field border p-4 transition-colors',
                  selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  className="sr-only"
                  checked={selected}
                  onChange={() => setForm({ ...form, role: r.value })}
                />
                <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-accent-ink' : 'text-fg-subtle')} />
                <span>
                  <span className="block text-sm font-semibold text-fg">{r.label}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{r.text}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Field label="Ressort / Funktion">
        <Input
          value={form.roleTitle}
          placeholder="Bau & Grillchef"
          onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
        />
      </Field>
      <FormActions onCancel={onCancel} saving={saving} label="Ins OK aufnehmen" />
    </form>
  );
}

/* ------------------------------------------------------ Tages-Verantwortliche bearbeiten */

export function DayResponsiblesDialog({
  open,
  event,
  dayDate,
  dayLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventDetails;
  dayDate: string;
  dayLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<DeptMemberItem[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      api<DeptMemberItem[]>('/api/departments/current/members')
        .then(setMembers)
        .catch(() => {});
      const existing = (event.dayResponsibles?.[dayDate] ?? []).map((r) => r.id);
      setSelectedUserIds(existing);
    }
  }, [open, event, dayDate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/events/${event.slug}/days/${dayDate}/responsibles`, {
        method: 'PUT',
        json: { userIds: selectedUserIds },
      });
      toast({
        title: 'Tages-Verantwortliche gespeichert',
        description: `Für ${dayLabel} hinterlegt.`,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Shield />}
      title="Tages-Verantwortliche"
      description={`Verantwortliche Personen für ${dayLabel}`}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger">{error}</Callout>}

        <p className="text-xs text-fg-muted">
          Die gewählten Personen gelten als Hauptansprechpersonen für alle Schichten an diesem Tag und werden im Schichtplan und bei den Schichten aufgeführt.
        </p>

        {selectedUserIds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedUserIds.map((userId) => {
              const member = members.find((m) => m.userId === userId);
              const existingResp = event.dayResponsibles?.[dayDate]?.find((r) => r.id === userId);
              const name = member?.displayName || existingResp?.displayName || 'Verantwortliche Person';
              return (
                <Badge key={userId} tone="neutral" size="md" className="flex items-center gap-1.5 py-1">
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedUserIds((prev) => prev.filter((id) => id !== userId))}
                    className="ml-1 rounded p-0.5 hover:bg-fg/10 text-fg-muted hover:text-fg"
                    title="Entfernen"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}

        <Field label="Person hinzufügen">
          <Select
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val && !selectedUserIds.includes(val)) {
                setSelectedUserIds((prev) => [...prev, val]);
              }
            }}
          >
            <option value="">-- Person aus Mitgliedern wählen --</option>
            {members
              .filter((m) => !selectedUserIds.includes(m.userId))
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
          </Select>
        </Field>

        <FormActions onCancel={onClose} saving={saving} label="Speichern" />
      </form>
    </Dialog>
  );
}
