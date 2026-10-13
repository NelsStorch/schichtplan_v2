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
  UserCheck,
  UserPlus,
} from 'lucide-react';
import type { ShiftDto, ShiftTaskDto, AgeRequirementType } from '@schichtplan/shared';
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
import { api, errorMessage, loginUrl } from '@/lib/api';
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

/* ---------------------------------------------------- Gast-Eintragung */

export function GuestSignupDialog({
  shift,
  task,
  event,
  onClose,
  onSignedUp,
}: {
  shift: ShiftDto | null;
  task?: ShiftTaskDto | null;
  event: EventDetails;
  onClose: () => void;
  onSignedUp: (shift: ShiftDto) => void;
}) {
  return (
    <Dialog
      open={shift !== null}
      onClose={onClose}
      icon={<Ticket />}
      title="Für Schicht eintragen"
      description="Kein Passwort nötig. Dein Cevi-Name reicht."
    >
      {shift && (
        <GuestSignupForm
          shift={shift}
          task={task || null}
          event={event}
          onCancel={onClose}
          onSignedUp={onSignedUp}
        />
      )}
    </Dialog>
  );
}

function GuestSignupForm({
  shift,
  task,
  event,
  onCancel,
  onSignedUp,
}: {
  shift: ShiftDto;
  task: ShiftTaskDto | null;
  event: EventDetails;
  onCancel: () => void;
  onSignedUp: (shift: ShiftDto) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: {
          taskId: task?.id || undefined,
          guestName: name.trim(),
          guestEmail: email.trim() || undefined,
          guestPhone: phone.trim() || undefined,
        },
      });
      onSignedUp(shift);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-field bg-surface-2 p-4">
        <p className="font-bold text-fg">
          {shift.title}
          {task && <span className="font-normal text-fg-muted"> · {task.title}</span>}
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[13px] text-fg-muted">
          <Clock className="size-3.5" />
          {fmtWeekday(shift.startTime)}, {fmtDayMonth(shift.startTime)} · {fmtTime(shift.startTime)} bis{' '}
          {fmtTime(shift.endTime)}
        </p>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <Field label="Cevi-Name oder Vorname" required>
        <Input
          value={name}
          autoFocus
          autoComplete="nickname"
          placeholder="Dein Cevi-Name"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      {event.requireEmailForGuests && (
        <Field label="E-Mail" required hint="Nur für Erinnerungen und Rückfragen des OK">
          <Input type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      {event.requirePhoneForGuests && (
        <Field label="Handynummer" required hint="Damit dich das OK kurzfristig erreicht">
          <Input
            type="tel"
            value={phone}
            autoComplete="tel"
            placeholder="+41 79 000 00 00"
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <a
          href={loginUrl()}
          className="text-center text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Lieber mit Konto anmelden
        </a>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving} disabled={name.trim().length < 2}>
            Verbindlich eintragen
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------ Schicht anlegen / bearbeiten */

export interface TaskFormItem {
  id?: string;
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
  const categories = Array.from(new Set([...DEFAULT_SHIFT_CATEGORIES, ...event.shifts.map((s) => s.category)]));

  const [form, setForm] = useState({
    title: shift?.title || '',
    category: shift?.category || (categories[0] as string),
    startTime: shift ? toLocalInput(shift.startTime) : toLocalInput(event.startDate),
    endTime: shift ? toLocalInput(shift.endTime) : '',
    minAge: shift?.minAge || 0,
    description: shift?.description || '',
  });

  const [tasks, setTasks] = useState<TaskFormItem[]>(() => {
    if (shift?.tasks && shift.tasks.length > 0) {
      return shift.tasks.map((t) => ({
        id: t.id,
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
        category: form.category,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        requiredSlots: totalSlots,
        minAge: form.minAge || undefined,
        description: form.description.trim() || undefined,
        tasks: tasks.map((t) => ({
          id: t.id,
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Schichttitel" required>
          <Input
            value={form.title}
            autoFocus
            placeholder="z.B. Bar & Grill Samstagabend"
            onChange={(e) => handleTitleChange(e.target.value)}
          />
        </Field>

        <Field label="Kategorie" required>
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
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
      <div className="space-y-3 rounded-card border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-fg">Arbeiten in dieser Schicht</h4>
            <p className="text-xs text-fg-muted">
              Jede Arbeit definiert Aufgaben und Altersregeln ({totalSlots} Helfer:innen total).
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={addTask}>
            <Plus className="size-3.5" /> Arbeit
          </Button>
        </div>

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

export function AssignHelperDialog({
  open,
  shift,
  task,
  onClose,
  onAssigned,
}: {
  open: boolean;
  shift: ShiftDto | null;
  task: ShiftTaskDto | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  return (
    <Dialog
      open={open && shift !== null}
      onClose={onClose}
      icon={<UserCheck />}
      title="Helfer:in einteilen"
      description={shift ? `${shift.title} ${task ? `· ${task.title}` : ''}` : ''}
    >
      {shift && <AssignHelperForm shift={shift} task={task} onCancel={onClose} onAssigned={onAssigned} />}
    </Dialog>
  );
}

interface DeptMemberItem {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  ceviName?: string | null;
  displayName: string;
}

function AssignHelperForm({
  shift,
  task,
  onCancel,
  onAssigned,
}: {
  shift: ShiftDto;
  task: ShiftTaskDto | null;
  onCancel: () => void;
  onAssigned: () => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<DeptMemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [mode, setMode] = useState<'member' | 'guest'>('member');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<DeptMemberItem[]>('/api/departments/current/members')
      .then((data) => {
        if (active) {
          setMembers(data);
          if (data.length > 0) setSelectedUserId(data[0].userId);
        }
      })
      .catch(() => {
        // Fallback falls Fehler
      })
      .finally(() => {
        if (active) setLoadingMembers(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shifts/${shift.id}/signup`, {
        method: 'POST',
        json: {
          taskId: task?.id || undefined,
          userId: mode === 'member' ? selectedUserId : undefined,
          guestName: mode === 'guest' ? guestName.trim() : undefined,
          guestEmail: mode === 'guest' && guestEmail ? guestEmail.trim() : undefined,
          guestPhone: mode === 'guest' && guestPhone ? guestPhone.trim() : undefined,
        },
      });

      const assignedName =
        mode === 'member'
          ? members.find((m) => m.userId === selectedUserId)?.displayName || 'Helfer'
          : guestName;

      toast({
        title: `${assignedName} eingeteilt!`,
        description: `${shift.title} ${task ? `(${task.title})` : ''}`,
      });
      onAssigned();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Callout tone="danger">{error}</Callout>}

      <div className="grid grid-cols-2 gap-1 rounded-field border border-line bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => setMode('member')}
          className={cn(
            'rounded-[0.5rem] py-1.5 text-xs font-semibold transition',
            mode === 'member' ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
          )}
        >
          Abteilungsmitglied
        </button>
        <button
          type="button"
          onClick={() => setMode('guest')}
          className={cn(
            'rounded-[0.5rem] py-1.5 text-xs font-semibold transition',
            mode === 'guest' ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
          )}
        >
          Gast / freier Name
        </button>
      </div>

      {mode === 'member' ? (
        <Field label="Person auswählen" required hint="Wähle eine Person aus der Abteilung">
          {loadingMembers ? (
            <div className="h-10 animate-pulse rounded-field bg-surface-2" />
          ) : members.length === 0 ? (
            <p className="text-sm text-fg-muted">Keine Mitglieder gefunden.</p>
          ) : (
            <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <div className="space-y-3">
          <Field label="Name oder Cevi-Name" required>
            <Input
              value={guestName}
              autoFocus
              placeholder="z.B. Peter Meier / Schnägg"
              onChange={(e) => setGuestName(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-Mail (optional)">
              <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
            </Field>
            <Field label="Telefon (optional)">
              <Input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {task?.minAge ? (
        <div className="rounded-field border border-warning/30 bg-warning/10 p-3 text-xs text-warning-ink">
          <strong>Hinweis Mindestalter:</strong> Für &quot;{task.title}&quot; gilt ein Mindestalter von {task.minAge} Jahren ({task.ageRequirementType === 'ALL' ? 'alle Helfer' : 'mind. 1 in Schicht'}).
        </div>
      ) : null}

      <FormActions onCancel={onCancel} saving={saving} label="Einteilen" />
    </form>
  );
}

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
      <Field label="Cevi-Name oder E-Mail" required hint="Die Person braucht bereits ein Konto.">
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
