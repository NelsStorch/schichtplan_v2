'use client';

import { useState, type FormEvent } from 'react';
import { CalendarPlus, Check, Palette } from 'lucide-react';
import type { SignupMode } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Switch, Textarea, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { BANNER_PRESETS, SIGNUP_MODE_INFO } from './event-meta';

export interface EventFormValues {
  title: string;
  slug: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  startDate: string;
  endDate: string;
  signupMode: SignupMode;
  requireEmailForGuests: boolean;
  requirePhoneForGuests: boolean;
}

const EMPTY: EventFormValues = {
  title: '',
  slug: '',
  description: '',
  logoUrl: '',
  bannerUrl: BANNER_PRESETS[0].url,
  startDate: '',
  endDate: '',
  signupMode: 'OPEN',
  requireEmailForGuests: false,
  requirePhoneForGuests: false,
};

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
          ? 'Lege Titel, Daten und den Anmeldemodus fest. Schichten fügst du danach hinzu.'
          : 'Banner, Logo und Anmeldemodus dieses Anlasses anpassen.'
      }
    >
      <EventForm mode={mode} initial={initial} eventSlug={eventSlug} onCancel={onClose} onSaved={onSaved} />
    </Dialog>
  );
}

function EventForm({
  mode,
  initial,
  eventSlug,
  onCancel,
  onSaved,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<EventFormValues>;
  eventSlug?: string;
  onCancel: () => void;
  onSaved: (slug: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<EventFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const shared = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        logoUrl: form.logoUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        signupMode: form.signupMode,
        requireEmailForGuests: form.requireEmailForGuests,
        requirePhoneForGuests: form.requirePhoneForGuests,
      };
      if (mode === 'create') {
        await api('/api/events', {
          method: 'POST',
          json: {
            ...shared,
            slug: form.slug,
            logoUrl: shared.logoUrl ?? undefined,
            bannerUrl: shared.bannerUrl ?? undefined,
            startDate: new Date(form.startDate).toISOString(),
            endDate: new Date(form.endDate).toISOString(),
            allowPublicSignup: true,
          },
        });
        toast({ title: 'Anlass erstellt', description: `${form.title} ist jetzt sichtbar.` });
        onSaved(form.slug);
      } else {
        await api(`/api/events/${eventSlug}`, { method: 'PATCH', json: shared });
        toast({ title: 'Einstellungen gespeichert' });
        onSaved(eventSlug ?? '');
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-7">
      {error && <Callout tone="danger">{error}</Callout>}

      <section className="grid gap-5 sm:grid-cols-2">
        <Field label="Titel" required className="sm:col-span-2">
          <Input
            value={form.title}
            placeholder="Chilbi 2026"
            autoFocus={mode === 'create'}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                title: e.target.value,
                slug: mode === 'create' ? slugify(e.target.value) : f.slug,
              }))
            }
          />
        </Field>
        {mode === 'create' && (
          <>
            <Field label="Adresse (Slug)" required hint={`…/events/${form.slug || 'chilbi-2026'}`} className="sm:col-span-2">
              <Input
                value={form.slug}
                pattern="[a-z0-9-]+"
                onChange={(e) => set('slug', slugify(e.target.value))}
                className="font-mono"
              />
            </Field>
            <Field label="Beginn" required>
              <Input type="datetime-local" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="Ende" required>
              <Input
                type="datetime-local"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </Field>
          </>
        )}
        <Field label="Beschreibung" className="sm:col-span-2">
          <Textarea
            rows={3}
            value={form.description}
            placeholder="Worum geht es? Was sollen Helfer:innen wissen?"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </section>

      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold text-fg">Anmeldemodus</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(Object.keys(SIGNUP_MODE_INFO) as SignupMode[]).map((key) => {
            const info = SIGNUP_MODE_INFO[key];
            const Icon = info.icon;
            const selected = form.signupMode === key;
            return (
              <label
                key={key}
                className={cn(
                  'relative flex cursor-pointer gap-3 rounded-field border p-4 transition-colors',
                  selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="signupMode"
                  value={key}
                  checked={selected}
                  onChange={() => set('signupMode', key)}
                  className="sr-only"
                />
                <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-accent-ink' : 'text-fg-subtle')} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{info.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{info.description}</span>
                </span>
                {selected && <Check className="absolute right-3 top-3 size-4 text-accent-ink" />}
              </label>
            );
          })}
        </div>
        {(form.signupMode === 'NAME_ONLY' || form.signupMode === 'OPEN') && (
          <div className="mt-4 space-y-4 rounded-field bg-surface-2 p-4">
            <Switch
              checked={form.requireEmailForGuests}
              onChange={(v) => set('requireEmailForGuests', v)}
              label="E-Mail von Gästen verlangen"
              description="Für Erinnerungen und Rückfragen"
            />
            <Switch
              checked={form.requirePhoneForGuests}
              onChange={(v) => set('requirePhoneForGuests', v)}
              label="Handynummer von Gästen verlangen"
              description="Damit das OK kurzfristig erreichen kann"
            />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold text-fg">Banner</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {BANNER_PRESETS.map((preset) => {
            const selected = form.bannerUrl.split('?')[0] === preset.url.split('?')[0];
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
                <img src={preset.url.replace('w=1600', 'w=400')} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6 text-left text-xs font-semibold text-white">
                  {preset.name}
                </span>
              </button>
            );
          })}
        </div>
        <Field label="Oder eigene Bild-URL" className="mt-4">
          <Input type="url" value={form.bannerUrl} placeholder="https://…" onChange={(e) => set('bannerUrl', e.target.value)} />
        </Field>
        <Field label="Logo des Anlasses (Bild-URL)" hint="Leer lassen für das Cevi-Logo" className="mt-4">
          <Input type="url" value={form.logoUrl} placeholder="https://…/logo.png" onChange={(e) => set('logoUrl', e.target.value)} />
        </Field>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" loading={saving}>
          {mode === 'create' ? 'Anlass erstellen' : 'Speichern'}
        </Button>
      </div>
    </form>
  );
}
