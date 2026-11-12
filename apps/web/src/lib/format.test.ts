import { describe, expect, it } from 'vitest';
import {
  dayKeyToIso,
  fmtDateRange,
  fmtDayMonth,
  fmtDuration,
  fmtFullDate,
  fmtRelativeDay,
  fmtShortDate,
  fmtShortWeekday,
  fmtStand,
  fmtTime,
  fmtWeekday,
  groupByBusinessDay,
  hoursBetween,
  isPast,
  shiftName,
} from './format';

describe('Zeitanzeige in Schweizer Zeit', () => {
  it('rechnet UTC im Sommer und im Winter korrekt um', () => {
    expect(fmtTime('2026-07-01T16:00:00Z')).toBe('18:00'); // MESZ = UTC+2
    expect(fmtTime('2026-01-15T16:00:00Z')).toBe('17:00'); // MEZ = UTC+1
  });

  it('formatiert Dauern', () => {
    expect(fmtDuration('2026-07-01T16:00:00Z', '2026-07-01T20:00:00Z')).toBe('4 h');
    expect(fmtDuration('2026-07-01T16:00:00Z', '2026-07-01T20:30:00Z')).toBe('4 h 30');
    expect(fmtDuration('2026-07-01T16:00:00Z', '2026-07-01T16:45:00Z')).toBe('45 min');
    expect(fmtDuration('2026-07-01T20:00:00Z', '2026-07-01T16:00:00Z')).toBe('0 min');
    expect(hoursBetween('2026-07-01T16:00:00Z', '2026-07-01T17:30:00Z')).toBe(1.5);
  });
});

describe('Tage eines Anlasses', () => {
  it('fasst einen Anlass über mehrere Tage zusammen', () => {
    expect(fmtDateRange('2026-10-16T16:00:00Z', '2026-10-18T12:00:00Z')).toBe('16.10. bis 18. Oktober 2026');
  });

  it('zeigt einen eintägigen Anlass nur einmal', () => {
    expect(fmtDateRange('2026-10-16T08:00:00Z', '2026-10-16T14:00:00Z')).toBe('16. Oktober 2026');
  });

  it('rechnet Schichten nach Mitternacht zum selben Geschäftstag, wenn der Tageswechsel später liegt', () => {
    // 23:30 und 00:30 Schweizer Zeit: mit Tageswechsel 04:00 ein Geschäftstag, mit 00:00 zwei
    const items = [{ startTime: '2026-10-17T21:30:00Z' }, { startTime: '2026-10-17T22:30:00Z' }];
    const withCutoff = groupByBusinessDay(items, '04:00');
    expect(withCutoff).toHaveLength(1);
    expect(withCutoff[0].items).toHaveLength(2);
    expect(groupByBusinessDay(items, '00:00')).toHaveLength(2);
    expect(groupByBusinessDay(items)).toHaveLength(1); // Standard-Tageswechsel ist 04:00
  });

  it('beschreibt Tage relativ', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    expect(fmtRelativeDay('2026-10-17T18:00:00Z', now)).toBe('heute');
    expect(fmtRelativeDay('2026-10-18T10:00:00Z', now)).toBe('morgen');
    expect(fmtRelativeDay('2026-10-16T10:00:00Z', now)).toBe('gestern');
    expect(fmtRelativeDay('2026-10-22T10:00:00Z', now)).toBe('in 5 Tagen');
    expect(fmtRelativeDay('2026-10-14T10:00:00Z', now)).toBe('vor 3 Tagen');
  });
});

describe('shiftName', () => {
  const times = { startTime: '2026-10-17T16:00:00Z', endTime: '2026-10-17T20:00:00Z' };

  it('nimmt den Titel, wenn einer gesetzt ist', () => {
    expect(shiftName({ title: 'Bar', ...times })).toBe('Bar');
  });

  it('zeigt ohne Titel die Zeitspanne statt «null»', () => {
    expect(shiftName({ title: null, ...times })).toBe('18:00–22:00');
    expect(shiftName({ title: '   ', ...times })).toBe('18:00–22:00');
    expect(shiftName({ ...times })).not.toContain('null');
  });
});

describe('Datumsformate und Wochentage', () => {
  it('formatiert Wochentage auf Deutsch (Schweiz)', () => {
    // 2026-10-17 ist ein Samstag
    expect(fmtWeekday('2026-10-17T12:00:00Z')).toBe('Samstag');
    expect(fmtShortWeekday('2026-10-17T12:00:00Z')).toBe('Sa');
  });

  it('formatiert Datumsangaben', () => {
    expect(fmtDayMonth('2026-10-17T12:00:00Z')).toBe('17. Oktober');
    expect(fmtShortDate('2026-10-17T12:00:00Z')).toBe('17.10.');
    expect(fmtFullDate('2026-10-17T12:00:00Z')).toBe('17. Oktober 2026');
  });

  it('erzeugt ISO-Mittagszeitpunkt aus einem Datumsschlüssel', () => {
    expect(dayKeyToIso('2026-10-17')).toBe('2026-10-17T12:00:00Z');
  });
});

describe('fmtStand', () => {
  it('formatiert Zeitstempel von heute, gestern und älteren Tagen', () => {
    const today = new Date();
    expect(fmtStand(today)).toContain('Heute,');
    expect(fmtStand(today)).toContain('Uhr');

    const yesterday = new Date(Date.now() - 86_400_000);
    expect(fmtStand(yesterday)).toContain('Gestern,');

    const older = new Date('2020-01-15T13:30:00Z');
    expect(fmtStand(older)).toContain('15.01.,');
  });

  it('gibt leere Zeichenkette bei ungültigem Datum zurück', () => {
    expect(fmtStand('ungültiges-datum')).toBe('');
  });
});

describe('isPast', () => {
  it('erkennt vergangene und zukünftige Zeitpunkte', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isPast(past)).toBe(true);
    expect(isPast(future)).toBe(false);
  });
});
