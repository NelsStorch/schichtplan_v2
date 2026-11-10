import {
  formatMinutes,
  type DepartmentEventStatDto,
  type DepartmentStatsResponseDto,
  type DepartmentStatsSummaryDto,
  type DepartmentStufeStatDto,
  type DepartmentTopHelperDto,
} from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';

export interface DepartmentStatsOptions {
  year?: number | 'ALL';
  countAttendedOnly?: boolean;
  includeSetupTeardown?: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Berechnet die Jahres- und Gesamtauswertungen für eine Abteilung:
 * - Gesamtstunden (inkl. Aufteilung Anlass vs. Auf-/Abbau)
 * - Kennzahlen aller Anlässe
 * - Stufen-Beteiligung
 * - Fleissigste Helfende (Ehrentafel für die Generalversammlung / GV)
 */
export async function computeDepartmentStats(
  prisma: PrismaClient,
  departmentId: string,
  options: DepartmentStatsOptions = {}
): Promise<DepartmentStatsResponseDto> {
  const currentYear = new Date().getFullYear();
  const selectedYear = options.year ?? currentYear;
  const countAttendedOnly = options.countAttendedOnly ?? false;
  const includeSetupTeardown = options.includeSetupTeardown ?? true;

  // 1. Alle Anlässe mit Schichten, Anmeldungen und Stufenzuordnung laden
  const [allEvents, departmentStufen] = await Promise.all([
    prisma.event.findMany({
      where: { departmentId },
      select: {
        id: true,
        title: true,
        slug: true,
        startDate: true,
        endDate: true,
        isPublished: true,
        shifts: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            requiredSlots: true,
            isSetupTeardown: true,
            signups: {
              select: {
                id: true,
                userId: true,
                guestName: true,
                attendance: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    nickname: true,
                    stufen: {
                      where: { stufe: { departmentId } },
                      select: { stufe: { select: { id: true, name: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    }),
    prisma.departmentStufe.findMany({
      where: { departmentId },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  // 2. Verfügbare Jahre ermitteln
  const yearSet = new Set<number>();
  yearSet.add(currentYear);
  for (const ev of allEvents) {
    yearSet.add(ev.startDate.getFullYear());
  }
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  // 3. Nach gewähltem Jahr filtern
  const events = selectedYear === 'ALL'
    ? allEvents
    : allEvents.filter((ev) => ev.startDate.getFullYear() === selectedYear);

  // 4. Helfer-Aggregation
  interface HelperAcc {
    userId: string | null;
    displayName: string;
    firstName: string;
    lastName: string | null;
    nickname: string | null;
    ceviName: string | null;
    isGuest: boolean;
    stufen: Set<string>;
    minutes: number;
    shiftCount: number;
    attendedShiftCount: number;
    eventsSet: Set<string>;
  }

  const helpersMap = new Map<string, HelperAcc>();

  // Stufen-Minuten Map (Stufen-ID -> { name, minutes, helperIds, shiftCount })
  const stufenStatsMap = new Map<string, { id: string; name: string; minutes: number; helperKeys: Set<string>; shiftCount: number }>();
  for (const st of departmentStufen) {
    stufenStatsMap.set(st.id, {
      id: st.id,
      name: st.name,
      minutes: 0,
      helperKeys: new Set(),
      shiftCount: 0,
    });
  }
  // Pseudo-Kategorie für Helfende ohne Stufe (z. B. Gäste oder Eltern)
  const noStufeKey = '__NO_STUFE__';
  stufenStatsMap.set(noStufeKey, {
    id: noStufeKey,
    name: 'Ohne Stufe / Gäste',
    minutes: 0,
    helperKeys: new Set(),
    shiftCount: 0,
  });

  let totalMinutes = 0;
  let totalSetupMinutes = 0;
  let totalEventMinutes = 0;
  let attendedMinutes = 0;
  let totalRequiredSlots = 0;
  let totalFilledSlots = 0;
  let totalShiftsCount = 0;
  let totalSignupsCount = 0;
  let totalAttendedSignupsCount = 0;

  // 5. Anlässe auswerten
  const eventStatsList: DepartmentEventStatDto[] = [];

  for (const ev of events) {
    let evMinutes = 0;
    let evSetupMinutes = 0;
    let evEventMinutes = 0;
    let evAttendedMinutes = 0;
    let evRequiredSlots = 0;
    let evFilledSlots = 0;
    let evSignupsCount = 0;
    let evAttendedSignupsCount = 0;
    const evHelperKeys = new Set<string>();

    totalShiftsCount += ev.shifts.length;

    for (const shift of ev.shifts) {
      const isSetup = Boolean(shift.isSetupTeardown);
      if (!includeSetupTeardown && isSetup) {
        continue;
      }

      const durationMin = Math.max(0, Math.round((shift.endTime.getTime() - shift.startTime.getTime()) / 60000));
      evRequiredSlots += shift.requiredSlots;
      totalRequiredSlots += shift.requiredSlots;

      for (const signup of shift.signups) {
        evFilledSlots += 1;
        totalFilledSlots += 1;
        evSignupsCount += 1;
        totalSignupsCount += 1;

        const isPresent = signup.attendance === 'PRESENT';
        if (isPresent) {
          evAttendedSignupsCount += 1;
          totalAttendedSignupsCount += 1;
          evAttendedMinutes += durationMin;
          attendedMinutes += durationMin;
        }

        // Wenn Filter "nur bestätigte Anwesenheiten" aktiv ist und die Person nicht da war:
        if (countAttendedOnly && !isPresent) {
          continue;
        }

        evMinutes += durationMin;
        totalMinutes += durationMin;
        if (isSetup) {
          evSetupMinutes += durationMin;
          totalSetupMinutes += durationMin;
        } else {
          evEventMinutes += durationMin;
          totalEventMinutes += durationMin;
        }

        // Helper erfassen
        const isGuest = !signup.userId;
        const helperKey = signup.userId || `guest:${(signup.guestName || 'Gast').toLowerCase().trim()}`;
        evHelperKeys.add(helperKey);

        let h = helpersMap.get(helperKey);
        if (!h) {
          const user = signup.user;
          const nickname = user?.nickname ?? (user as { ceviName?: string | null })?.ceviName ?? null;
          const dispName = user
            ? nickname ? `${user.firstName} / ${nickname}` : `${user.firstName} ${user.lastName || ''}`.trim()
            : signup.guestName || 'Gast';

          h = {
            userId: signup.userId || null,
            displayName: dispName,
            firstName: user ? user.firstName : signup.guestName || 'Gast',
            lastName: user ? user.lastName : null,
            nickname,
            ceviName: nickname,
            isGuest,
            stufen: new Set(),
            minutes: 0,
            shiftCount: 0,
            attendedShiftCount: 0,
            eventsSet: new Set(),
          };

          if (user?.stufen) {
            for (const ust of user.stufen) {
              h.stufen.add(ust.stufe.name);
            }
          }
          helpersMap.set(helperKey, h);
        }

        h.minutes += durationMin;
        h.shiftCount += 1;
        if (isPresent) h.attendedShiftCount += 1;
        h.eventsSet.add(ev.id);

        // Stufen-Zuordnung
        const userStufen = signup.user?.stufen;
        if (userStufen && userStufen.length > 0) {
          // Gleichmässig auf die Stufen der Person aufteilen, falls in mehreren
          const share = durationMin / userStufen.length;
          for (const ust of userStufen) {
            const entry = stufenStatsMap.get(ust.stufe.id);
            if (entry) {
              entry.minutes += share;
              entry.shiftCount += 1;
              entry.helperKeys.add(helperKey);
            }
          }
        } else {
          const noStufe = stufenStatsMap.get(noStufeKey)!;
          noStufe.minutes += durationMin;
          noStufe.shiftCount += 1;
          noStufe.helperKeys.add(helperKey);
        }
      }
    }

    const evFillRate = evRequiredSlots > 0 ? round1((evFilledSlots / evRequiredSlots) * 100) : 100;
    const evAttendedRate = evSignupsCount > 0 ? round1((evAttendedSignupsCount / evSignupsCount) * 100) : 0;

    eventStatsList.push({
      id: ev.id,
      title: ev.title,
      slug: ev.slug,
      startDate: ev.startDate.toISOString(),
      endDate: ev.endDate.toISOString(),
      isPublished: ev.isPublished,
      helpersCount: evHelperKeys.size,
      totalShifts: ev.shifts.length,
      totalSlots: evRequiredSlots,
      filledSlots: evFilledSlots,
      fillRatePct: evFillRate,
      totalHours: round1(evMinutes / 60),
      totalMinutes: evMinutes,
      attendedHours: round1(evAttendedMinutes / 60),
      attendedRatePct: evAttendedRate,
      setupHours: round1(evSetupMinutes / 60),
      eventHours: round1(evEventMinutes / 60),
    });
  }

  // 6. Summary berechnen
  const totalHelpersCount = helpersMap.size;
  const fillRatePct = totalRequiredSlots > 0 ? round1((totalFilledSlots / totalRequiredSlots) * 100) : 100;
  const attendedRatePct = totalSignupsCount > 0 ? round1((totalAttendedSignupsCount / totalSignupsCount) * 100) : 0;
  const avgHours = totalHelpersCount > 0 ? round1(totalMinutes / 60 / totalHelpersCount) : 0;

  const summary: DepartmentStatsSummaryDto = {
    totalHours: round1(totalMinutes / 60),
    totalMinutes,
    formattedTime: formatMinutes(totalMinutes),
    totalHelpers: totalHelpersCount,
    totalShifts: totalShiftsCount,
    totalEvents: events.length,
    totalRequiredSlots,
    totalFilledSlots,
    fillRatePct,
    attendedHours: round1(attendedMinutes / 60),
    attendedRatePct,
    setupHours: round1(totalSetupMinutes / 60),
    eventHours: round1(totalEventMinutes / 60),
    averageHoursPerHelper: avgHours,
  };

  // 7. Stufen-Statistik formatieren
  const stufenStatsList: DepartmentStufeStatDto[] = Array.from(stufenStatsMap.values())
    .filter((s) => s.minutes > 0 || s.id !== noStufeKey)
    .map((s) => ({
      id: s.id,
      name: s.name,
      helpersCount: s.helperKeys.size,
      totalHours: round1(s.minutes / 60),
      totalMinutes: Math.round(s.minutes),
      totalShifts: s.shiftCount,
      percentageOfTotal: totalMinutes > 0 ? round1((s.minutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  // 8. Top-Helfende sortieren
  const topHelpersList: DepartmentTopHelperDto[] = Array.from(helpersMap.values())
    .map((h) => ({
      userId: h.userId,
      displayName: h.displayName,
      firstName: h.firstName,
      lastName: h.lastName,
      nickname: h.nickname,
      ceviName: h.ceviName,
      hours: round1(h.minutes / 60),
      minutes: h.minutes,
      formattedTime: formatMinutes(h.minutes),
      shiftCount: h.shiftCount,
      eventCount: h.eventsSet.size,
      attendedShiftCount: h.attendedShiftCount,
      stufen: Array.from(h.stufen),
      isGuest: h.isGuest,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    year: selectedYear,
    availableYears,
    filter: {
      countAttendedOnly,
      includeSetupTeardown,
    },
    summary,
    events: eventStatsList,
    stufen: stufenStatsList,
    topHelpers: topHelpersList,
  };
}
