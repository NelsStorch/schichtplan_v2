import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import type { EventDetails } from '@/lib/types';

export interface AgeWarning {
  shift: ShiftDto;
  task: ShiftTaskDto;
}

/** Arbeiten mit «mindestens 1 Person ab X», bei denen noch niemand alt genug eingeteilt ist */
export function ageWarnings(event: EventDetails): AgeWarning[] {
  const warnings: AgeWarning[] = [];
  for (const shift of event.shifts) {
    for (const task of shift.tasks ?? []) {
      if (!task.minAge || task.ageRequirementType !== 'AT_LEAST_ONE') continue;
      const ok = (shift.signups ?? []).some((su) => su.userAge !== null && su.userAge !== undefined && su.userAge >= task.minAge!);
      if (!ok) warnings.push({ shift, task });
    }
  }
  return warnings;
}

/**
 * Ist in der Schicht jemand alt genug für diese Arbeit (oder braucht sie kein Mindestalter)?
 * Wie im Backend zählt bei «mindestens 1 Person» die ganze Schicht, nicht nur die Arbeit.
 */
export function taskHasAdult(shift: ShiftDto, task: ShiftTaskDto): boolean {
  if (!task.minAge) return true;
  return (shift.signups ?? []).some((s) => s.userAge !== null && s.userAge !== undefined && s.userAge >= task.minAge!);
}
