export interface ShiftSeriesInterval {
  startTime: Date;
  endTime: Date;
  index: number;
}

export interface CalculateShiftSeriesIntervalsOptions {
  startTime: string | Date;
  endTime: string | Date;
  durationMinutes: number;
  overlapMinutes?: number;
  firstShiftIncludesOverlap?: boolean;
}

/**
 * Berechnet die aufeinanderfolgenden Schicht-Intervalle für eine Serie.
 *
 * Wenn overlapMinutes > 0 ist, beginnen nachfolgende Schichten um overlapMinutes früher,
 * damit die Übergabe nahtlos stattfinden kann.
 *
 * Beispiel: 10:00 bis 14:00 mit 120 Min. Dauer und 15 Min. Überlappung:
 * - Schicht 0: 10:00 – 12:00
 * - Schicht 1: 11:45 – 14:00 (15 Min. Übergabe)
 */
export function calculateShiftSeriesIntervals(
  options: CalculateShiftSeriesIntervalsOptions
): ShiftSeriesInterval[] {
  const start = typeof options.startTime === 'string' ? new Date(options.startTime) : options.startTime;
  const end = typeof options.endTime === 'string' ? new Date(options.endTime) : options.endTime;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const stepMs = Math.max(1, Math.round(options.durationMinutes)) * 60 * 1000;
  const overlapMs = Math.max(0, Math.round(options.overlapMinutes ?? 0)) * 60 * 1000;
  const firstShiftIncludesOverlap = Boolean(options.firstShiftIncludesOverlap);

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs || stepMs <= 0) {
    return [];
  }

  const intervals: ShiftSeriesInterval[] = [];
  let currentBaseStart = startMs;
  let idx = 0;

  // Begrenzung auf maximal 100 Schichten zur Vermeidung von Endlosschleifen
  while (currentBaseStart < endMs && idx < 100) {
    const currentBaseEnd = Math.min(currentBaseStart + stepMs, endMs);

    // Wenn der verbleibende Rest weniger als 15 Minuten beträgt und bereits Schichten existieren,
    // beenden wir die Serie
    if (intervals.length > 0 && currentBaseEnd - currentBaseStart < 15 * 60 * 1000) {
      break;
    }

    const shiftStartMs =
      idx === 0 && !firstShiftIncludesOverlap
        ? currentBaseStart
        : currentBaseStart - overlapMs;

    intervals.push({
      startTime: new Date(shiftStartMs),
      endTime: new Date(currentBaseEnd),
      index: idx,
    });

    currentBaseStart = currentBaseEnd;
    idx++;
  }

  return intervals;
}
