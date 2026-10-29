import { describe, expect, it } from 'vitest';
import {
  calculateShiftSeriesIntervals,
  CreateShiftSeriesSchema,
  CreateShiftSchema,
} from '@schichtplan/shared';

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

describe('CreateShiftSeriesSchema & CreateShiftSchema optional title', () => {
  it('erlaubt leeren Schichttitel und setzt Standardwert null', () => {
    const parsedSeries = CreateShiftSeriesSchema.parse({
      eventId: '11111111-1111-4111-8111-111111111111',
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T18:00:00.000Z',
      durationMinutes: 120,
      tasks: [
        {
          title: 'Grillieren',
          requiredSlots: 2,
        },
      ],
    });

    expect(parsedSeries.title).toBe(null);
    expect(parsedSeries.tasks).toHaveLength(1);
    expect(parsedSeries.tasks![0].title).toBe('Grillieren');
    expect(parsedSeries.tasks![0].requiredSlots).toBe(2);

    const parsedShift = CreateShiftSchema.parse({
      eventId: '11111111-1111-4111-8111-111111111111',
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T12:00:00.000Z',
      tasks: [
        {
          title: 'Kasse',
          requiredSlots: 1,
        },
      ],
    });

    expect(parsedShift.title).toBe(null);
    expect(parsedShift.tasks![0].title).toBe('Kasse');
  });

  it('unterstützt mehrere Arbeiten in der Schicht-Serie', () => {
    const parsed = CreateShiftSeriesSchema.parse({
      eventId: '11111111-1111-4111-8111-111111111111',
      title: 'Grillstand',
      startTime: '2026-10-24T10:00:00.000Z',
      endTime: '2026-10-24T18:00:00.000Z',
      durationMinutes: 120,
      overlapMinutes: 15,
      tasks: [
        {
          title: 'Grillieren',
          requiredSlots: 2,
          minAge: 16,
          description: 'Grill bedienen und Würste braten',
        },
        {
          title: 'Kasse',
          requiredSlots: 1,
          minAge: 18,
          description: 'Kassieren und Abrechnen',
        },
      ],
    });

    expect(parsed.title).toBe('Grillstand');
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks![0].title).toBe('Grillieren');
    expect(parsed.tasks![0].requiredSlots).toBe(2);
    expect(parsed.tasks![0].minAge).toBe(16);
    expect(parsed.tasks![1].title).toBe('Kasse');
    expect(parsed.tasks![1].requiredSlots).toBe(1);
    expect(parsed.tasks![1].minAge).toBe(18);
  });
});
