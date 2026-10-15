'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, Search, Trash2 } from 'lucide-react';
import {
  EVENT_QUESTION_SCOPES,
  EVENT_QUESTION_TYPES,
  REQUIRED_PROFILE_FIELDS,
  accessTypeConfig,
  type DepartmentDirectoryItemDto,
  type EventAccessType,
  type EventQuestionScope,
  type EventQuestionType,
  type RequiredProfileField,
} from '@schichtplan/shared';
import { Button, Callout, Input, Select, Switch, cn } from '@schichtplan/ui';
import { api } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { ACCESS_TYPE_INFO } from './event-meta';

export interface QuestionDraft {
  id?: string;
  label: string;
  type: EventQuestionType;
  /** Antworten bei Auswahl-Fragen, eine pro Zeile */
  optionsText: string;
  required: boolean;
  scope: EventQuestionScope;
}

export interface EventAccessValues {
  accessType: EventAccessType;
  leadersOnly: boolean;
  requiredFields: RequiredProfileField[];
  allowedDepartmentIds: string[];
  allowedStufeIds: string[];
  questions: QuestionDraft[];
}

export const EMPTY_ACCESS: EventAccessValues = {
  accessType: 'PUBLIC',
  leadersOnly: false,
  requiredFields: [],
  allowedDepartmentIds: [],
  allowedStufeIds: [],
  questions: [],
};

/** Formularwerte -> API (Listen passend zum Typ, Fragen bereinigt) */
export function accessPayload(values: EventAccessValues) {
  const cfg = accessTypeConfig(values.accessType);
  return {
    accessType: values.accessType,
    leadersOnly: values.leadersOnly,
    requiredFields: values.requiredFields,
    allowedDepartmentIds: cfg.whitelist ? values.allowedDepartmentIds : [],
    allowedStufeIds: cfg.scope === 'DEPARTMENT' ? values.allowedStufeIds : [],
    questions: values.questions
      .filter((q) => q.label.trim())
      .map((q) => ({
        id: q.id,
        label: q.label.trim(),
        type: q.type,
        options:
          q.type === 'CHOICE'
            ? q.optionsText
                .split('\n')
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
        required: q.required,
        scope: q.scope,
      })),
  };
}

let directoryCache: Promise<DepartmentDirectoryItemDto[]> | null = null;
function loadDirectory() {
  directoryCache ??= api<DepartmentDirectoryItemDto[]>('/api/departments/directory').catch((err) => {
    directoryCache = null;
    throw err;
  });
  return directoryCache;
}

