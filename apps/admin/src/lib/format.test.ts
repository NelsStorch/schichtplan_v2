import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, formatBirthDate, formatLastSeen, fullName } from './format';

describe('format (Admin)', () => {
  it('zeigt Geburtsdaten ohne Zeitzonen-Verschiebung', () => {
    expect(formatBirthDate('2008-03-09')).toBe('09.03.2008');
  });

  it('zeigt «Zuletzt aktiv» als heute, gestern oder Datum (Schweizer Kalendertag)', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    expect(formatLastSeen(null, now)).toBe('noch nie');
    expect(formatLastSeen('2026-06-15', now)).toBe('heute');
    expect(formatLastSeen('2026-06-14', now)).toBe('gestern');
    expect(formatLastSeen('2026-06-01', now)).toBe('01.06.2026');
  });

  it('rechnet das Alter am Schweizer Kalendertag', () => {
    expect(ageFromBirthDate('2000-06-15', new Date('2026-06-15T10:00:00Z'))).toBe(26);
    expect(ageFromBirthDate('2000-06-16', new Date('2026-06-15T10:00:00Z'))).toBe(25);
  });

  it('lässt den Platzhalter-Nachnamen «(Helfer)» weg', () => {
    expect(fullName({ firstName: 'Anna', lastName: '(Helfer)', ceviName: 'Fuchs' })).toBe('Anna');
    expect(fullName({ firstName: 'Anna', lastName: 'Muster', ceviName: null })).toBe('Anna Muster');
  });
});
