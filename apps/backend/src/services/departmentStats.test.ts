import { describe, expect, it } from 'vitest';
import { computeDepartmentStats } from './departmentStats.js';
import type { PrismaClient } from '../db.js';

describe('Abteilungs-Statistiken (computeDepartmentStats)', () => {
  const dummyStufen = [
    { id: 'stufe-1', name: 'Fröschli', sortOrder: 1 },
    { id: 'stufe-2', name: 'Jungschar', sortOrder: 2 },
  ];

  const dummyEvents = [
    {
      id: 'ev-2026-1',
      title: 'Sommerfest 2026',
      slug: 'sommerfest-2026',
      startDate: new Date('2026-06-15T10:00:00Z'),
      endDate: new Date('2026-06-15T18:00:00Z'),
      isPublished: true,
      shifts: [
        {
          id: 's1',
          title: 'Aufbau',
          startTime: new Date('2026-06-15T08:00:00Z'),
          endTime: new Date('2026-06-15T10:00:00Z'), // 120 min = 2 h
          requiredSlots: 2,
          isSetupTeardown: true,
          signups: [
            {
              id: 'sign-1',
              userId: 'u1',
              guestName: null,
              attendance: 'PRESENT',
              user: {
                id: 'u1',
                firstName: 'Robin',
                lastName: 'Muster',
                ceviName: 'Fuchs',
                stufen: [{ stufe: { id: 'stufe-2', name: 'Jungschar' } }],
              },
            },
          ],
        },
        {
          id: 's2',
          title: 'Grill',
          startTime: new Date('2026-06-15T11:00:00Z'),
          endTime: new Date('2026-06-15T14:00:00Z'), // 180 min = 3 h
          requiredSlots: 2,
          isSetupTeardown: false,
          signups: [
            {
              id: 'sign-2',
              userId: 'u1',
              guestName: null,
              attendance: 'PRESENT',
              user: {
                id: 'u1',
                firstName: 'Robin',
                lastName: 'Muster',
                ceviName: 'Fuchs',
                stufen: [{ stufe: { id: 'stufe-2', name: 'Jungschar' } }],
              },
            },
            {
              id: 'sign-3',
              userId: 'u2',
              guestName: null,
              attendance: 'ABSENT',
              user: {
                id: 'u2',
                firstName: 'Anna',
                lastName: 'Keller',
                ceviName: null,
                stufen: [
                  { stufe: { id: 'stufe-1', name: 'Fröschli' } },
                  { stufe: { id: 'stufe-2', name: 'Jungschar' } },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: 'ev-2025-1',
      title: 'Waldweihnacht 2025',
      slug: 'waldweihnacht-2025',
      startDate: new Date('2025-12-10T16:00:00Z'),
      endDate: new Date('2025-12-10T20:00:00Z'),
      isPublished: true,
      shifts: [
        {
          id: 's3',
          title: 'Punsch',
          startTime: new Date('2025-12-10T16:00:00Z'),
          endTime: new Date('2025-12-10T17:00:00Z'), // 60 min = 1 h
          requiredSlots: 1,
          isSetupTeardown: false,
          signups: [
            {
              id: 'sign-4',
              userId: null,
              guestName: 'Herr Meier (Eltern)',
              attendance: 'PRESENT',
              user: null,
            },
          ],
        },
      ],
    },
  ];

  function createMockPrisma() {
    return {
      event: {
        findMany: async () => dummyEvents,
      },
      departmentStufe: {
        findMany: async () => dummyStufen,
      },
    } as unknown as PrismaClient;
  }

  it('berechnet Gesamtstunden und Helfer-Kennzahlen für das Jahr 2026', async () => {
    const prisma = createMockPrisma();
    const stats = await computeDepartmentStats(prisma, 'dept-1', { year: 2026 });

    expect(stats.year).toBe(2026);
    expect(stats.availableYears).toContain(2026);
    expect(stats.availableYears).toContain(2025);

    // 2026: s1 (2h Fuchs) + s2 (3h Fuchs, 3h Anna) = 8 Stunden
    expect(stats.summary.totalHours).toBe(8);
    expect(stats.summary.setupHours).toBe(2);
    expect(stats.summary.eventHours).toBe(6);
    expect(stats.summary.totalHelpers).toBe(2);
    expect(stats.summary.totalEvents).toBe(1);

    // Anwesenheit: 2 Schichten PRESENT (Fuchs: 2h + 3h = 5h), 1 Schicht ABSENT (Anna: 3h)
    expect(stats.summary.attendedHours).toBe(5);
    expect(stats.summary.attendedRatePct).toBeCloseTo(66.7, 1);

    // Top-Helfer
    expect(stats.topHelpers.length).toBe(2);
    expect(stats.topHelpers[0].displayName).toBe('Robin / Fuchs');
    expect(stats.topHelpers[0].hours).toBe(5);
    expect(stats.topHelpers[0].shiftCount).toBe(2);

    expect(stats.topHelpers[1].displayName).toBe('Anna Keller');
    expect(stats.topHelpers[1].hours).toBe(3);

    // Stufen-Verteilung:
    // Fuchs (5h) in Jungschar
    // Anna (3h) je 1.5h in Fröschli & Jungschar
    // Jungschar: 5 + 1.5 = 6.5h
    // Fröschli: 1.5h
    const jungschar = stats.stufen.find((s) => s.id === 'stufe-2');
    const froeschli = stats.stufen.find((s) => s.id === 'stufe-1');
    expect(jungschar?.totalHours).toBe(6.5);
    expect(froeschli?.totalHours).toBe(1.5);
  });

  it('filtert nach nur bestätigten Anwesenheiten', async () => {
    const prisma = createMockPrisma();
    const stats = await computeDepartmentStats(prisma, 'dept-1', {
      year: 2026,
      countAttendedOnly: true,
    });

    // Anna war ABSENT, also nur Fuchs gezählt (5 Stunden)
    expect(stats.summary.totalHours).toBe(5);
    expect(stats.summary.totalHelpers).toBe(1);
    expect(stats.topHelpers.length).toBe(1);
    expect(stats.topHelpers[0].ceviName).toBe('Fuchs');
  });

  it('schliesst Auf-/Abbau aus wenn includeSetupTeardown: false', async () => {
    const prisma = createMockPrisma();
    const stats = await computeDepartmentStats(prisma, 'dept-1', {
      year: 2026,
      includeSetupTeardown: false,
    });

    // s1 (2h Aufbau) wird ignoriert. Nur s2 (3h Fuchs + 3h Anna = 6h)
    expect(stats.summary.totalHours).toBe(6);
    expect(stats.summary.setupHours).toBe(0);
    expect(stats.summary.totalShifts).toBe(1);
    expect(stats.events[0].totalShifts).toBe(1);
  });

  it('unterstützt ALL für alle Jahre inkl. Gästen', async () => {
    const prisma = createMockPrisma();
    const stats = await computeDepartmentStats(prisma, 'dept-1', { year: 'ALL' });

    expect(stats.year).toBe('ALL');
    expect(stats.summary.totalEvents).toBe(2);
    // 8h aus 2026 + 1h aus 2025 = 9h
    expect(stats.summary.totalHours).toBe(9);

    const guestHelper = stats.topHelpers.find((h) => h.isGuest);
    expect(guestHelper).toBeDefined();
    expect(guestHelper?.displayName).toBe('Herr Meier (Eltern)');
    expect(guestHelper?.hours).toBe(1);

    const noStufe = stats.stufen.find((s) => s.id === '__NO_STUFE__');
    expect(noStufe?.totalHours).toBe(1);
  });
});