/** Wer darf sich eintragen, was muss angegeben werden, welche Fragen stellt das OK? */
export function EventAccessFields({
  values,
  onChange,
}: {
  values: EventAccessValues;
  onChange: (next: EventAccessValues) => void;
}) {
  const { department } = usePortal();
  const [directory, setDirectory] = useState<DepartmentDirectoryItemDto[]>([]);
  const [deptQuery, setDeptQuery] = useState('');

  useEffect(() => {
    loadDirectory().then(setDirectory).catch(() => setDirectory([]));
  }, []);

  const cfg = accessTypeConfig(values.accessType);
  const set = <K extends keyof EventAccessValues>(key: K, value: EventAccessValues[K]) =>
    onChange({ ...values, [key]: value });

  const others = directory.filter((d) => d.id !== department?.id);
  const visibleOthers = useMemo(() => {
    const q = deptQuery.trim().toLowerCase();
    return q ? others.filter((d) => d.name.toLowerCase().includes(q)) : others;
  }, [others, deptQuery]);

  // Stufen der eigenen und der freigeschalteten Abteilungen
  const stufenGroups = [
    directory.find((d) => d.id === department?.id),
    ...(cfg.whitelist ? directory.filter((d) => values.allowedDepartmentIds.includes(d.id)) : []),
  ].filter((d): d is DepartmentDirectoryItemDto => Boolean(d));

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) =>
    set(
      'questions',
      values.questions.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  const moveQuestion = (index: number, delta: number) => {
    const next = [...values.questions];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    set('questions', next);
  };

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-fg">Wer darf sich eintragen?</legend>
        <p className="mb-3 text-xs text-fg-muted">
          Eintragen braucht immer ein Konto, ein Cevi-Name ohne Passwort reicht. Das OK und persönliche Links gehen
          immer.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {ACCESS_TYPE_INFO.map((info) => {
            const Icon = info.icon;
            const selected = values.accessType === info.key;
            return (
              <label
                key={info.key}
                className={cn(
                  'relative flex cursor-pointer gap-3 rounded-field border p-4 transition-colors',
                  selected ? 'border-accent bg-accent/8' : 'border-line hover:border-line-strong'
                )}
              >
                <input
                  type="radio"
                  name="accessType"
                  value={info.key}
                  checked={selected}
                  onChange={() => set('accessType', info.key)}
                  className="sr-only"
                />
                <Icon className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-accent-ink' : 'text-fg-subtle')} />
                <span className="min-w-0 pr-5">
                  <span className="block text-sm font-semibold text-fg">{info.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{info.description}</span>
                </span>
                {selected && <Check className="absolute right-3 top-3 size-4 text-accent-ink" />}
              </label>
            );
          })}
        </div>

        {cfg.ceviDb && cfg.scope === 'DEPARTMENT' && department && !department.ceviDbGroupId && (
          <Callout tone="warning" className="mt-3">
            {department.name} ist noch nicht mit einer Cevi.DB-Ortsgruppe verknüpft. So erfüllt niemand die Bedingung,
            ausser über einen persönlichen Link.
          </Callout>
        )}
      </fieldset>

      {cfg.whitelist && (
        <fieldset className="rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
          <legend className="px-1 text-[13px] font-semibold text-fg">Weitere Abteilungen freischalten</legend>
          <p className="mb-3 text-xs text-fg-muted">
            {department?.name ?? 'Deine Abteilung'} ist immer dabei.{' '}
            {values.allowedDepartmentIds.length > 0 && `${values.allowedDepartmentIds.length} weitere gewählt.`}
          </p>
          {others.length > 6 && (
            <div className="relative mb-2">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              />
              <Input
                type="search"
                value={deptQuery}
                onChange={(e) => setDeptQuery(e.target.value)}
                placeholder="Abteilung suchen"
                aria-label="Abteilung suchen"
                className="h-10 pl-11"
              />
            </div>
          )}
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {visibleOthers.map((d) => {
              const checked = values.allowedDepartmentIds.includes(d.id);
              return (
                <li key={d.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-field px-2 py-2 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => set('allowedDepartmentIds', toggle(values.allowedDepartmentIds, d.id))}
                      className="size-4 accent-[rgb(var(--accent))]"
                    />
                    <span className="text-sm text-fg">{d.name}</span>
                  </label>
                </li>
              );
            })}
            {others.length === 0 && <li className="text-xs text-fg-subtle">Es gibt noch keine anderen Abteilungen.</li>}
          </ul>
        </fieldset>
      )}

      {cfg.scope === 'DEPARTMENT' && (
        <fieldset>
          <legend className="mb-1 text-[13px] font-semibold text-fg">Nur bestimmte Stufen</legend>
          <p className="mb-3 text-xs text-fg-muted">
            Keine Auswahl heisst alle Stufen. Wählst du bei einer Abteilung Stufen aus, dürfen von dort nur diese.
          </p>
          <div className="space-y-3">
            {stufenGroups.map((group) => (
              <div key={group.id}>
                {stufenGroups.length > 1 && <p className="mb-1.5 text-xs font-semibold text-fg-subtle">{group.name}</p>}
                {group.stufen.length === 0 ? (
                  <p className="text-xs text-fg-subtle">
                    Für {group.name} sind noch keine Stufen erfasst
                    {group.id === department?.id && ' (Abteilungs-Einstellungen → Stufen)'}.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {group.stufen.map((stufe) => {
                      const on = values.allowedStufeIds.includes(stufe.id);
                      return (
                        <button
                          key={stufe.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set('allowedStufeIds', toggle(values.allowedStufeIds, stufe.id))}
                          className={cn(
                            'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
                            on
                              ? 'border-accent bg-accent/12 text-accent-ink'
                              : 'border-line text-fg-muted hover:border-line-strong hover:text-fg'
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                          {stufe.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <Switch
        checked={values.leadersOnly}
        onChange={(v) => set('leadersOnly', v)}
        label="Nur Leitende"
        description={
          cfg.ceviDb
            ? 'Leitungsrolle in Cevi.DB (Stufenleitung oder Abteilungsleitung)'
            : 'Leitung in einer Stufe (beim Login angegeben oder aus Cevi.DB)'
        }
      />

      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-fg">Pflichtangaben</legend>
        <p className="mb-3 text-xs text-fg-muted">
          Wer etwas davon noch nicht im Profil hat, wird beim ersten Eintragen danach gefragt. Bei Cevi.DB-Konten kommen
          Name, E-Mail, Geburtsdatum und Adresse aus Cevi.DB.
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(REQUIRED_PROFILE_FIELDS) as RequiredProfileField[]).map((field) => {
            const on = values.requiredFields.includes(field);
            return (
              <button
                key={field}
                type="button"
                aria-pressed={on}
                onClick={() => set('requiredFields', toggle(values.requiredFields, field))}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
                  on
                    ? 'border-accent bg-accent/12 text-accent-ink'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg'
                )}
              >
                {on && <Check className="size-3.5" />}
                {REQUIRED_PROFILE_FIELDS[field].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-fg">Eigene Fragen</legend>
        <p className="mb-3 text-xs text-fg-muted">
          «Einmal pro Anlass» z. B. für Allergien oder T-Shirt-Grösse, «Bei jeder Eintragung» für Angaben pro Schicht
          (z. B. «Bringe ich ein Auto mit?»). Die Antworten sieht nur das OK.
        </p>
        <div className="space-y-3">
          {values.questions.map((q, index) => (
            <div key={q.id ?? `new-${index}`} className="space-y-3 rounded-field border border-line bg-surface-2/60 p-3">
              <div className="flex gap-2">
                <Input
                  value={q.label}
                  onChange={(e) => updateQuestion(index, { label: e.target.value })}
                  placeholder="Frage, z. B. T-Shirt-Grösse"
                  aria-label={`Frage ${index + 1}`}
                  className="h-10"
                />
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, -1)}
                    aria-label="Nach oben"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={index === values.questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                    aria-label="Nach unten"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => set('questions', values.questions.filter((_, i) => i !== index))}
                    aria-label="Frage entfernen"
                    className="hover:text-danger-ink"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={q.type}
                  onChange={(e) => updateQuestion(index, { type: e.target.value as EventQuestionType })}
                  aria-label="Art der Antwort"
                  className="h-10 w-40"
                >
                  {(Object.keys(EVENT_QUESTION_TYPES) as EventQuestionType[]).map((type) => (
                    <option key={type} value={type}>
                      {EVENT_QUESTION_TYPES[type]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={q.scope}
                  onChange={(e) => updateQuestion(index, { scope: e.target.value as EventQuestionScope })}
                  aria-label="Wann wird gefragt?"
                  className="h-10 w-52"
                >
                  {(Object.keys(EVENT_QUESTION_SCOPES) as EventQuestionScope[]).map((scope) => (
                    <option key={scope} value={scope}>
                      {EVENT_QUESTION_SCOPES[scope]}
                    </option>
                  ))}
                </Select>
                <label className="inline-flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                    className="size-4 accent-[rgb(var(--accent))]"
                  />
                  Pflicht
                </label>
              </div>
              {q.type === 'CHOICE' && (
                <textarea
                  value={q.optionsText}
                  onChange={(e) => updateQuestion(index, { optionsText: e.target.value })}
                  rows={3}
                  placeholder={'Eine Antwort pro Zeile, z. B.\nS\nM\nL'}
                  aria-label="Antwortmöglichkeiten"
                  className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
                />
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set('questions', [
                ...values.questions,
                { label: '', type: 'TEXT', optionsText: '', required: false, scope: 'ONCE' },
              ])
            }
          >
            <Plus /> Frage hinzufügen
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
