import { describe, expect, it } from 'vitest';
import { isTokenAvailableNow, tokenAvailableFrom } from './cateringTokens.js';

describe('cateringTokens', () => {
  const shiftStart = new Date('2026-06-20T14:00:00Z');

  describe('tokenAvailableFrom', () => {
    it('berechnet den Beginn des Kulanzfensters anhand von earlyHours', () => {
      const from2h = tokenAvailableFrom(shiftStart, 2);
      expect(from2h.toISOString()).toBe('2026-06-20T12:00:00.000Z');

      const from0h = tokenAvailableFrom(shiftStart, 0);
      expect(from0h.toISOString()).toBe('2026-06-20T14:00:00.000Z');
    });
  });

  describe('isTokenAvailableNow', () => {
    it('ist verfügbar wenn Helfer bereits als PRESENT eingecheckt ist', () => {
      // 5 Stunden vor Schichtbeginn
      const wayEarlier = new Date('2026-06-20T09:00:00Z');
      expect(isTokenAvailableNow(shiftStart, 'PRESENT', 2, wayEarlier)).toBe(true);
    });

    it('ist verfügbar wenn die aktuelle Zeit innerhalb des Kulanzfensters liegt', () => {
      // 1.5 Stunden vor Schichtbeginn bei 2h Kulanz
      const inWindow = new Date('2026-06-20T12:30:00Z');
      expect(isTokenAvailableNow(shiftStart, null, 2, inWindow)).toBe(true);
    });

    it('ist nicht verfügbar vor dem Kulanzfenster ohne PRESENT-Status', () => {
      // 3 Stunden vor Schichtbeginn bei 2h Kulanz
      const tooEarly = new Date('2026-06-20T11:00:00Z');
      expect(isTokenAvailableNow(shiftStart, null, 2, tooEarly)).toBe(false);
    });

    it('ist exakt auf die Minute des Kulanzbeginns verfügbar', () => {
      const exactStart = new Date('2026-06-20T12:00:00Z');
      expect(isTokenAvailableNow(shiftStart, null, 2, exactStart)).toBe(true);
    });
  });
});
