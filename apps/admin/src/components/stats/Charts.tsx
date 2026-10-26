'use client';

import { useId, useState } from 'react';
import { Skeleton, cn } from '@schichtplan/ui';

// Tag (YYYY-MM-DD) ohne Zeitzonen-Verschiebung anzeigen: Mittag UTC liegt sicher im richtigen Tag
const dayFmt = new Intl.DateTimeFormat('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const shortDayFmt = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
export const formatDay = (day: string) => dayFmt.format(new Date(`${day}T12:00:00Z`));
const formatShortDay = (day: string) => shortDayFmt.format(new Date(`${day}T12:00:00Z`));

export const fmtNumber = (n: number) => n.toLocaleString('de-CH');

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString('de-CH', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** Kennzahl-Kachel (wie auf der Übersicht) */
export function StatTile({ label, value, hint }: { label: string; value?: number | string | null; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold leading-none tracking-tight text-fg tabular">
        {value === undefined ? (
          <Skeleton className="h-6 w-12" />
        ) : value === null ? (
          '–'
        ) : typeof value === 'number' ? (
          fmtNumber(value)
        ) : (
          value
        )}
      </dd>
      {hint && <p className="mt-1 text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3 lg:grid-cols-6 [&>div]:bg-surface">
      {children}
    </dl>
  );
}

export function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5', className)}>
      <h3 className="font-display text-base font-semibold tracking-tight text-fg">{title}</h3>
      {description && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Säulen pro Tag (eine Reihe, Akzentfarbe). Abgerundetes Ende oben, schmaler Abstand zwischen den Säulen,
 * Tooltip beim Darüberfahren (Trefferfläche = ganze Höhe) und eine Tabelle für Screenreader.
 */
export function DailyBars({
  days,
  values,
  label,
  tone = 'accent',
}: {
  days: string[];
  values: number[];
  label: string;
  tone?: 'accent' | 'danger';
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const n = values.length;
  const gap = n <= 31 ? '2px' : n <= 90 ? '1px' : '0px';

  if (total === 0) {
    return <p className="py-10 text-center text-sm text-fg-subtle">Im Zeitraum noch nichts gezählt.</p>;
  }

  return (
    <figure className="relative" onMouseLeave={() => setHover(null)} aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className="sr-only">
        {`${label}: ${fmtNumber(total)} im Zeitraum, höchstens ${fmtNumber(max)} an einem Tag`}
      </figcaption>
      <div className="mb-1 flex justify-between text-2xs tabular text-fg-subtle" aria-hidden>
        <span>max. {fmtNumber(max)}</span>
        <span>Summe {fmtNumber(total)}</span>
      </div>
      <div
        className="relative flex h-36 items-end border-b border-line-strong"
        style={{ gap }}
        aria-hidden
      >
        {/* Leise Hilfslinie bei der halben Höhe */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
        {values.map((v, i) => (
          <div
            key={days[i]}
            className="flex h-full min-w-0 flex-1 items-end"
            onMouseEnter={() => setHover(i)}
          >
            {v > 0 && (
              <div
                className={cn(
                  'w-full rounded-t-[4px] transition-opacity',
                  tone === 'danger' ? 'bg-danger' : 'bg-accent',
                  hover !== null && hover !== i && 'opacity-50'
                )}
                style={{ height: `max(2px, ${(v / max) * 100}%)` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-2xs tabular text-fg-subtle" aria-hidden>
        <span>{formatShortDay(days[0])}</span>
        <span>{formatShortDay(days[days.length - 1])}</span>
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-field border border-line bg-surface px-2.5 py-1.5 text-xs shadow-soft"
          style={{ left: `${Math.min(90, Math.max(10, ((hover + 0.5) / n) * 100))}%` }}
        >
          <span className="text-fg-muted">{formatDay(days[hover])}</span>{' '}
          <span className="font-semibold tabular text-fg">{fmtNumber(values[hover])}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th>Tag</th>
            <th>Anzahl</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <td>{formatDay(d)}</td>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Aufteilung als waagrechte Balken mit Zahl und Anteil (eine Farbe, Text in Textfarben) */
export function Breakdown({
  items,
  total,
  empty = 'Noch nichts gezählt.',
  limit,
}: {
  items: { key: string; label: string; count: number }[];
  total?: number;
  empty?: string;
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const sum = total ?? items.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0 || sum === 0) return <p className="text-sm text-fg-subtle">{empty}</p>;
  const visible = limit && !showAll ? items.slice(0, limit) : items;
  return (
    <div>
      <ul className="space-y-2.5">
        {visible.map((item) => (
          <li key={item.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-fg" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 tabular text-fg-muted">
                <span className="font-semibold text-fg">{fmtNumber(item.count)}</span>
                {sum > 0 && <span className="ml-1.5 text-2xs">{Math.round((item.count / sum) * 100)}%</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {limit && items.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs font-semibold text-accent-ink hover:underline"
        >
          {showAll ? 'Weniger zeigen' : `Alle ${items.length} zeigen`}
        </button>
      )}
    </div>
  );
}
