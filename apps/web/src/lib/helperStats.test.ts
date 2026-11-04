import { describe, expect, it } from 'vitest';
import { computeHelperStats, formatMinutes } from './helperStats';
import type { EventDetails } from './types';

describe('formatMinutes', () => {
  it('formatiert Stunden und Minuten', () => {
    expect(formatMinutes(0)).toBe('0h');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(270)).toBe('4h 30m');
  });
});

const signup = (id: string, userId: string | null, name: string, attendance: string | null = null) => ({
  id,
  userId,
  displayName: name,
  guestName: userId ? null : name,
  attendance,
});

function event(): EventDetails {
  return {
    id: 'e1',
    shifts: [
      {
        id: 's1',
        title: 'Bar',
        startTime: '2026-10-17T16:00:00Z',
        endTime: '2026-10-17T20:00:00Z', // 4 h
        isSetupTeardown: false,
        signups: [signup('a', 'u1', 'Anna', 'PRESENT'), signup('b', null, 'Gast Gustav')],
      },
      {
        id: 's2',
        title: 'Aufbau',
        startTime: '2026-10-17T08:00:00Z',
        endTime: '2026-10-17T10:00:00Z', // 2 h
        isSetupTeardown: true,
        signups: [signup('c', 'u1', 'Anna')],
      },
    ],
  } as unknown as EventDetails;
}

describe('computeHelperStats', () => {
  it('summiert Stunden pro Person und trennt Aufbau vom Anlass', () => {
    const { helpers, summary } = computeHelperStats(event(), null);
    const anna = helpers.find((h) => h.userId === 'u1');
    expect(anna?.totalMinutes).toBe(360);
    expect(anna?.eventMinutes).toBe(240);
    expect(anna?.setupMinutes).toBe(120);
    expect(anna?.shiftCount).toBe(2);
    expect(summary.totalHelpers).toBe(2);
    expect(summary.totalMinutes).toBe(360 + 240);
  });

  it('lässt den Aufbau auf Wunsch weg', () => {
    const { helpers } = computeHelperStats(event(), null, { countAttendedOnly: false, includeSetupTeardown: false });
    expect(helpers.find((h) => h.userId === 'u1')?.totalMinutes).toBe(240);
  });

  it('wertet auf Wunsch nur bestätigte Anwesenheiten', () => {
    const { helpers } = computeHelperStats(event(), null, { countAttendedOnly: true, includeSetupTeardown: true });
    expect(helpers.find((h) => h.userId === 'u1')?.totalMinutes).toBe(240); // nur die Bar-Schicht war PRESENT
    expect(helpers.find((h) => h.isGuest)?.totalMinutes ?? 0).toBe(0);
  });
});
