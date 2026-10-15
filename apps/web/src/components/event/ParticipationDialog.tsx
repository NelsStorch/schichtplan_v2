'use client';

import { useState, type FormEvent } from 'react';
import { ClipboardList } from 'lucide-react';
import {
  PLACEHOLDER_LAST_NAME,
  REQUIRED_PROFILE_FIELDS,
  type EventQuestionDto,
  type RequiredProfileField,
} from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, Textarea, cn } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';

/**
 * Fragt beim Eintragen ab, was das OK braucht:
 * - fehlende Pflichtangaben (im Konto gespeichert, gelten auch für andere Anlässe)
 * - Fragen «einmal pro Anlass» (beim ersten Eintragen bzw. wenn eine Pflichtfrage fehlt)
 * - Fragen «bei jeder Eintragung» (jedes Mal neu, Antwort gehört zur Schicht)
 * `onSaved` bekommt die Antworten pro Eintragung, die mit der Eintragung mitgeschickt werden.
 */
export function ParticipationDialog({
  open,
  event,
  showOnceQuestions,
  shiftLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  event: EventDetails;
  showOnceQuestions: boolean;
  /** Schicht, für die gerade eingetragen wird (für die Fragen pro Eintragung) */
  shiftLabel?: string;
  onClose: () => void;
  onSaved: (signupAnswers: Record<string, string>) => void;
}) {
  const hasOnceStuff = event.viewer.missingFields.length > 0 || showOnceQuestions;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<ClipboardList />}
      title={hasOnceStuff ? 'Noch ein paar Angaben' : 'Angaben zur Eintragung'}
      description={
        hasOnceStuff
          ? `Das OK von «${event.title}» braucht diese Angaben von dir.`
          : shiftLabel
            ? `Für ${shiftLabel}`
            : undefined
      }
    >
      <ParticipationForm
        event={event}
        showOnceQuestions={showOnceQuestions}
        shiftLabel={shiftLabel}
        onCancel={onClose}
        onSaved={onSaved}
      />
    </Dialog>
  );
}

