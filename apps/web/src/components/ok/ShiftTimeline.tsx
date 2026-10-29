'use client';

import type { ShiftDto } from '@schichtplan/shared';
import { Card, cn } from '@schichtplan/ui';
import { fmtTime, fmtTimeRange } from '@/lib/format';

const HOUR = 60 * 60 * 1000;

/**
 * Kompakte Plan-Ansicht eines Tages: eine Zeile pro Schicht, der Balken zeigt die Zeit,
 * die Farbe die Belegung. So fallen Lücken und Überschneidungen sofort auf.
 */
export function ShiftTimeline({
  shifts,
  selecting,
  selectedIds,
  onSelect,
  onOpen,
}: {
  shifts: ShiftDto[];
  selecting: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (shift: ShiftDto) => void;
}) {
  const sorted = [...shifts].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime() || (a.title || '').localeCompare(b.title || '', 'de')
  );
  const start = Math.floor(Math.min(...sorted.map((s) => new Date(s.startTime).getTime())) / HOUR) * HOUR;
  const end = Math.ceil(Math.max(...sorted.map((s) => new Date(s.endTime).getTime())) / HOUR) * HOUR;
  const span = Math.max(HOUR, end - start);
  const hours = Math.round(span / HOUR);
  // Bei langen Tagen nur jede zweite oder dritte Stunde beschriften
  const step = hours > 16 ? 3 : hours > 8 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(hours / step) + 1 }, (_, i) => start + i * step * HOUR);
  const pos = (t: number) => ((t - start) / span) * 100;

  return (
    <Card className="overflow-x-auto p-0">
      <div className="min-w-[40rem]">
        {/* Stunden-Leiste */}
        <div className="grid grid-cols-[13rem_1fr] border-b border-line bg-surface-2/60 text-2xs text-fg-subtle">
          <div className="px-3 py-2 font-semibold uppercase tracking-wider">Schicht</div>
          <div className="relative h-8">
            {ticks.map((t) => (
              <span key={t} className="absolute top-2 -translate-x-1/2 tabular" style={{ left: `${pos(t)}%` }}>
                {fmtTime(new Date(t).toISOString())}
              </span>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-line">
          {sorted.map((shift) => {
            const filled = shift.signups?.length ?? 0;
            const ratio = shift.requiredSlots ? filled / shift.requiredSlots : 1;
            const left = pos(new Date(shift.startTime).getTime());
            const width = Math.max(1.5, pos(new Date(shift.endTime).getTime()) - left);
            const selected = selectedIds.has(shift.id);
            const tone =
              ratio >= 1
                ? 'bg-success/80 text-white'
                : ratio > 0
                  ? 'bg-accent/80 text-white'
                  : 'border border-dashed border-warning bg-warning/15 text-warning-ink';
            return (
              <li key={shift.id}>
                <button
                  type="button"
                  onClick={() => (selecting ? onSelect(shift.id) : onOpen(shift))}
                  className={cn(
                    'grid w-full grid-cols-[13rem_1fr] items-center text-left transition hover:bg-surface-2/60',
                    selected && 'bg-accent/10'
                  )}
                  aria-pressed={selecting ? selected : undefined}
                  title={`${shift.title?.trim() || fmtTimeRange(shift.startTime, shift.endTime)}: ${fmtTimeRange(shift.startTime, shift.endTime)}, ${filled}/${shift.requiredSlots} besetzt`}
                >
                  <span className="flex min-w-0 items-center gap-2 px-3 py-2">
                    {selecting && (
                      <input type="checkbox" readOnly checked={selected} tabIndex={-1} className="size-4 shrink-0 accent-accent" />
                    )}
                    <span className="min-w-0">
                      {shift.title?.trim() ? (
                        <span className="block truncate text-sm font-semibold text-fg">{shift.title}</span>
                      ) : null}
                      <span className="block font-mono text-2xs text-fg-muted">
                        {fmtTimeRange(shift.startTime, shift.endTime)}
                      </span>
                    </span>
                  </span>
                  <span className="relative block h-10">
                    {ticks.map((t) => (
                      <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${pos(t)}%` }} />
                    ))}
                    <span
                      className={cn(
                        'absolute top-2 flex h-6 items-center justify-center overflow-hidden rounded-md px-1.5 text-2xs font-bold tabular',
                        tone
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {filled}/{shift.requiredSlots}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-2xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-success/80" /> voll
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent/80" /> teilweise besetzt
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-dashed border-warning bg-warning/15" /> noch niemand
        </span>
      </p>
    </Card>
  );
}
