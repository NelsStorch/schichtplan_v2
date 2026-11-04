import { describe, it, expect } from 'vitest';
import { isTokenAvailableNow, availableFromTime } from './cateringTokens.js';

describe('cateringTokens service', () => {
  const shiftStart = new Date('2026-08-29T18:00:00.000Z');

  it('berechnet den frühesten Einlösezeitpunkt anhand der Kulanz-Stunden', () => {
    const from = availableFromTime(shiftStart, 2);
    expect(from.toISOString()).toBe('2026-08-29T16:00:00.000Z');
  });

  it('gibt bei "Immer gültig" (earlyHours = -1) sofort frei, unabhängig vom Schichtbeginn', () => {
    expect(
      isTokenAvailableNow({
        shiftStartTime: shiftStart,
        earlyHours: -1,
        attendance: null,
        now: new Date('2026-08-01T10:00:00.000Z'),
      })
    ).toBe(true);
  });

  it('erlaubt das Einlösen sofort, wenn die Person bereits als PRESENT eingecheckt ist', () => {
    const wayBeforeShift = new Date('2026-08-29T08:00:00.000Z');
    expect(
      isTokenAvailableNow({
        shiftStartTime: shiftStart,
        earlyHours: 2,
        attendance: 'PRESENT',
        now: wayBeforeShift,
      })
    ).toBe(true);
  });

  it('blockiert das Einlösen vor dem Kulanz-Fenster, wenn noch nicht eingecheckt', () => {
    const beforeWindow = new Date('2026-08-29T15:59:59.000Z');
    expect(
      isTokenAvailableNow({
        shiftStartTime: shiftStart,
        earlyHours: 2,
        attendance: null,
        now: beforeWindow,
      })
    ).toBe(false);
  });

  it('erlaubt das Einlösen ab Beginn des Kulanz-Fensters auch ohne Check-in', () => {
    const atWindowStart = new Date('2026-08-29T16:00:00.000Z');
    expect(
      isTokenAvailableNow({
        shiftStartTime: shiftStart,
        earlyHours: 2,
        attendance: null,
        now: atWindowStart,
      })
    ).toBe(true);
  });
});
