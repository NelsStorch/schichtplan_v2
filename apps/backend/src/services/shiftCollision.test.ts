import { describe, expect, it } from 'vitest';
import { doIntervalsOverlap, hasShiftCollision, formatZurichTime } from './shiftCollision.js';

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
    });
  });

  describe('hasShiftCollision mit Übergabe-Toleranz', () => {
    it('erlaubt Übergabeüberlappung innerhalb der Toleranz', () => {
      // Schicht 1: 08:00 - 11:00, Schicht 2: 10:45 - 14:00 (15 Min. Überlappung)
      // Bei Toleranz 15 Min. -> KEINE Kollision
      expect(
        hasShiftCollision(
          '2026-10-24T08:00:00Z',
          '2026-10-24T11:00:00Z',
          '2026-10-24T10:45:00Z',
          '2026-10-24T14:00:00Z',
          15
        )
      ).toBe(false);

      // Schicht 3: 13:45 - 17:00, Schicht 4: 16:50 - 20:00 (10 Min. Überlappung)
      // Bei Toleranz 15 Min. -> KEINE Kollision
      expect(
        hasShiftCollision(
          '2026-10-24T13:45:00Z',
          '2026-10-24T17:00:00Z',
          '2026-10-24T16:50:00Z',
          '2026-10-24T20:00:00Z',
          15
        )
      ).toBe(false);
    });

    it('blockiert Überschreitung der Toleranz', () => {
      // 30 Min. Überlappung bei 15 Min. Toleranz -> KOLLISION
      expect(
        hasShiftCollision(
          '2026-10-24T08:00:00Z',
          '2026-10-24T11:00:00Z',
          '2026-10-24T10:30:00Z',
          '2026-10-24T14:00:00Z',
          15
        )
      ).toBe(true);

      // 15 Min. Überlappung bei 10 Min. Toleranz -> KOLLISION
      expect(
        hasShiftCollision(
          '2026-10-24T08:00:00Z',
          '2026-10-24T11:00:00Z',
          '2026-10-24T10:45:00Z',
          '2026-10-24T14:00:00Z',
          10
        )
      ).toBe(true);
    });

    it('blockiert vollständig verschachtelte Schichten trotz Toleranz', () => {
      // Schicht B (10:00 - 10:10 = 10 Min) liegt komplett in Schicht A (09:00 - 12:00)
      // Das ist kein Übergang, sondern echte Doppelbelegung -> KOLLISION
      expect(
        hasShiftCollision(
          '2026-10-24T09:00:00Z',
          '2026-10-24T12:00:00Z',
          '2026-10-24T10:00:00Z',
          '2026-10-24T10:10:00Z',
          15
        )
      ).toBe(true);

      // Umgekehrte Reihenfolge der Argumente
      expect(
        hasShiftCollision(
          '2026-10-24T10:00:00Z',
          '2026-10-24T10:10:00Z',
          '2026-10-24T09:00:00Z',
          '2026-10-24T12:00:00Z',
          15
        )
      ).toBe(true);
    });
  });

  describe('formatZurichTime', () => {
    it('formatiert Zeitstempel in HH:MM', () => {
      const formatted = formatZurichTime('2026-10-24T10:30:00Z');
      expect(formatted).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});
