import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import { slotStatus, type SlotStatus } from '@schichtplan/ui';
import { isPast } from '@/lib/format';

export interface ShiftStats {
  filled: number;
  total: number;
  free: number;
  status: SlotStatus;
  over: boolean;
  /** Beginnt in weniger als 48 Stunden und hat noch freie Plätze */
  urgent: boolean;
}

const URGENT_MS = 48 * 60 * 60 * 1000;

export function shiftStats(shift: ShiftDto, now = Date.now()): ShiftStats {
  const filled = Math.min(shift.signups?.length ?? 0, shift.requiredSlots);
  const total = shift.requiredSlots;
  const free = Math.max(0, total - filled);
  const over = isPast(shift.endTime);
  const startsIn = new Date(shift.startTime).getTime() - now;
  return {
    filled,
    total,
    free,
    status: slotStatus(filled, total),
    over,
    urgent: !over && free > 0 && startsIn < URGENT_MS,
  };
}

/** Eintragungen mit «Ersatz gesucht» (vergangene Schichten nicht mehr) */
export function replacementOffers(shift: ShiftDto) {
  if (isPast(shift.startTime)) return [];
  return (shift.signups ?? []).filter((s) => s.replacementWantedAt);
}

/** Arbeiten einer Schicht; Schichten ohne Arbeiten gelten als eine Arbeit mit dem Schichttitel */
export function shiftTasks(shift: ShiftDto): (ShiftTaskDto & { filled: number })[] {
  const signups = shift.signups ?? [];
  if (!shift.tasks || shift.tasks.length === 0) {
    return [
      {
        id: 'default',
        shiftId: shift.id,
        title: shift.title || 'Schicht',
        description: shift.description,
        requiredSlots: shift.requiredSlots,
        minAge: shift.minAge,
        ageRequirementType: 'ALL',
        filled: signups.length,
      },
    ];
  }
  return shift.tasks.map((t) => ({
    ...t,
    filled: signups.filter((s) => s.taskId === t.id || (shift.tasks!.length === 1 && !s.taskId)).length,
  }));
}

/** Farbklassen pro Belegungs-Status (Text, Hintergrund, Balken) */
export const STATUS_STYLES: Record<SlotStatus, { text: string; soft: string; bar: string }> = {
  open: { text: 'text-accent-ink', soft: 'bg-accent/10', bar: 'bg-accent' },
  last: { text: 'text-warning-ink', soft: 'bg-warning/15', bar: 'bg-warning' },
  full: { text: 'text-success-ink', soft: 'bg-success/12', bar: 'bg-success' },
};

export function freeLabel(free: number) {
  return free === 0 ? 'voll' : free === 1 ? '1 frei' : `${free} frei`;
}
