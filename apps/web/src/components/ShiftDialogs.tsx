'use client';

import { useState, type FormEvent } from 'react';
import { Clock, Crown, Minus, Plus, Shield, Ticket, UserPlus } from 'lucide-react';
import type { ShiftDto } from '@schichtplan/shared';
import { DEFAULT_SHIFT_CATEGORIES } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, Textarea, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage, loginUrl } from '@/lib/api';
import { fmtDayMonth, fmtTime, fmtWeekday } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

/** ISO -> Wert für <input type="datetime-local"> in lokaler Zeit */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FormActions({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
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
  event,
  onClose,
  onSignedUp,
}: {
  shift: ShiftDto | null;
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
      {shift && <GuestSignupForm shift={shift} event={event} onCancel={onClose} onSignedUp={onSignedUp} />}
    </Dialog>
  );
}

function GuestSignupForm({
  shift,
  event,
  onCancel,
  onSignedUp,
}: {
  shift: ShiftDto;
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
        <p className="font-bold text-fg">{shift.title}</p>
        <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[13px] text-fg-muted">
          <Clock className="size-3.5" />
          {fmtWeekday(shift.startTime)}, {fmtDayMonth(shift.startTime)} · {fmtTime(shift.startTime)} bis{' '}
          {fmtTime(shift.endTime)}
        </p>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <Field label="Cevi-Name oder Vorname" required>
        <Input value={name} autoFocus autoComplete="nickname" placeholder="Dein Cevi-Name" onChange={(e) => setName(e.target.value)} />
      </Field>
      {event.requireEmailForGuests && (
        <Field label="E-Mail" required hint="Nur für Erinnerungen und Rückfragen des OK">
          <Input type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      {event.requirePhoneForGuests && (
        <Field label="Handynummer" required hint="Damit dich das OK kurzfristig erreicht">
          <Input type="tel" value={phone} autoComplete="tel" placeholder="+41 79 000 00 00" onChange={(e) => setPhone(e.target.value)} />
        </Field>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <a href={loginUrl()} className="text-center text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline">
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

/* ------------------------------------------------------ Schicht anlegen */

export function ShiftFormDialog({
  open,
  event,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Plus />}
      title="Neue Schicht"
      description={`Für ${event.title}`}
    >
      <ShiftForm event={event} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function ShiftForm({ event, onCancel, onSaved }: { event: EventDetails; onCancel: () => void; onSaved: () => void }) {
  const toast = useToast();
  const categories = Array.from(new Set([...DEFAULT_SHIFT_CATEGORIES, ...event.shifts.map((s) => s.category)]));
  const [form, setForm] = useState({
    title: '',
    category: categories[0] as string,
    startTime: toLocalInput(event.startDate),
    endTime: '',
    requiredSlots: 2,
    minAge: 0,
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/shifts', {
        method: 'POST',
        json: {
          eventId: event.id,
          title: form.title.trim(),
          category: form.category,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
          requiredSlots: form.requiredSlots,
          minAge: form.minAge || undefined,
          description: form.description.trim() || undefined,
        },
      });
      toast({ title: 'Schicht angelegt', description: form.title });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}
      <Field label="Titel" required>
        <Input value={form.title} autoFocus placeholder="Bar 1. Schicht" onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Beginn" required>
          <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
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

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-fg">Benötigte Helfer:innen</span>
          <div className="flex h-12 items-center justify-between rounded-field border border-line bg-surface-2 px-1.5">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Weniger"
              onClick={() => setForm({ ...form, requiredSlots: Math.max(1, form.requiredSlots - 1) })}
            >
              <Minus />
            </Button>
            <span className="tabular font-display text-xl font-bold" aria-live="polite">
              {form.requiredSlots}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Mehr"
              onClick={() => setForm({ ...form, requiredSlots: Math.min(50, form.requiredSlots + 1) })}
            >
              <Plus />
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-fg">Mindestalter</span>
          <div className="grid h-12 grid-cols-3 gap-1 rounded-field border border-line bg-surface-2 p-1">
            {[0, 16, 18].map((age) => (
              <button
                key={age}
                type="button"
                aria-pressed={form.minAge === age}
                onClick={() => setForm({ ...form, minAge: age })}
                className={cn(
                  'rounded-[0.6rem] text-sm font-semibold transition',
                  form.minAge === age ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg'
                )}
              >
                {age === 0 ? 'Keins' : `ab ${age}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Field label="Hinweise">
        <Textarea
          rows={2}
          value={form.description}
          placeholder="Bequeme Schuhe, Schürze wird gestellt …"
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>
      <FormActions onCancel={onCancel} saving={saving} label="Schicht anlegen" />
    </form>
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

function OrganizerForm({ eventSlug, onCancel, onSaved }: { eventSlug: string; onCancel: () => void; onSaved: () => void }) {
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
        <Input value={form.who} autoFocus placeholder="Cevi-Name oder E-Mail" onChange={(e) => setForm({ ...form, who: e.target.value })} />
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
        <Input value={form.roleTitle} placeholder="Bau & Grillchef" onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} />
      </Field>
      <FormActions onCancel={onCancel} saving={saving} label="Ins OK aufnehmen" />
    </form>
  );
}