function ParticipationForm({
  event,
  showOnceQuestions,
  shiftLabel,
  onCancel,
  onSaved,
}: {
  event: EventDetails;
  showOnceQuestions: boolean;
  shiftLabel?: string;
  onCancel: () => void;
  onSaved: (signupAnswers: Record<string, string>) => void;
}) {
  const { user, refresh } = usePortal();
  const missing = new Set<RequiredProfileField>(event.viewer.missingFields);
  const onceQuestions = showOnceQuestions ? event.questions.filter((q) => q.scope !== 'PER_SIGNUP') : [];
  const signupQuestions = event.questions.filter((q) => q.scope === 'PER_SIGNUP');
  // Bereits gegebene Antworten vorausfüllen (nur einmalige; pro Eintragung startet leer)
  const [answers, setAnswers] = useState<Record<string, string>>({ ...event.viewer.answers });
  const [profile, setProfile] = useState({
    firstName: user?.firstName && user.lastName !== PLACEHOLDER_LAST_NAME ? user.firstName : '',
    lastName: user?.lastName && user.lastName !== PLACEHOLDER_LAST_NAME ? user.lastName : '',
    phone: user?.phone ?? '',
    email: '',
    birthDate: user?.birthDate ?? '',
    address: user?.address ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: keyof typeof profile, value: string) => setProfile((p) => ({ ...p, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const profilePayload: Record<string, string> = {};
    if (missing.has('FULL_NAME')) {
      profilePayload.firstName = profile.firstName.trim();
      profilePayload.lastName = profile.lastName.trim();
    }
    if (missing.has('PHONE')) profilePayload.phone = profile.phone.trim();
    if (missing.has('EMAIL')) profilePayload.email = profile.email.trim();
    if (missing.has('BIRTH_DATE')) profilePayload.birthDate = profile.birthDate;
    if (missing.has('ADDRESS')) profilePayload.address = profile.address.trim();

    try {
      if (Object.keys(profilePayload).length || onceQuestions.length) {
        await api(`/api/events/${event.slug}/participation`, {
          method: 'PUT',
          json: {
            profile: Object.keys(profilePayload).length ? profilePayload : undefined,
            answers: Object.fromEntries(onceQuestions.map((q) => [q.id, (answers[q.id] ?? '').trim()])),
          },
        });
      }
      if (Object.keys(profilePayload).length) await refresh();
      onSaved(
        Object.fromEntries(
          signupQuestions.map((q) => [q.id, (answers[q.id] ?? '').trim()]).filter(([, v]) => v)
        )
      );
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  const renderQuestion = (q: EventQuestionDto) => {
    const value = answers[q.id] ?? '';
    const set = (v: string) => setAnswers((a) => ({ ...a, [q.id]: v }));
    return (
      <Field key={q.id} label={q.label} required={q.required}>
        {q.type === 'YES_NO' ? (
          <div role="radiogroup" aria-label={q.label} className="flex gap-2">
            {[
              { v: 'JA', label: 'Ja' },
              { v: 'NEIN', label: 'Nein' },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={value === o.v}
                onClick={() => set(value === o.v && !q.required ? '' : o.v)}
                className={cn(
                  'h-11 flex-1 rounded-field border text-sm font-semibold transition',
                  value === o.v ? 'border-accent bg-accent/12 text-accent-ink' : 'border-line text-fg-muted'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : q.type === 'CHOICE' ? (
          <Select value={value} onChange={(e) => set(e.target.value)} required={q.required}>
            <option value="">Bitte wählen</option>
            {q.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        ) : (
          <Textarea rows={2} value={value} onChange={(e) => set(e.target.value)} required={q.required} />
        )}
      </Field>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Callout tone="danger">{error}</Callout>}

      {missing.has('FULL_NAME') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname" required>
            <Input
              value={profile.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
              autoComplete="given-name"
              required
              minLength={2}
            />
          </Field>
          <Field label="Nachname" required>
            <Input
              value={profile.lastName}
              onChange={(e) => setField('lastName', e.target.value)}
              autoComplete="family-name"
              required
              minLength={2}
            />
          </Field>
        </div>
      )}
      {missing.has('PHONE') && (
        <Field label={REQUIRED_PROFILE_FIELDS.PHONE.label} required hint="Damit dich das OK kurzfristig erreicht.">
          <Input
            type="tel"
            value={profile.phone}
            onChange={(e) => setField('phone', e.target.value)}
            autoComplete="tel"
            placeholder="+41 79 000 00 00"
            required
          />
        </Field>
      )}
      {missing.has('EMAIL') && (
        <Field label={REQUIRED_PROFILE_FIELDS.EMAIL.label} required>
          <Input
            type="email"
            value={profile.email}
            onChange={(e) => setField('email', e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
      )}
      {missing.has('BIRTH_DATE') && (
        <Field label={REQUIRED_PROFILE_FIELDS.BIRTH_DATE.label} required>
          <Input
            type="date"
            value={profile.birthDate}
            onChange={(e) => setField('birthDate', e.target.value)}
            autoComplete="bday"
            required
          />
        </Field>
      )}
      {missing.has('ADDRESS') && (
        <Field label={REQUIRED_PROFILE_FIELDS.ADDRESS.label} required hint="Strasse, PLZ und Ort">
          <Input
            value={profile.address}
            onChange={(e) => setField('address', e.target.value)}
            autoComplete="street-address"
            placeholder="Dorfstrasse 1, 8307 Effretikon"
            required
            minLength={5}
          />
        </Field>
      )}

      {onceQuestions.length > 0 && missing.size > 0 && <hr className="border-line" />}
      {onceQuestions.map(renderQuestion)}

      {signupQuestions.length > 0 && (
        <div className="space-y-5 rounded-field border border-line bg-surface-2/60 p-4">
          <p className="text-xs font-semibold text-fg-subtle">
            Zu dieser Eintragung{shiftLabel ? ` (${shiftLabel})` : ''}
          </p>
          {signupQuestions.map(renderQuestion)}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={[...onceQuestions, ...signupQuestions].some(
            (q) => q.required && q.type === 'YES_NO' && !answers[q.id]
          )}
        >
          Speichern und eintragen
        </Button>
      </div>
    </form>
  );
}
