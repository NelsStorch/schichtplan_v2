import { describe, expect, it } from 'vitest';
import { calculateShiftSeriesIntervals } from '@schichtplan/shared';

describe('calculateShiftSeriesIntervals', () => {
  it('generiert gleichmässige Schichten ohne Überlappung (z.B. 10:00 bis 22:00 à 2h)', () => {
    const intervals = calculateShiftSeriesIntervals({
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T22:00:00.000Z',
      durationMinutes: 120,
      overlapMinutes: 0,
    });

    expect(intervals).toHaveLength(6);
    expect(intervals[0].startTime.toISOString()).toBe('2026-10-24T10:00:00.000Z');
    expect(intervals[0].endTime.toISOString()).toBe('2026-10-24T12:00:00.000Z');

    expect(intervals[1].startTime.toISOString()).toBe('2026-10-24T12:00:00.000Z');
    expect(intervals[1].endTime.toISOString()).toBe('2026-10-24T14:00:00.000Z');

    expect(intervals[5].startTime.toISOString()).toBe('2026-10-24T20:00:00.000Z');
    expect(intervals[5].endTime.toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });

  it('generiert Schichten mit 15 Minuten Übergabe-Überlappung', () => {
    const intervals = calculateShiftSeriesIntervals({
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T14:00:00.000Z',
      durationMinutes: 120,
      overlapMinutes: 15,
      firstShiftIncludesOverlap: false,
    });

    expect(intervals).toHaveLength(2);
    // 1. Schicht beginnt zur vollen Zeit (10:00 bis 12:00)
    expect(intervals[0].startTime.toISOString()).toBe('2026-10-24T10:00:00.000Z');
    expect(intervals[0].endTime.toISOString()).toBe('2026-10-24T12:00:00.000Z');

    // 2. Schicht beginnt 15 Min. früher (11:45 bis 14:00)
    expect(intervals[1].startTime.toISOString()).toBe('2026-10-24T11:45:00.000Z');
    expect(intervals[1].endTime.toISOString()).toBe('2026-10-24T14:00:00.000Z');
  });

  it('berücksichtigt firstShiftIncludesOverlap wenn aktiviert', () => {
    const intervals = calculateShiftSeriesIntervals({
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T12:00:00.000Z',
      durationMinutes: 120,
      overlapMinutes: 15,
      firstShiftIncludesOverlap: true,
    });

    expect(intervals).toHaveLength(1);
    expect(intervals[0].startTime.toISOString()).toBe('2026-10-24T09:45:00.000Z');
    expect(intervals[0].endTime.toISOString()).toBe('2026-10-24T12:00:00.000Z');
  });

  it('verwirft winzige Rest-Fragmente unter 15 Minuten', () => {
    const intervals = calculateShiftSeriesIntervals({
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T12:05:00.000Z', // 2h 5min
      durationMinutes: 120,
      overlapMinutes: 0,
    });

    // 120 Min ergibt 1 Schicht, die verbleibenden 5 Minuten werden nicht als eigenständige Schicht angehängt
    expect(intervals).toHaveLength(1);
    expect(intervals[0].startTime.toISOString()).toBe('2026-10-24T10:00:00.000Z');
    expect(intervals[0].endTime.toISOString()).toBe('2026-10-24T12:00:00.000Z');
  });

  it('gibt leeres Array bei ungültigen Zeiten zurück', () => {
    expect(
      calculateShiftSeriesIntervals({
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T10:00:00.000Z',
        durationMinutes: 120,
      })
    ).toEqual([]);

    expect(
      calculateShiftSeriesIntervals({
        startTime: 'invalid',
        endTime: '2026-10-24T10:00:00.000Z',
        durationMinutes: 120,
      })
    ).toEqual([]);
  });
});
