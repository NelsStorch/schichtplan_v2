'use client';

import { useState, type FormEvent } from 'react';
import { ClipboardList } from 'lucide-react';
import { PLACEHOLDER_LAST_NAME, REQUIRED_PROFILE_FIELDS, type RequiredProfileField } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, Textarea, cn } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';

/**
 * Fragt vor dem ersten Eintragen fehlende Pflichtangaben und die Fragen des Anlasses ab.
 * Profilangaben werden im Konto gespeichert (gelten auch für andere Anlässe), Antworten nur für diesen Anlass.
 */
export function ParticipationDialog({
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
      icon={<ClipboardList />}
      title="Noch ein paar Angaben"
      description={`Das OK von «${event.title}» braucht diese Angaben von dir. Du gibst sie nur einmal an.`}
    >
      <ParticipationForm event={event} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function ParticipationForm({
  event,
  onCancel,
  onSaved,
}: {
  event: EventDetails;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { user, refresh } = usePortal();
  const missing = new Set<RequiredProfileField>(event.viewer.missingFields);
  // Alle Fragen zeigen (auch freiwillige), bereits gegebene Antworten vorausfüllen
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
      await api(`/api/events/${event.slug}/participation`, {
        method: 'PUT',
        json: {
          profile: Object.keys(profilePayload).length ? profilePayload : undefined,
          answers: Object.fromEntries(event.questions.map((q) => [q.id, (answers[q.id] ?? '').trim()])),
        },
      });
      if (Object.keys(profilePayload).length) await refresh();
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
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

      {event.questions.length > 0 && missing.size > 0 && <hr className="border-line" />}

      {event.questions.map((q) => {
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
      })}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={event.questions.some((q) => q.required && q.type === 'YES_NO' && !answers[q.id])}
        >
          Speichern und eintragen
        </Button>
      </div>
    </form>
  );
}
