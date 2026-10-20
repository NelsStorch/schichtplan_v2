import { describe, expect, it } from 'vitest';
import { doIntervalsOverlap, formatZurichTime } from './shiftCollision.js';

describe('shiftCollision service', () => {
  describe('doIntervalsOverlap', () => {
    it('erkennt Überschneidungen korrekt', () => {
      // 10:00 - 14:00 und 11:00 - 13:00 (echte Überschneidung)
      expect(
        doIntervalsOverlap(
          '2026-10-24T10:00:00Z',
          '2026-10-24T14:00:00Z',
          '2026-10-24T11:00:00Z',
          '2026-10-24T13:00:00Z'
        )
      ).toBe(true);

      // Exakt gleiche Zeit
      expect(
        doIntervalsOverlap(
          '2026-10-24T10:00:00Z',
          '2026-10-24T12:00:00Z',
          '2026-10-24T10:00:00Z',
          '2026-10-24T12:00:00Z'
        )
      ).toBe(true);

      // Leicht überlappend (1 Minute)
      expect(
        doIntervalsOverlap(
          '2026-10-24T10:00:00Z',
          '2026-10-24T12:01:00Z',
          '2026-10-24T12:00:00Z',
          '2026-10-24T14:00:00Z'
        )
      ).toBe(true);
    });

    it('erkennt nahtlos aneinandergrenzende Schichten NICHT als Kollision', () => {
      // 10:00 - 12:00 und 12:00 - 14:00
      expect(
        doIntervalsOverlap(
          '2026-10-24T10:00:00Z',
          '2026-10-24T12:00:00Z',
          '2026-10-24T12:00:00Z',
          '2026-10-24T14:00:00Z'
        )
      ).toBe(false);

      // 12:00 - 14:00 und 10:00 - 12:00
      expect(
        doIntervalsOverlap(
          '2026-10-24T12:00:00Z',
          '2026-10-24T14:00:00Z',
          '2026-10-24T10:00:00Z',
          '2026-10-24T12:00:00Z'
        )
      ).toBe(false);
    });

    it('erkennt getrennte Schichten ohne Überschneidung', () => {
      // 10:00 - 12:00 und 14:00 - 16:00
      expect(
        doIntervalsOverlap(
          '2026-10-24T10:00:00Z',
          '2026-10-24T12:00:00Z',
          '2026-10-24T14:00:00Z',
          '2026-10-24T16:00:00Z'
        )
      ).toBe(false);
    });
  });

  describe('formatZurichTime', () => {
    it('formatiert Zeitstempel in HH:MM', () => {
      const formatted = formatZurichTime('2026-10-24T10:30:00Z');
      expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});
