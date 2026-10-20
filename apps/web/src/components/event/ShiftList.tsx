'use client';

import { AlertCircle, Check, ChevronRight, Hammer, Plus, Timer } from 'lucide-react';
import type { ShiftDto } from '@schichtplan/shared';
import { Badge, Button, cn } from '@schichtplan/ui';
import { businessDayKey, fmtDayMonth, fmtShortWeekday, fmtTime } from '@/lib/format';
import { STATUS_STYLES, freeLabel, shiftStats, shiftTasks } from './shift-utils';

export interface ShiftActions {
  /** Kann sich die angemeldete Person selbst eintragen (Zugang ok oder Login möglich)? */
  canSignup: boolean;
  isMine: (shift: ShiftDto) => boolean;
  hasConflict?: (shift: ShiftDto) => boolean;
  busyShiftId: string | null;
  contactName?: string | null;
  dayResponsibles?: Record<string, { id: string; displayName: string }[]>;
  responsibleMode?: 'BY_SHIFT' | 'BY_DAY';
  dayCutoffTime?: string;
  onOpen: (shift: ShiftDto) => void;
  onQuickSignup: (shift: ShiftDto) => void;
}

/** Oben auf der Seite: alle kommenden Schichten mit freien Plätzen, die nächsten zuerst. */
export function NeededShifts({
  shifts,
  actions,
  limit = 6,
  onShowAll,
}: {
  shifts: ShiftDto[];
  actions: ShiftActions;
  limit?: number;
  onShowAll: () => void;
}) {
  const needed = shifts
    .map((shift) => ({ shift, stats: shiftStats(shift) }))
    .filter(({ stats }) => !stats.over && stats.free > 0)
    .sort((a, b) => +new Date(a.shift.startTime) - +new Date(b.shift.startTime));
  if (needed.length === 0) return null;

  const freeTotal = needed.reduce((sum, n) => sum + n.stats.free, 0);

  return (
    <section aria-labelledby="needed-title" className="animate-fade-up">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="needed-title" className="font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl">
          Noch gesucht
          <span className="tabular ml-2 text-base font-semibold text-fg-subtle">
            {freeTotal} {freeTotal === 1 ? 'Platz' : 'Plätze'}
          </span>
        </h2>
        {needed.length > limit && (
          <button type="button" onClick={onShowAll} className="text-sm font-semibold text-accent-ink hover:underline">
            Alle {needed.length} anzeigen
          </button>
        )}
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {needed.slice(0, limit).map(({ shift, stats }) => {
          const openTasks = shiftTasks(shift).filter((t) => t.filled < t.requiredSlots);
          const mine = actions.isMine(shift);
          return (
            <li key={shift.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => actions.onOpen(shift)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    actions.onOpen(shift);
                  }
                }}
                className={cn(
                  'flex h-full cursor-pointer items-center gap-3 rounded-card border bg-surface p-3 transition hover:border-line-strong sm:p-3.5',
                  stats.urgent ? 'border-warning/50' : 'border-line'
                )}
              >
                <div className="w-14 shrink-0 rounded-tile bg-surface-2 py-1.5 text-center">
                  <p className="text-2xs font-bold uppercase text-fg-subtle">{fmtShortWeekday(shift.startTime)}</p>
                  <p className="tabular text-sm font-bold text-fg">{fmtTime(shift.startTime)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-fg">
                    <span className="truncate">{shift.title}</span>
                    {stats.urgent && (
                      <Badge size="sm" tone="warning">
                        <Timer className="size-3" /> bald
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {openTasks.length > 1 || openTasks[0]?.title !== shift.title
                      ? openTasks.map((t) => `${t.title} ${t.requiredSlots - t.filled}`).join(' · ')
                      : `${fmtDayMonth(shift.startTime)}, bis ${fmtTime(shift.endTime)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn('tabular text-sm font-bold', STATUS_STYLES[stats.status].text)}>
                    {freeLabel(stats.free)}
                  </span>
                  {mine ? (
                    <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success-ink">
                      <Check className="size-4" aria-label="Du bist dabei" />
                    </span>
                  ) : actions.hasConflict?.(shift) ? (
                    <span
                      title="Zeitkollision mit einer deiner Schichten"
                      className="flex size-9 items-center justify-center rounded-full bg-warning/15 text-warning-ink border border-warning/30"
                    >
                      <AlertCircle className="size-4 text-warning" />
                    </span>
                  ) : actions.canSignup ? (
                    <Button
                      size="icon-sm"
                      aria-label={`In ${shift.title} eintragen`}
                      loading={actions.busyShiftId === shift.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onQuickSignup(shift);
                      }}
                    >
                      <Plus />
                    </Button>
                  ) : (
                    <ChevronRight className="size-4 text-fg-subtle" />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Kompakte Zeilen pro Schicht: Zeit, Arbeiten mit Belegung, Balken, Aktion. */
export function ShiftRows({ shifts, actions }: { shifts: ShiftDto[]; actions: ShiftActions }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {shifts.map((shift) => {
        const stats = shiftStats(shift);
        const tasks = shiftTasks(shift);
        const showTasks = tasks.length > 1 || tasks[0]?.title !== shift.title;
        const mine = actions.isMine(shift);
        const style = STATUS_STYLES[stats.status];
        const isFull = stats.free === 0;
        const dayKey = businessDayKey(shift.startTime, actions.dayCutoffTime);
        const responsibles =
          actions.responsibleMode === 'BY_DAY'
            ? actions.dayResponsibles?.[dayKey]
            : shift.responsibles;
        return (
          <li key={shift.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => actions.onOpen(shift)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  actions.onOpen(shift);
                }
              }}
              className={cn(
                'flex cursor-pointer gap-3 p-3 transition-colors hover:bg-surface-2/60 sm:gap-4 sm:p-4',
                stats.over && 'opacity-55',
                mine && 'bg-accent/5'
              )}
            >
              <div className="w-12 shrink-0 pt-0.5 sm:w-14">
                <p className="tabular text-[15px] font-bold leading-tight text-fg">{fmtTime(shift.startTime)}</p>
                <p className="tabular text-xs text-fg-subtle">{fmtTime(shift.endTime)}</p>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="truncate text-[15px] font-semibold text-fg">{shift.title}</h3>
                  {shift.isSetupTeardown && (
                    <Badge size="sm" tone="neutral">
                      <Hammer className="size-3" /> Auf-/Abbau
                    </Badge>
                  )}
                  {responsibles && responsibles.length > 0 && (
                    <Badge size="sm" tone="neutral" className="max-w-[180px] truncate">
                      Leitung: {responsibles.map((r) => r.displayName).join(', ')}
                    </Badge>
                  )}
                  {shift.minAge ? (
                    <Badge size="sm" tone="warning">
                      ab {shift.minAge}
                    </Badge>
                  ) : null}
                  {mine && (
                    <Badge size="sm" tone="success">
                      <Check className="size-3" /> Du
                    </Badge>
                  )}
                  {stats.urgent && (
                    <Badge size="sm" tone="warning">
                      <Timer className="size-3" /> bald
                    </Badge>
                  )}
                </div>

                {showTasks && (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Arbeiten">
                    {tasks.map((t) => {
                      const full = t.filled >= t.requiredSlots;
                      return (
                        <li
                          key={t.id}
                          className={cn(
                            'tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            full ? 'bg-surface-2 text-fg-subtle' : 'bg-accent/10 text-accent-ink'
                          )}
                        >
                          {t.title}
                          <span className="font-bold">
                            {t.filled}/{t.requiredSlots}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div
                  className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
                  role="img"
                  aria-label={`${stats.filled} von ${stats.total} Plätzen besetzt`}
                >
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', style.bar)}
                    style={{ width: `${stats.total ? (stats.filled / stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                <span className={cn('tabular text-sm font-bold', style.text)}>{freeLabel(stats.free)}</span>
                {isFull && actions.contactName && (
                  <span className="text-2xs text-accent-ink font-semibold truncate max-w-[140px] text-right">
                    Fragen: {actions.contactName}
                  </span>
                )}
                {!stats.over && !mine && stats.free > 0 && actions.canSignup && (
                  actions.hasConflict?.(shift) ? (
                    <span
                      title="Zeitkollision mit einer deiner Schichten"
                      className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-ink"
                    >
                      <AlertCircle className="size-3.5 text-warning" />
                      <span className="hidden sm:inline">Kollision</span>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={actions.busyShiftId === shift.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onQuickSignup(shift);
                      }}
                    >
                      <Plus /> <span className="hidden sm:inline">Eintragen</span>
                    </Button>
                  )
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
