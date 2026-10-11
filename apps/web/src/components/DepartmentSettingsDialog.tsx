'use client';

import { useState, type FormEvent } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { Button, Callout, CeviLogo, Dialog, Field, Input, applyAccent, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';

// Kuratierte Akzentfarben, alle mit ausreichendem Kontrast in beiden Modi
const SWATCHES = ['#e11d48', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#7c3aed'];

export function DepartmentSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { department } = usePortal();
  const close = () => {
    applyAccent(department?.primaryColor); // Live-Vorschau zurücksetzen
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<Settings2 />}
      title="Abteilung"
      description="Name, Logo und Farbe gelten für alle Anlässe dieser Abteilung."
    >
      <DepartmentForm onDone={onClose} onCancel={close} />
    </Dialog>
  );
}

function DepartmentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { department, refresh } = usePortal();
  const toast = useToast();
  const [form, setForm] = useState({
    name: department?.name ?? '',
    logoUrl: department?.logoUrl ?? '',
    contactEmail: department?.contactEmail ?? '',
    primaryColor: department?.primaryColor ?? SWATCHES[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          contactEmail: form.contactEmail.trim() || null,
          primaryColor: form.primaryColor,
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

      <div className="flex items-end gap-3">
        <Field label="Logo (Bild-URL)" hint="Leer lassen für das Cevi-Logo" className="flex-1">
          <Input
            type="url"
            value={form.logoUrl}
            placeholder="https://…/logo.png"
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          />
        </Field>
        <div className="mb-6 flex size-12 shrink-0 items-center justify-center rounded-field border border-line bg-surface-2 p-1.5">
          <CeviLogo className="size-full" logoUrl={form.logoUrl || null} alt="Logo-Vorschau" />
        </div>
      </div>

      <Field label="Kontakt-E-Mail">
        <Input
          type="email"
          value={form.contactEmail}
          placeholder="E-Mail-Adresse der Abteilung"
          onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
        />
      </Field>

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
