import { describe, it, expect } from 'vitest';
import {
  formatZurichDateTime,
  formatZurichTime,
  formatZurichDate,
  toZurichInput,
  zurichInputToIso,
  isSignupTimeOpen,
  SIGNUP_OPEN_GRACE_MS,
} from '@schichtplan/shared';

describe('Timezone helpers (Europe/Zurich)', () => {
  it('formatiert Sommerzeit (MESZ UTC+2) korrekt', () => {
    // 14:30 MESZ = 12:30 UTC
    const utcIso = '2026-06-15T12:30:00.000Z';
    expect(formatZurichDateTime(utcIso)).toBe('15.06.2026 um 14:30 Uhr');
    expect(formatZurichTime(utcIso)).toBe('14:30');
    expect(formatZurichDate(utcIso)).toBe('15.06.2026');
    expect(toZurichInput(utcIso)).toBe('2026-06-15T14:30');
    expect(zurichInputToIso('2026-06-15T14:30')).toBe('2026-06-15T12:30:00.000Z');
  });

  it('formatiert Winterzeit (MEZ UTC+1) korrekt', () => {
    // 14:30 MEZ = 13:30 UTC
    const utcIso = '2026-12-15T13:30:00.000Z';
    expect(formatZurichDateTime(utcIso)).toBe('15.12.2026 um 14:30 Uhr');
    expect(formatZurichTime(utcIso)).toBe('14:30');
    expect(formatZurichDate(utcIso)).toBe('15.12.2026');
    expect(toZurichInput(utcIso)).toBe('2026-12-15T14:30');
    expect(zurichInputToIso('2026-12-15T14:30')).toBe('2026-12-15T13:30:00.000Z');
  });

  it('funktioniert an den Zeitumstellungstagen nahtlos', () => {
    // Letzter Sonntag im März 2026 (Umstellung auf Sommerzeit)
    expect(toZurichInput(zurichInputToIso('2026-03-29T10:00'))).toBe('2026-03-29T10:00');
    // Letzter Sonntag im Oktober 2026 (Umstellung auf Winterzeit)
    expect(toZurichInput(zurichInputToIso('2026-10-25T10:00'))).toBe('2026-10-25T10:00');
  });

  it('handhabt leere oder ungültige Werte sicher', () => {
    expect(formatZurichDateTime(null)).toBe('');
    expect(formatZurichTime(undefined)).toBe('');
    expect(formatZurichDate('')).toBe('');
    expect(toZurichInput(null)).toBe('');
    expect(zurichInputToIso('')).toBeNull();
    expect(zurichInputToIso('ungueltig')).toBeNull();
  });

  describe('isSignupTimeOpen', () => {
    it('ist immer wahr, wenn kein Zeitpunkt gesetzt ist', () => {
      expect(isSignupTimeOpen(null)).toBe(true);
      expect(isSignupTimeOpen(undefined)).toBe(true);
    });

    it('erkennt vergangene Zeitpunkte als offen', () => {
      const past = new Date(Date.now() - 10000);
      expect(isSignupTimeOpen(past)).toBe(true);
    });

    it('erkennt zukünftige Zeitpunkte als gesperrt', () => {
      const farFuture = new Date(Date.now() + 60000);
      expect(isSignupTimeOpen(farFuture)).toBe(false);
    });

    it('gewährt 2 Sekunden Kulanz bei minimaler Uhrenabweichung', () => {
      // 1 Sekunde in der Zukunft: fällt ins 2s-Kulanzfenster
      const slightlyFuture = new Date(Date.now() + 1000);
      expect(isSignupTimeOpen(slightlyFuture)).toBe(true);

      // 5 Sekunden in der Zukunft: ausserhalb des Kulanzfensters
      const futureBeyondGrace = new Date(Date.now() + 5000);
      expect(isSignupTimeOpen(futureBeyondGrace)).toBe(false);
    });
  });
});
