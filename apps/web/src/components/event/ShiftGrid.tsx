'use client';

import type { ShiftDto } from '@schichtplan/shared';
import { cn, slotStatus } from '@schichtplan/ui';
import { fmtTime, fmtTimeRange } from '@/lib/format';
import { STATUS_STYLES, shiftStats, shiftTasks } from './shift-utils';

/**
 * Raster eines Tages wie ein Excel-Schichtplan: Zeilen = Arbeiten, Spalten = Schichten (Zeitfenster).
 * Jede Zelle zeigt die Belegung in Ampelfarben; ein Klick öffnet die Schicht.
 * Auf schmalen Bildschirmen scrollt das Raster seitlich, die erste Spalte bleibt stehen.
 */
export function ShiftGrid({
  shifts,
  isMine,
  onOpen,
}: {
  shifts: ShiftDto[];
  isMine: (shift: ShiftDto) => boolean;
  onOpen: (shift: ShiftDto) => void;
}) {
  const columns = shifts.map((shift) => ({ shift, stats: shiftStats(shift), tasks: shiftTasks(shift) }));

  // Zeilen: Arbeiten in der Reihenfolge ihres ersten Auftretens (gleicher Titel = gleiche Zeile)
  const rows: string[] = [];
  for (const col of columns) {
    for (const task of col.tasks) {
      if (!rows.includes(task.title)) rows.push(task.title);
    }
  }
  const showShiftTitles = new Set(shifts.map((s) => s.title)).size > 1;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[8.5rem] border-b border-line bg-surface px-3 py-2.5 text-left text-xs font-semibold text-fg-subtle"
            >
              Arbeit
            </th>
            {columns.map(({ shift, stats }) => (
              <th
                key={shift.id}
                scope="col"
                className={cn(
                  'min-w-[6.5rem] border-b border-l border-line px-2 py-2 text-left align-bottom font-normal',
                  stats.over && 'opacity-55'
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpen(shift)}
                  className="block w-full rounded-md text-left hover:text-accent-ink"
                >
                  <span className="tabular block text-[13px] font-bold text-fg">
                    {fmtTimeRange(shift.startTime, shift.endTime)}
                  </span>
                  {showShiftTitles && (
                    <span className="block max-w-[9rem] truncate text-2xs text-fg-subtle">{shift.title}</span>
                  )}
                  {isMine(shift) && <span className="block text-2xs font-semibold text-success-ink">Du bist dabei</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((title) => (
            <tr key={title}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[10rem] truncate border-b border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-fg"
              >
                {title}
              </th>
              {columns.map(({ shift, stats, tasks }) => {
                const matching = tasks.filter((t) => t.title === title);
                if (matching.length === 0) {
                  return (
                    <td key={shift.id} className="border-b border-l border-line px-2 py-2 text-center text-fg-subtle/60">
                      –
                    </td>
                  );
                }
                const filled = matching.reduce((s, t) => s + t.filled, 0);
                const total = matching.reduce((s, t) => s + t.requiredSlots, 0);
                const style = STATUS_STYLES[slotStatus(filled, total)];
                return (
                  <td key={shift.id} className="border-b border-l border-line p-1">
                    <button
                      type="button"
                      onClick={() => onOpen(shift)}
                      aria-label={`${title}, ${fmtTime(shift.startTime)}: ${filled} von ${total} besetzt`}
                      className={cn(
                        'tabular flex h-9 w-full items-center justify-center rounded-md text-[13px] font-bold transition hover:ring-2 hover:ring-line-strong',
                        style.soft,
                        style.text,
                        stats.over && 'opacity-55'
                      )}
                    >
                      {filled}/{total}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-fg-subtle"
            >
              Total frei
            </th>
            {columns.map(({ shift, stats }) => (
              <td
                key={shift.id}
                className={cn(
                  'tabular border-l border-line bg-surface-2 px-2 py-2 text-center text-[13px] font-bold',
                  STATUS_STYLES[stats.status].text
                )}
              >
                {stats.free}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
