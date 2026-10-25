import { describe, it, expect } from 'vitest';
import {
  formatZurichDateTime,
  formatZurichTime,
  formatZurichDate,
  toZurichInput,
  zurichInputToIso,
  isSignupTimeOpen,
  SIGNUP_OPEN_GRACE_MS,
  addDaysToDayKey,
  ageAt,
  businessDayKey,
  cancelDeadlineAt,
  cancelDeadlineText,
  dayKeyDiff,
  formatDays,
  formatZurichTimeRange,
  parseDayCutoffMinutes,
  zurichDateTime,
  zurichDayKey,
  zurichTimeKey,
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

describe('Schweizer Kalendertage und Alter', () => {
  it('liest Tag und Uhrzeit in Schweizer Zeit, nicht in Server-Zeit', () => {
    // 00:30 MESZ am 13.06. = 22:30 UTC am 12.06.
    expect(zurichDayKey('2026-06-12T22:30:00.000Z')).toBe('2026-06-13');
    expect(zurichTimeKey('2026-06-12T22:30:00.000Z')).toBe('00:30');
    expect(zurichDateTime('2026-06-13', '00:30').toISOString()).toBe('2026-06-12T22:30:00.000Z');
    // Winterzeit: 18:00 MEZ = 17:00 UTC
    expect(zurichDateTime('2026-12-05', '18:00').toISOString()).toBe('2026-12-05T17:00:00.000Z');
  });

  it('rechnet mit YYYY-MM-DD über Monats- und Jahresgrenzen', () => {
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayKeyDiff('2026-10-24', '2026-10-31')).toBe(7);
  });

  it('rechnet das Alter am Schweizer Kalendertag der Schicht', () => {
    const birth = new Date('2008-06-13T00:00:00.000Z');
    // Schicht um 00:30 am 18. Geburtstag (= 22:30 UTC am Vortag): schon 18
    expect(ageAt(birth, '2026-06-12T22:30:00.000Z')).toBe(18);
    // Abend davor: noch 17
    expect(ageAt('2008-06-13', '2026-06-12T20:00:00.000Z')).toBe(17);
    expect(ageAt(null, '2026-06-12T20:00:00.000Z')).toBeNull();
  });

  it('setzt die Austrage-Sperre auf Kalendertage, gleiche Uhrzeit über die Zeitumstellung', () => {
    // Beginn Sa 31.10.2026 18:00 MEZ (17:00 UTC), 7 Tage vorher = Sa 24.10. 18:00 MESZ (16:00 UTC)
    expect(cancelDeadlineAt('2026-10-31T17:00:00.000Z', 7).toISOString()).toBe('2026-10-24T16:00:00.000Z');
    expect(cancelDeadlineText(new Date('2026-10-24T16:00:00.000Z'), 7)).toBe(
      'seit dem 24.10.2026 um 18:00 Uhr (7 Tage vor Anlassbeginn)'
    );
    expect(cancelDeadlineText(new Date(), 0)).toBe('seit Anlassbeginn');
    expect(formatDays(1)).toBe('1 Tag');
  });

  it('ordnet Nachtschichten mit der Tageswechsel-Uhrzeit inkl. Minuten dem Vortag zu', () => {
    // 04:15 MESZ am Sonntag
    const iso = '2026-06-14T02:15:00.000Z';
    expect(businessDayKey(iso, '04:00')).toBe('2026-06-14');
    expect(businessDayKey(iso, '04:30')).toBe('2026-06-13');
    expect(businessDayKey(iso, 'kaputt')).toBe('2026-06-14');
    expect(parseDayCutoffMinutes('05:45')).toBe(345);
  });

  it('schreibt Zeitspannen einheitlich', () => {
    expect(formatZurichTimeRange('2026-06-13T16:00:00.000Z', '2026-06-13T20:00:00.000Z')).toBe('18:00–22:00');
  });
});
