import { describe, expect, it } from 'vitest';
import { fmtDateRange, fmtDuration, fmtRelativeDay, fmtTime, groupByBusinessDay, hoursBetween } from './format';

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
