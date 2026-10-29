'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Settings2 } from 'lucide-react';
import type { DepartmentPermission } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, Switch, applyAccent, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { DepartmentAuditPanel } from './DepartmentAuditPanel';
import { DepartmentPeoplePanel } from './DepartmentPeoplePanel';
import { DepartmentStufenPanel } from './DepartmentStufenPanel';
import { ImageUpload } from './ImageUpload';

// Kuratierte Akzentfarben, alle mit ausreichendem Kontrast in beiden Modi
const SWATCHES = ['#e11d48', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#7c3aed'];

// Jeder Reiter braucht sein Recht (die Abteilungsleitung hat alle)
const TABS: { key: 'general' | 'stufen' | 'people' | 'audit'; label: string; permission: DepartmentPermission }[] = [
  { key: 'general', label: 'Allgemein', permission: 'DEPARTMENT_SETTINGS' },
  { key: 'stufen', label: 'Stufen', permission: 'STUFEN_MANAGE' },
  { key: 'people', label: 'Personen', permission: 'PEOPLE_VIEW' },
  { key: 'audit', label: 'Protokoll', permission: 'PEOPLE_MANAGE' },
];

type TabKey = (typeof TABS)[number]['key'];

export function DepartmentSettingsDialog({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: TabKey;
}) {
  const { department, can } = usePortal();
  const tabs = TABS.filter((t) => can(t.permission));
  const [tab, setTab] = useState<TabKey>(initialTab ?? tabs[0]?.key ?? 'general');

  useEffect(() => {
    if (initialTab && tabs.some((t) => t.key === initialTab)) {
      setTab(initialTab);
    }
  }, [initialTab, open]);
  const activeTab = tabs.some((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'general');
  const close = () => {
    applyAccent(department?.primaryColor); // Live-Vorschau zurücksetzen
    setTab(tabs[0]?.key ?? 'general');
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      icon={<Settings2 />}
      title="Abteilung"
      description="Name, Logo, Farbe, Stufen und Rechte gelten für alle Anlässe dieser Abteilung."
    >
      <div role="tablist" aria-label="Bereiche" className="-mt-1 mb-6 flex gap-1 rounded-full bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-9 flex-1 rounded-full text-sm font-semibold transition',
              activeTab === t.key ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'general' && can('DEPARTMENT_SETTINGS') && <DepartmentForm onDone={onClose} onCancel={close} />}
      {activeTab === 'stufen' && can('STUFEN_MANAGE') && <DepartmentStufenPanel />}
      {activeTab === 'people' && can('PEOPLE_VIEW') && <DepartmentPeoplePanel />}
      {activeTab === 'audit' && can('PEOPLE_MANAGE') && <DepartmentAuditPanel />}
    </Dialog>
  );
}

function DepartmentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { department, refresh } = usePortal();
  const toast = useToast();
  const [form, setForm] = useState({
    name: department?.name ?? '',
    logoUrl: department?.logoUrl ?? '',
    contactUserId: department?.contactUserId ?? '',
    primaryColor: department?.primaryColor ?? SWATCHES[0],
    membersOnly: department?.membersOnly ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ userId: string; displayName: string; isLeader: boolean }[] | null>(null);

  useEffect(() => {
    api<{ userId: string; displayName: string; isLeader: boolean }[]>('/api/departments/current/contact-candidates')
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, []);

  const pickColor = (color: string) => {
    setForm((f) => ({ ...f, primaryColor: color }));
    applyAccent(color);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/api/departments/current', {
        method: 'PATCH',
        json: {
          name: form.name.trim() || undefined,
          logoUrl: form.logoUrl.trim() || null,
          contactUserId: form.contactUserId || null,
          primaryColor: form.primaryColor,
          membersOnly: form.membersOnly,
        },
      });
      await refresh();
      toast({ title: 'Abteilung gespeichert' });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <Callout tone="danger">{error}</Callout>}

      <Field label="Name der Abteilung" required>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>

      <ImageUpload
        label="Logo der Abteilung"
        hint="Leer lassen für das Cevi-Logo"
        value={form.logoUrl}
        onChange={(url) => setForm({ ...form, logoUrl: url ?? '' })}
        showCeviFallback={true}
      />

      <Field
        label="Kontaktperson"
        hint="Abteilungsleitung oder wer «Personen und Rechte verwalten» darf. Angemeldete sehen auch die E-Mail."
      >
        <Select
          value={form.contactUserId}
          disabled={candidates === null}
          onChange={(e) => setForm({ ...form, contactUserId: e.target.value })}
        >
          <option value="">Keine Kontaktperson</option>
          {candidates?.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.displayName}
              {c.isLeader ? ' (Abteilungsleitung)' : ''}
            </option>
          ))}
          {/* Bisherige Kontaktperson, die die Voraussetzung nicht mehr erfüllt */}
          {candidates && form.contactUserId && !candidates.some((c) => c.userId === form.contactUserId) && (
            <option value={form.contactUserId}>{department?.contactPerson?.displayName ?? 'Bisherige Kontaktperson'}</option>
          )}
        </Select>
      </Field>

      <Switch
        checked={form.membersOnly}
        onChange={(v) => setForm({ ...form, membersOnly: v })}
        label="Startseite nur für Mitglieder"
        description="Aussenstehende sehen die Liste der Anlässe nicht. Öffentliche Anlässe bleiben über ihren Link erreichbar, interne nur mit Zugangs-Link."
      />

      <fieldset>
        <legend className="mb-3 text-[13px] font-semibold text-fg">Abteilungsfarbe</legend>
        <div className="flex flex-wrap items-center gap-2.5">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Farbe ${color}`}
              aria-pressed={form.primaryColor === color}
              onClick={() => pickColor(color)}
              style={{ backgroundColor: color }}
              className={cn(
                'flex size-10 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                form.primaryColor === color ? 'ring-fg' : 'ring-transparent hover:scale-105'
              )}
            >
              {form.primaryColor === color && <Check className="size-4" />}
            </button>
          ))}
          <label className="relative flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle">
            <span aria-hidden>+</span>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => pickColor(e.target.value)}
              aria-label="Eigene Farbe wählen"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">Vorschau ist live. Kontraste werden automatisch angepasst.</p>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" loading={saving}>
          Speichern
        </Button>
      </div>
    </form>
  );
}
