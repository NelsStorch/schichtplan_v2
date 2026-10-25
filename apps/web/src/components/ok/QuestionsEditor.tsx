'use client';

import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_QUESTION_RETENTION_DAYS,
  EVENT_QUESTION_PRESETS,
  EVENT_QUESTION_SCOPES,
  EVENT_QUESTION_TYPES,
  QUESTION_RETENTION_DAYS,
  retentionLabel,
  type EventQuestionDto,
  type EventQuestionPreset,
  type EventQuestionScope,
  type EventQuestionType,
  type QuestionRetentionDays,
} from '@schichtplan/shared';
import { Button, Input, Select, cn } from '@schichtplan/ui';

export interface QuestionDraft {
  id?: string;
  label: string;
  type: EventQuestionType;
  /** Antworten bei Auswahl-Fragen, eine pro Zeile */
  optionsText: string;
  required: boolean;
  scope: EventQuestionScope;
  retentionDays: QuestionRetentionDays;
}

/** Gespeicherte Frage (Anlass oder Vorlage) -> Formular. Alte Vorlagen haben keine Aufbewahrung. */
export function questionDraft(
  q: Omit<EventQuestionDto, 'id' | 'retentionDays'> & { id?: string; retentionDays?: QuestionRetentionDays }
): QuestionDraft {
  return {
    id: q.id,
    label: q.label,
    type: q.type,
    optionsText: q.options.join('\n'),
    required: q.required,
    scope: q.scope ?? 'ONCE',
    retentionDays: q.retentionDays === undefined ? DEFAULT_QUESTION_RETENTION_DAYS : q.retentionDays,
  };
}

/** Formular -> API (leere Fragen fallen weg) */
export function questionsPayload(questions: QuestionDraft[]) {
  return questions
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
      retentionDays: q.retentionDays,
    }));
}

const EMPTY_QUESTION: QuestionDraft = {
  label: '',
  type: 'TEXT',
  optionsText: '',
  required: false,
  scope: 'ONCE',
  retentionDays: DEFAULT_QUESTION_RETENTION_DAYS,
};

function fromPreset(preset: EventQuestionPreset): QuestionDraft {
  return { ...EMPTY_QUESTION, label: preset.label, type: preset.type, optionsText: preset.options.join('\n') };
}

/** Eigene Fragen eines Anlasses bearbeiten: vorgefertigte oder eigene, je mit Aufbewahrungsdauer */
export function QuestionsEditor({
  questions,
  onChange,
  disabled = false,
}: {
  questions: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<QuestionDraft>) =>
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const move = (index: number, delta: number) => {
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const usedLabels = new Set(questions.map((q) => q.label.trim().toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[13px] font-semibold text-fg">Vorgefertigte Fragen</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_QUESTION_PRESETS.map((preset) => {
            const added = usedLabels.has(preset.label.toLowerCase());
            return (
              <button
                key={preset.key}
                type="button"
                disabled={disabled || added}
                title={preset.hint}
                aria-label={added ? `${preset.label} (schon hinzugefügt)` : `Frage «${preset.label}» hinzufügen`}
                onClick={() => onChange([...questions, fromPreset(preset)])}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
                  added
                    ? 'border-accent bg-accent/12 text-accent-ink'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg disabled:opacity-50'
                )}
              >
                {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {questions.length === 0 && (
          <p className="rounded-field border border-dashed border-line p-4 text-sm text-fg-muted">
            Noch keine Fragen. Fragt nur, was ihr für den Anlass wirklich braucht.
          </p>
        )}
        {questions.map((q, index) => (
          <div key={q.id ?? `new-${index}`} className="space-y-3 rounded-field border border-line bg-surface-2/60 p-3">
            <div className="flex gap-2">
              <Input
                value={q.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Frage, z. B. Bringst du ein Zelt mit?"
                aria-label={`Frage ${index + 1}`}
                className="h-10"
                disabled={disabled}
              />
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Nach oben"
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || index === questions.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Nach unten"
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange(questions.filter((_, i) => i !== index))}
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
                onChange={(e) => update(index, { type: e.target.value as EventQuestionType })}
                aria-label="Art der Antwort"
                className="h-10 w-40"
                disabled={disabled}
              >
                {(Object.keys(EVENT_QUESTION_TYPES) as EventQuestionType[]).map((type) => (
                  <option key={type} value={type}>
                    {EVENT_QUESTION_TYPES[type]}
                  </option>
                ))}
              </Select>
              <Select
                value={q.scope}
                onChange={(e) => update(index, { scope: e.target.value as EventQuestionScope })}
                aria-label="Wann wird gefragt?"
                className="h-10 w-52"
                disabled={disabled}
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
                  onChange={(e) => update(index, { required: e.target.checked })}
                  className="size-4 accent-[rgb(var(--accent))]"
                  disabled={disabled}
                />
                Pflicht
              </label>
            </div>
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-fg">
              <span className="font-semibold">Antworten löschen</span>
              <Select
                value={q.retentionDays === null ? 'never' : String(q.retentionDays)}
                onChange={(e) =>
                  update(index, {
                    retentionDays: (e.target.value === 'never' ? null : Number(e.target.value)) as QuestionRetentionDays,
                  })
                }
                className="h-10 w-60"
                disabled={disabled}
              >
                {QUESTION_RETENTION_DAYS.map((days) => (
                  <option key={days ?? 'never'} value={days === null ? 'never' : String(days)}>
                    {retentionLabel(days)}
                  </option>
                ))}
              </Select>
            </label>
            {q.type === 'CHOICE' && (
              <textarea
                value={q.optionsText}
                onChange={(e) => update(index, { optionsText: e.target.value })}
                rows={3}
                placeholder={'Eine Antwort pro Zeile, z. B.\nS\nM\nL'}
                aria-label="Antwortmöglichkeiten"
                disabled={disabled}
                className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...questions, { ...EMPTY_QUESTION }])}
        >
          <Plus /> Eigene Frage
        </Button>
      </div>
    </div>
  );
}
