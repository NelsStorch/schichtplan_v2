'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  REQUIRED_PROFILE_FIELDS,
  accessTypeConfig,
  helpUrl,
  type DepartmentDirectoryItemDto,
  type EventAccessType,
  type RequiredProfileField,
} from '@schichtplan/shared';
import { Callout, Input, Switch, cn, useOrganization } from '@schichtplan/ui';
import { api } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import { getAccessTypeInfo } from './event-meta';
import { questionsPayload, type QuestionDraft } from './ok/QuestionsEditor';

export type { QuestionDraft };

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

/**
 * Formularwerte -> API (Listen passend zum Typ). Fragen nur beim Erstellen (aus einer Vorlage):
 * Danach bearbeitet sie die Seite «Fragen» im OK-Bereich, die Einstellungen dürfen sie nicht überschreiben.
 */
export function accessPayload(values: EventAccessValues, includeQuestions = false) {
  const cfg = accessTypeConfig(values.accessType);
  return {
    accessType: values.accessType,
    leadersOnly: values.leadersOnly,
    requiredFields: values.requiredFields,
    allowedDepartmentIds: cfg.whitelist ? values.allowedDepartmentIds : [],
    allowedStufeIds: cfg.scope === 'DEPARTMENT' ? values.allowedStufeIds : [],
    questions: includeQuestions ? questionsPayload(values.questions) : undefined,
  };
}

/** Bis hierhin steht die ganze Abteilungsliste offen, darüber nur die gewählten und die Suche */
const DEPARTMENT_LIST_LIMIT = 12;

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
  const org = useOrganization();
  const isVerein = org.slug === 'verein';
  const accessTypeOptions = useMemo(() => getAccessTypeInfo(org), [org]);
  const [directory, setDirectory] = useState<DepartmentDirectoryItemDto[]>([]);
  const [deptQuery, setDeptQuery] = useState('');
  const [showAllDepts, setShowAllDepts] = useState(false);

  useEffect(() => {
    loadDirectory().then(setDirectory).catch(() => setDirectory([]));
  }, []);

  const cfg = accessTypeConfig(values.accessType);
  const set = <K extends keyof EventAccessValues>(key: K, value: EventAccessValues[K]) =>
    onChange({ ...values, [key]: value });

  const others = directory.filter((d) => d.id !== department?.id);
  const longList = others.length > DEPARTMENT_LIST_LIMIT;
  const searching = deptQuery.trim().length > 0;
  const visibleOthers = useMemo(() => {
    const q = deptQuery.trim().toLowerCase();
    if (q) return others.filter((d) => d.name.toLowerCase().includes(q));
    if (longList && !showAllDepts) return others.filter((d) => values.allowedDepartmentIds.includes(d.id));
    return others;
  }, [others, deptQuery, longList, showAllDepts, values.allowedDepartmentIds]);

  // Stufen der eigenen und der freigeschalteten Abteilungen
  const stufenGroups = [
    directory.find((d) => d.id === department?.id),
    ...(cfg.whitelist ? directory.filter((d) => values.allowedDepartmentIds.includes(d.id)) : []),
  ].filter((d): d is DepartmentDirectoryItemDto => Boolean(d));

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-fg">Wer darf sich eintragen?</legend>
        <p className="mb-3 text-xs text-fg-muted">
          Eintragen braucht immer ein Konto, ein {org.nicknameTerm} ohne Passwort reicht. Das OK und persönliche Links
          gehen immer.{' '}
          <a
            href={helpUrl('/ok/zugang/')}
            target="_blank"
            rel="noopener"
            className="font-semibold text-accent-ink underline-offset-2 hover:underline"
          >
            Alle Arten erklärt
          </a>
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {accessTypeOptions.map((info) => {
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

        {!isVerein && cfg.ceviDb && cfg.scope === 'DEPARTMENT' && department && !department.ceviDbGroupId && (
          <Callout tone="warning" className="mt-3">
            {department.name} ist noch nicht mit einer {org.authProviderShort}-Gruppe verknüpft. So erfüllt niemand die
            Bedingung, ausser über einen persönlichen Link.
          </Callout>
        )}
      </fieldset>

      {cfg.whitelist && (
        <fieldset className="rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
          <legend className="px-1 text-[13px] font-semibold text-fg">
            Weitere {org.unitTermPlural} freischalten
          </legend>
          <p className="mb-3 text-xs text-fg-muted">
            {department?.name ?? (isVerein ? 'Dein Verein' : `Deine ${org.unitTerm}`)} ist immer dabei.{' '}
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
                placeholder={`${org.unitTerm} suchen`}
                aria-label={`${org.unitTerm} suchen`}
                className="h-10 pl-11"
              />
            </div>
          )}
          <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
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
            {others.length === 0 && (
              <li className="text-xs text-fg-subtle">Es gibt noch keine anderen {org.unitTermPlural}.</li>
            )}
            {others.length > 0 && visibleOthers.length === 0 && (
              <li className="px-2 py-1 text-xs text-fg-subtle sm:col-span-2 lg:col-span-3">
                {searching
                  ? `Keine ${org.unitTerm} gefunden.`
                  : `Noch keine gewählt. Suche eine ${org.unitTerm} oder zeige alle an.`}
              </li>
            )}
          </ul>
          {longList && !searching && (
            <button
              type="button"
              onClick={() => setShowAllDepts((v) => !v)}
              className="mt-2 px-2 text-xs font-semibold text-accent-ink underline-offset-2 hover:underline"
            >
              {showAllDepts ? 'Nur gewählte anzeigen' : `Alle ${others.length} ${org.unitTermPlural} anzeigen`}
            </button>
          )}
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
          isVerein
            ? 'Leitungsfunktion in einer Gruppe oder im Verein'
            : cfg.ceviDb
              ? `Leitungsrolle in ${org.authProviderShort} (Stufenleitung oder ${org.leadTerm})`
              : `Leitung in einer Stufe (beim Login angegeben oder aus ${org.authProviderShort})`
        }
      />

      <fieldset>
        <legend className="mb-1 text-[13px] font-semibold text-fg">Pflichtangaben</legend>
        <p className="mb-3 text-xs text-fg-muted">
          Wer etwas davon noch nicht im Profil hat, wird beim ersten Eintragen danach gefragt.
          {!isVerein &&
            ` Bei ${org.authProviderShort}-Konten kommen Name, E-Mail und Geburtsdatum aus ${org.authProviderShort}.`}
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

      <p className="text-xs text-fg-muted">
        Eigene Fragen (z. B. Adresse, Allergien, T-Shirt-Grösse) stellt ihr im OK-Bereich unter «Fragen», mit
        Aufbewahrungsdauer für die Antworten.
      </p>
    </div>
  );
}
