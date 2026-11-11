'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, QrCode, Settings2 } from 'lucide-react';
import type { DepartmentPermission } from '@schichtplan/shared';
import { Button, Callout, Dialog, Field, Input, Select, Switch, applyAccent, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { DepartmentAuditPanel } from './DepartmentAuditPanel';
import { DepartmentPeoplePanel } from './DepartmentPeoplePanel';
import { DepartmentStatsPanel } from './DepartmentStatsPanel';
import { DepartmentStufenPanel } from './DepartmentStufenPanel';
import { ImageUpload } from './ImageUpload';
import { DepartmentBrandingPreview } from './DepartmentBrandingPreview';

// Kuratierte Akzentfarben mit optimalem Kontrast
const SWATCHES_PRIMARY = ['#e11d48', '#632949', '#283583', '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#7c3aed'];
const SWATCHES_SECONDARY = ['#003d8f', '#1e293b', '#e11d48', '#16a34a', '#d97706', '#4f46e5', '#0f766e', '#be123c'];

// Jeder Reiter braucht sein Recht (die Abteilungsleitung hat alle)
const TABS: {
  key: 'general' | 'stufen' | 'people' | 'stats' | 'audit';
  label: string;
  isAllowed: (can: (p: DepartmentPermission) => boolean) => boolean;
}[] = [
  { key: 'general', label: 'Allgemein', isAllowed: (can) => can('DEPARTMENT_SETTINGS') },
  { key: 'stufen', label: 'Stufen', isAllowed: (can) => can('STUFEN_MANAGE') },
  { key: 'people', label: 'Personen', isAllowed: (can) => can('PEOPLE_VIEW') },
  { key: 'stats', label: 'Statistik & GV', isAllowed: (can) => can('PEOPLE_VIEW') || can('DEPARTMENT_SETTINGS') },
  { key: 'audit', label: 'Protokoll', isAllowed: (can) => can('PEOPLE_MANAGE') },
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
  const tabs = useMemo(() => TABS.filter((t) => t.isAllowed(can)), [can]);
  const [tab, setTab] = useState<TabKey>(initialTab ?? tabs[0]?.key ?? 'general');

  useEffect(() => {
    if (!open) return;
    if (initialTab && TABS.some((t) => t.key === initialTab && t.isAllowed(can))) {
      setTab(initialTab);
    } else {
      const firstAllowed = TABS.find((t) => t.isAllowed(can))?.key ?? 'general';
      setTab(firstAllowed);
    }
    // Nur beim Öffnen oder gezielten Wechsel von initialTab synchronisieren
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

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
      className={activeTab === 'stats' ? 'sm:max-w-4xl' : undefined}
      icon={<Settings2 />}
      title="Abteilung"
      description="Name, Logo, Farbe, Stufen und Rechte gelten für alle Anlässe dieser Abteilung."
    >
      <div role="tablist" aria-label="Bereiche" className="-mt-1 mb-6 flex gap-1 rounded-full bg-surface-2 p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-9 flex-1 whitespace-nowrap px-3 rounded-full text-sm font-semibold transition',
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
      {activeTab === 'stats' && (can('PEOPLE_VIEW') || can('DEPARTMENT_SETTINGS')) && <DepartmentStatsPanel />}
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
    primaryColor: department?.primaryColor ?? SWATCHES_PRIMARY[0],
    secondaryColor: department?.secondaryColor ?? '#003d8f',
    qrStyle: (department?.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID') ?? 'CORNERS',
    enableTwoTone: Boolean(department?.secondaryColor),
    qrCustomColors: department?.qrCustomColors ?? false,
    qrColorPrimary: department?.qrColorPrimary ?? '#0f172a',
    qrColorSecondary: department?.qrColorSecondary ?? '#e11d48',
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

  const pickPrimaryColor = (color: string) => {
    setForm((f) => ({ ...f, primaryColor: color }));
    applyAccent(color);
  };

  const pickSecondaryColor = (color: string) => {
    setForm((f) => ({ ...f, secondaryColor: color }));
  };

  const pickQrPrimaryColor = (color: string) => {
    setForm((f) => ({ ...f, qrColorPrimary: color }));
  };

  const pickQrSecondaryColor = (color: string) => {
    setForm((f) => ({ ...f, qrColorSecondary: color }));
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
          secondaryColor: form.enableTwoTone ? (form.secondaryColor.trim() || null) : null,
          qrStyle: form.qrCustomColors || form.enableTwoTone ? form.qrStyle : 'SOLID',
          qrCustomColors: form.qrCustomColors,
          qrColorPrimary: form.qrCustomColors ? (form.qrColorPrimary.trim() || null) : null,
          qrColorSecondary: form.qrCustomColors ? (form.qrColorSecondary.trim() || null) : null,
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

      <Field label="Name der Abteilung" hint="z. B. Cevi Uster">
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          maxLength={80}
        />
      </Field>

      <Field
        label="Kontaktperson"
        hint="Wird im Hilfebereich und bei Fragen als Ansprechperson angezeigt. Wählbar sind die Abteilungsleitung und Personen mit dem Recht «Personen und Rechte verwalten»."
      >
        <Select
          value={form.contactUserId}
          onChange={(e) => setForm((f) => ({ ...f, contactUserId: e.target.value }))}
        >
          <option value="">Keine Kontaktperson ausgewählt</option>
          {candidates?.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.displayName} {c.isLeader ? '(Abteilungsleitung)' : ''}
            </option>
          ))}
        </Select>
      </Field>

      <ImageUpload
        label="Abteilungslogo"
        hint="Quadratisches PNG oder JPEG, max. 5 MB. Erscheint in der Navigation, auf Aushängen und zentriert in QR-Codes."
        value={form.logoUrl}
        onChange={(url) => setForm((f) => ({ ...f, logoUrl: url ?? '' }))}
      />

      <Switch
        checked={form.membersOnly}
        onChange={(v) => setForm((f) => ({ ...f, membersOnly: v }))}
        label="Startseite nur für Mitglieder"
        description="Aussenstehende sehen die Liste der Anlässe nicht. Öffentliche Anlässe bleiben über ihren Link erreichbar, interne nur mit Zugangs-Link."
      />

      {/* Farben & QR-Code Gestaltung */}
      <fieldset className="space-y-5 rounded-2xl border border-line bg-surface p-4">
        <legend className="px-1 text-[13px] font-bold text-fg">Farben & QR-Code Gestaltung</legend>

        {/* 1. Primärfarbe */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-fg">
            Hauptfarbe der Abteilung (Portal, Buttons & Akzente)
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            {SWATCHES_PRIMARY.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Farbe ${color}`}
                aria-pressed={form.primaryColor.toLowerCase() === color.toLowerCase()}
                onClick={() => pickPrimaryColor(color)}
                style={{ backgroundColor: color }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                  form.primaryColor.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                )}
              >
                {form.primaryColor.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
              </button>
            ))}
            <label
              className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
              title="Eigene Farbe wählen"
            >
              <span aria-hidden>+</span>
              <input
                type="color"
                value={form.primaryColor.startsWith('#') && form.primaryColor.length === 7 ? form.primaryColor : '#e11d48'}
                onChange={(e) => pickPrimaryColor(e.target.value)}
                aria-label="Eigene Hauptfarbe wählen"
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <div className="w-28">
              <Input
                value={form.primaryColor}
                onChange={(e) => pickPrimaryColor(e.target.value)}
                placeholder="#e11d48"
                maxLength={7}
                className="h-9 font-mono text-xs uppercase"
                aria-label="Hex-Wert Hauptfarbe"
              />
            </div>
          </div>
        </div>

        {/* 2. QR-Code Farben Modus */}
        <div className="border-t border-line/70 pt-4 space-y-4">
          <Switch
            checked={form.qrCustomColors}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                qrCustomColors: v,
                qrColorPrimary: v && !f.qrColorPrimary ? '#0f172a' : f.qrColorPrimary,
                qrColorSecondary: v && !f.qrColorSecondary ? f.primaryColor : f.qrColorSecondary,
              }))
            }
            label="Eigene Farben für den QR-Code verwenden"
            description="Erlaubt zwei komplett unabhängige Farben für den QR-Code (z. B. Marineblau & Gold), losgelöst von der Abteilungsfarbe."
          />

          {/* FALL A: Eigene QR-Code Farben */}
          {form.qrCustomColors ? (
            <div className="space-y-4 rounded-xl border border-line/70 bg-surface-2/40 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <QrCode className="size-4 text-accent-ink" />
                <span>QR-Code Farbpalette</span>
              </div>

              {/* QR-Hauptfarbe */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-fg">
                  QR-Code Hauptfarbe (Körper)
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {SWATCHES_PRIMARY.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`QR-Hauptfarbe ${color}`}
                      aria-pressed={form.qrColorPrimary.toLowerCase() === color.toLowerCase()}
                      onClick={() => pickQrPrimaryColor(color)}
                      style={{ backgroundColor: color }}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                        form.qrColorPrimary.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                      )}
                    >
                      {form.qrColorPrimary.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
                    </button>
                  ))}
                  <label
                    className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
                    title="Eigene QR-Hauptfarbe wählen"
                  >
                    <span aria-hidden>+</span>
                    <input
                      type="color"
                      value={form.qrColorPrimary.startsWith('#') && form.qrColorPrimary.length === 7 ? form.qrColorPrimary : '#0f172a'}
                      onChange={(e) => pickQrPrimaryColor(e.target.value)}
                      aria-label="Eigene QR-Hauptfarbe wählen"
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="w-28">
                    <Input
                      value={form.qrColorPrimary}
                      onChange={(e) => pickQrPrimaryColor(e.target.value)}
                      placeholder="#0f172a"
                      maxLength={7}
                      className="h-9 font-mono text-xs uppercase"
                      aria-label="Hex-Wert QR-Hauptfarbe"
                    />
                  </div>
                </div>
              </div>

              {/* QR-Zweitfarbe */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-fg">
                  QR-Code Zweitfarbe (Positions-Ecken oder Verlauf)
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {SWATCHES_SECONDARY.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`QR-Zweitfarbe ${color}`}
                      aria-pressed={form.qrColorSecondary.toLowerCase() === color.toLowerCase()}
                      onClick={() => pickQrSecondaryColor(color)}
                      style={{ backgroundColor: color }}
                      className={cn(
                        'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                        form.qrColorSecondary.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                      )}
                    >
                      {form.qrColorSecondary.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
                    </button>
                  ))}
                  <label
                    className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
                    title="Eigene QR-Zweitfarbe wählen"
                  >
                    <span aria-hidden>+</span>
                    <input
                      type="color"
                      value={form.qrColorSecondary.startsWith('#') && form.qrColorSecondary.length === 7 ? form.qrColorSecondary : '#e11d48'}
                      onChange={(e) => pickQrSecondaryColor(e.target.value)}
                      aria-label="Eigene QR-Zweitfarbe wählen"
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <div className="w-28">
                    <Input
                      value={form.qrColorSecondary}
                      onChange={(e) => pickQrSecondaryColor(e.target.value)}
                      placeholder="#e11d48"
                      maxLength={7}
                      className="h-9 font-mono text-xs uppercase"
                      aria-label="Hex-Wert QR-Zweitfarbe"
                    />
                  </div>
                </div>
              </div>

              {/* Stil-Auswahl: CORNERS vs GRADIENT vs SOLID */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-fg">QR-Code Stil</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qrStyle: 'CORNERS' }))}
                    className={cn(
                      'rounded-xl border p-2 text-left transition',
                      form.qrStyle === 'CORNERS'
                        ? 'border-accent bg-accent/10 text-fg shadow-xs'
                        : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                    )}
                  >
                    <span className="block text-xs font-bold text-fg">Ecken abgesetzt</span>
                    <span className="block text-[11px] text-fg-subtle mt-0.5">
                      Scanner-Ecken in Zweitfarbe
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qrStyle: 'GRADIENT' }))}
                    className={cn(
                      'rounded-xl border p-2 text-left transition',
                      form.qrStyle === 'GRADIENT'
                        ? 'border-accent bg-accent/10 text-fg shadow-xs'
                        : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                    )}
                  >
                    <span className="block text-xs font-bold text-fg">Farbverlauf</span>
                    <span className="block text-[11px] text-fg-subtle mt-0.5">
                      Diagonaler Farbfluss
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qrStyle: 'SOLID' }))}
                    className={cn(
                      'rounded-xl border p-2 text-left transition',
                      form.qrStyle === 'SOLID'
                        ? 'border-accent bg-accent/10 text-fg shadow-xs'
                        : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                    )}
                  >
                    <span className="block text-xs font-bold text-fg">Einfarbig</span>
                    <span className="block text-[11px] text-fg-subtle mt-0.5">
                      Nur Hauptfarbe
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* FALL B: Erbt Abteilungsfarben */
            <>
              <Switch
                checked={form.enableTwoTone}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    enableTwoTone: v,
                    secondaryColor: v && !f.secondaryColor ? '#003d8f' : f.secondaryColor,
                  }))
                }
                label="Zweifarbiges Design der Abteilung übernehmen"
                description="Färbt die Positions-Ecken oder erzeugt einen Farbverlauf für einen markanten Wiedererkennungswert."
              />

              {form.enableTwoTone && (
                <div className="space-y-4 rounded-xl border border-line/60 bg-surface-2/40 p-3.5">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-fg">
                      Zweitfarbe der Abteilung
                    </label>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {SWATCHES_SECONDARY.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Zweitfarbe ${color}`}
                          aria-pressed={form.secondaryColor.toLowerCase() === color.toLowerCase()}
                          onClick={() => pickSecondaryColor(color)}
                          style={{ backgroundColor: color }}
                          className={cn(
                            'flex size-9 items-center justify-center rounded-full text-white ring-2 ring-offset-2 ring-offset-surface transition',
                            form.secondaryColor.toLowerCase() === color.toLowerCase() ? 'ring-fg' : 'ring-transparent hover:scale-105'
                          )}
                        >
                          {form.secondaryColor.toLowerCase() === color.toLowerCase() && <Check className="size-4" />}
                        </button>
                      ))}
                      <label
                        className="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs font-bold text-fg-subtle hover:border-fg"
                        title="Eigene Zweitfarbe wählen"
                      >
                        <span aria-hidden>+</span>
                        <input
                          type="color"
                          value={form.secondaryColor.startsWith('#') && form.secondaryColor.length === 7 ? form.secondaryColor : '#003d8f'}
                          onChange={(e) => pickSecondaryColor(e.target.value)}
                          aria-label="Eigene Zweitfarbe wählen"
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </label>
                      <div className="w-28">
                        <Input
                          value={form.secondaryColor}
                          onChange={(e) => pickSecondaryColor(e.target.value)}
                          placeholder="#003d8f"
                          maxLength={7}
                          className="h-9 font-mono text-xs uppercase"
                          aria-label="Hex-Wert Zweitfarbe"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-fg">QR-Code Stil</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, qrStyle: 'CORNERS' }))}
                        className={cn(
                          'rounded-xl border p-2.5 text-left transition',
                          form.qrStyle === 'CORNERS'
                            ? 'border-accent bg-accent/10 text-fg shadow-xs'
                            : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                        )}
                      >
                        <span className="block text-xs font-bold text-fg">Ecken hervorgehoben</span>
                        <span className="block text-[11px] text-fg-subtle mt-0.5">
                          Positions-Ecken in Zweitfarbe (optimal für Scanner)
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, qrStyle: 'GRADIENT' }))}
                        className={cn(
                          'rounded-xl border p-2.5 text-left transition',
                          form.qrStyle === 'GRADIENT'
                            ? 'border-accent bg-accent/10 text-fg shadow-xs'
                            : 'border-line bg-surface text-fg-muted hover:border-fg-subtle'
                        )}
                      >
                        <span className="block text-xs font-bold text-fg">Farbverlauf</span>
                        <span className="block text-[11px] text-fg-subtle mt-0.5">
                          Diagonaler Übergang von Haupt- zu Zweitfarbe
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Live-Vorschau mit Kontrast-Check für beide Farben */}
        <DepartmentBrandingPreview
          name={form.name}
          logoUrl={form.logoUrl}
          primaryColor={form.primaryColor}
          secondaryColor={form.enableTwoTone ? form.secondaryColor : null}
          qrStyle={form.qrCustomColors ? form.qrStyle : (form.enableTwoTone ? form.qrStyle : 'SOLID')}
          qrCustomColors={form.qrCustomColors}
          qrColorPrimary={form.qrColorPrimary}
          qrColorSecondary={form.qrColorSecondary}
        />
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
