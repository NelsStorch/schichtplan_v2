'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { CalendarPlus, Check, Crown, Palette, Plus, Shield, Trash2, Users } from 'lucide-react';
import type { EventTemplateDto } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, Switch, Textarea, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { displayName, usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';
import { BANNER_PRESETS } from './event-meta';
import { EMPTY_ACCESS, EventAccessFields, accessPayload, type EventAccessValues } from './EventAccessFields';
import { ImageUpload } from './ImageUpload';

export interface EventFormValues {
  title: string;
  slug: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  startDate: string;
  endDate: string;
  /** false = Eintragen geschlossen (nur noch das OK teilt ein) */
  allowPublicSignup: boolean;
  minShiftsPerPerson: number | null;
  access: EventAccessValues;
}

/** Startwerte für «Design & Einstellungen» eines bestehenden Anlasses */
export function eventFormInitial(event: EventDetails): Partial<EventFormValues> {
  return {
    title: event.title,
    description: event.description ?? '',
    logoUrl: event.logoUrl ?? '',
    bannerUrl: event.bannerUrl ?? '',
    allowPublicSignup: event.allowPublicSignup,
    minShiftsPerPerson: event.minShiftsPerPerson ?? null,
    access: {
      accessType: event.accessType,
      leadersOnly: event.leadersOnly,
      requiredFields: event.requiredFields,
      allowedDepartmentIds: event.allowedDepartments.map((d) => d.id),
      allowedStufeIds: event.allowedStufen.map((s) => s.id),
      questions: event.questions.map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
        optionsText: q.options.join('\n'),
        required: q.required,
        scope: q.scope,
      })),
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
  logoUrl: '',
  bannerUrl: BANNER_PRESETS[0].url,
  startDate: '',
  endDate: '',
  allowPublicSignup: true,
  minShiftsPerPerson: null,
  access: EMPTY_ACCESS,
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
          ? 'Lege Titel, Daten, Zugang und das OK fest. Schichten fügst du danach hinzu.'
          : 'Zugang, Pflichtangaben, Banner und Logo dieses Anlasses anpassen.'
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
  const { user } = usePortal();
  const [form, setForm] = useState<EventFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Ersteller initial als OK-Leitung eintragen
  useEffect(() => {
    if (mode === 'create' && user && organizers.length === 0) {
      setOrganizers([
        {
          userId: user.id,
          displayName: displayName(user),
          role: 'OK_LEAD',
          roleTitle: 'Event-Leitung',
        },
      ]);
    }
  }, [mode, user, organizers.length]);

  // Abteilungsmitglieder & Vorlagen laden
  useEffect(() => {
    if (mode === 'create') {
      api<DeptMemberItem[]>('/api/departments/current/members')
        .then(setDeptMembers)
        .catch(() => setDeptMembers([]));

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
        minShiftsPerPerson: form.minShiftsPerPerson ?? null,
        ...accessPayload(form.access),
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
              startDate: new Date(form.startDate).toISOString(),
              endDate: new Date(form.endDate).toISOString(),
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
              startDate: new Date(form.startDate).toISOString(),
              endDate: new Date(form.endDate).toISOString(),
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
        await api(`/api/events/${eventSlug}`, {
          method: 'PATCH',
          json: { ...shared, description: form.description.trim() || null, allowPublicSignup: form.allowPublicSignup },
        });
        toast({ title: 'Einstellungen gespeichert' });
        onSaved(eventSlug ?? '');
      }
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  // Verfügbare Mitglieder, die noch nicht im OK sind (Cevi-Name-Profile können keine Rolle haben)
  const availableMembers = deptMembers.filter(
    (m) => !m.isCeviNameProfile && !organizers.some((o) => o.userId === m.userId)
  );

  return (
    <form onSubmit={submit} className="space-y-7">
      {error && <Callout tone="danger">{error}</Callout>}

      <section className="grid gap-5 sm:grid-cols-2">
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
                if (tId) {
                  const found = templates.find((t) => t.id === tId);
                  if (found) {
                    const cleanTitle = found.title.replace(/\s*\(Vorlage\)\s*/i, '');
                    setForm((prev) => ({
                      ...prev,
                      title: cleanTitle,
                      slug: slugify(cleanTitle),
                      description: found.description || '',
                      access: {
                        accessType: found.accessType,
                        leadersOnly: found.leadersOnly,
                        requiredFields: found.requiredFields,
                        allowedDepartmentIds: found.data.allowedDepartmentIds ?? [],
                        allowedStufeIds: found.data.allowedStufeIds ?? [],
                        questions: (found.data.questions ?? []).map((q) => ({
                          label: q.label,
                          type: q.type,
                          optionsText: q.options.join('\n'),
                          required: q.required,
                          scope: q.scope ?? 'ONCE',
                        })),
                      },
                    }));
                  }
                }
              }}
            >
              <option value="">Keine Vorlage (leeres Event anlegen)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.shiftCount} Schichten)
                </option>
              ))}
            </Select>
          </Field>
        )}

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
                pattern="[-a-z0-9]+"
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

      {/* Organisationskomitee (OK) bei neuem Event angeben */}
      {mode === 'create' && (
        <fieldset className="rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-4 text-accent-ink" />
            <legend className="text-[13px] font-semibold text-fg">Organisationskomitee (OK)</legend>
          </div>
          <p className="mb-4 text-xs text-fg-muted">
            Wer leitet diesen Anlass und teilt Helfer:innen ein? Du kannst weitere Personen direkt hinzufügen.
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
                  <option value="OK_MEMBER">OK-Mitglied (Schichten planen & Helfer koordinieren)</option>
                  <option value="OK_LEAD">OK-Leitung (Volle Event-Verwaltung & Design)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-fg-subtle block mb-1">Ressort / Bezeichnung (optional)</label>
                <input
                  type="text"
                  placeholder="z.B. Bau & Technik, Kassier, Grillchef"
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

      <div className="space-y-4 rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
        <h4 className="text-[13px] font-semibold text-fg">Schichten &amp; Helfer-Soll</h4>
        <Field
          label="Mindestanzahl Schichten pro Person (optional)"
          hint="Zeigt dem OK im Helfer-Pool an, wer sein Schicht-Soll bereits erfüllt hat (z. B. 2 Schichten pro Leiter:in). Leer lassen für kein Soll."
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

        {mode === 'edit' && (
          <Switch
            checked={form.allowPublicSignup}
            onChange={(v) => set('allowPublicSignup', v)}
            label="Eintragen für Helfer:innen offen"
            description="Ausgeschaltet können nur noch das OK und die Abteilungsleitung Personen einteilen."
          />
        )}
      </div>

      <EventAccessFields values={form.access} onChange={(access) => set('access', access)} />

      <fieldset className="space-y-5">
        <div>
          <legend className="mb-3 text-[13px] font-semibold text-fg">Banner des Anlasses</legend>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
