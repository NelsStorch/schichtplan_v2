import type { AttendanceStatus, EventRosterResponseDto } from '@schichtplan/shared';
import { downloadCsv } from '@/lib/exportFile';
import { fmtShortWeekday, fmtTimeRange, shiftName } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

export interface HelperShiftInfo {
  shiftId: string;
  signupId: string;
  title: string | null;
  taskTitle: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isSetupTeardown: boolean;
  attendance: AttendanceStatus | null;
}

export interface HelperPersonStat {
  key: string;
  userId: string | null;
  displayName: string;
  firstName?: string;
  lastName?: string;
  nickname?: string | null;
  ceviName?: string | null;
  subName?: string | null;
  departmentName?: string | null;
  stufen: string[];
  age?: number | null;
  isGuest: boolean;
  guestEmail?: string | null;
  guestPhone?: string | null;
  shifts: HelperShiftInfo[];

  // Berechnete Zeiten (relevant gemäss Filter)
  totalMinutes: number;
  totalHours: number;
  formattedTime: string;

  // Trennung Anlass vs. Auf-/Abbau
  eventMinutes: number;
  eventHours: number;
  setupMinutes: number;
  setupHours: number;

  // Anwesenheiten
  attendedMinutes: number;
  attendedHours: number;
  attendedShiftCount: number;
  shiftCount: number;
}

export interface HelperStatsConfig {
  /** Nur bestätigte Anwesenheiten ('PRESENT') werten */
  countAttendedOnly: boolean;
  /** Auf- und Abbau-Schichten einbeziehen */
  includeSetupTeardown: boolean;
}

export const DEFAULT_HELPER_STATS_CONFIG: HelperStatsConfig = {
  countAttendedOnly: false,
  includeSetupTeardown: true,
};

export interface HelperStatsSummary {
  totalHelpers: number;
  activeHelpers: number;
  totalShifts: number;
  totalMinutes: number;
  totalHours: number;
  totalSetupHours: number;
  totalEventHours: number;
  avgHoursPerHelper: number;
}

export interface HelperStufenStat {
  name: string;
  helperCount: number;
  totalMinutes: number;
  totalHours: number;
  formattedTime: string;
  shiftCount: number;
  avgHoursPerHelper: number;
  percentageOfTotal: number;
  helpers: { displayName: string; hours: number; ceviName?: string | null; shiftCount: number }[];
}

/** Formatiert Minuten lesbar, z. B. "4h 30m" oder "2h" */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0 && mins === 0) return '0h';
  if (mins === 0) return `${hours}h`;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/** Berechnet die Helferstunden-Statistik für J+S und Jahresbericht */
export function computeHelperStats(
  event: EventDetails,
  roster: EventRosterResponseDto | null,
  config: HelperStatsConfig = DEFAULT_HELPER_STATS_CONFIG
): {
  helpers: HelperPersonStat[];
  summary: HelperStatsSummary;
} {
  const helpersMap = new Map<string, HelperPersonStat>();

  // 1. Schichten durchgehen und Signups einsammeln
  for (const shift of event.shifts) {
    const startMs = new Date(shift.startTime).getTime();
    const endMs = new Date(shift.endTime).getTime();
    const durationMinutes = Math.max(0, Math.round((endMs - startMs) / (60 * 1000)));

    for (const su of shift.signups ?? []) {
      const isGuest = !su.userId;
      const key = su.userId ? `user:${su.userId}` : `guest:${su.guestName || su.id}`;

      let helper = helpersMap.get(key);
      if (!helper) {
        helper = {
          key,
          userId: su.userId ?? null,
          displayName: su.displayName,
          firstName: su.userFirstName ?? undefined,
          lastName: su.userLastName ?? undefined,
          nickname: su.userCeviName ?? null,
          ceviName: su.userCeviName ?? null,
          subName: isGuest
            ? 'Gast, vom OK eingetragen'
            : su.userCeviName
              ? `${su.userFirstName || ''} ${su.userLastName || ''}`.trim()
              : null,
          departmentName: null,
          stufen: [],
          age: su.userAge ?? null,
          isGuest,
          guestEmail: su.guestEmail ?? null,
          guestPhone: su.guestPhone ?? null,
          shifts: [],
          totalMinutes: 0,
          totalHours: 0,
          formattedTime: '0h',
          eventMinutes: 0,
          eventHours: 0,
          setupMinutes: 0,
          setupHours: 0,
          attendedMinutes: 0,
          attendedHours: 0,
          attendedShiftCount: 0,
          shiftCount: 0,
        };
        helpersMap.set(key, helper);
      }

      helper.shifts.push({
        shiftId: shift.id,
        signupId: su.id,
        title: shift.title,
        taskTitle: su.taskTitle ?? null,
        startTime: shift.startTime,
        endTime: shift.endTime,
        durationMinutes,
        isSetupTeardown: Boolean(shift.isSetupTeardown),
        attendance: su.attendance ?? null,
      });
    }

    // 1b. Schichtleitungen einbeziehen (auch wenn ohne regulären Helfer-Slot eingeteilt)
    for (const resp of shift.responsibles ?? []) {
      const key = `user:${resp.id}`;
      let helper = helpersMap.get(key);
      if (!helper) {
        helper = {
          key,
          userId: resp.id,
          displayName: resp.displayName,
          firstName: resp.firstName,
          lastName: resp.lastName ?? undefined,
          nickname: resp.nickname ?? resp.ceviName ?? null,
          ceviName: resp.nickname ?? resp.ceviName ?? null,
          subName: (resp.nickname ?? resp.ceviName)
            ? `${resp.firstName} ${resp.lastName || ''}`.trim()
            : null,
          departmentName: null,
          stufen: [],
          age: null,
          isGuest: false,
          guestEmail: resp.email ?? null,
          guestPhone: resp.phone ?? null,
          shifts: [],
          totalMinutes: 0,
          totalHours: 0,
          formattedTime: '0h',
          eventMinutes: 0,
          eventHours: 0,
          setupMinutes: 0,
          setupHours: 0,
          attendedMinutes: 0,
          attendedHours: 0,
          attendedShiftCount: 0,
          shiftCount: 0,
        };
        helpersMap.set(key, helper);
      }

      // Falls die Person nicht schon über ein reguläres Signup für diese Schicht erfasst ist
      const alreadyHasShift = helper.shifts.some((s) => s.shiftId === shift.id);
      if (!alreadyHasShift) {
        helper.shifts.push({
          shiftId: shift.id,
          signupId: `lead-${shift.id}-${resp.id}`,
          title: shift.title,
          taskTitle: 'Schichtleitung',
          startTime: shift.startTime,
          endTime: shift.endTime,
          durationMinutes,
          isSetupTeardown: Boolean(shift.isSetupTeardown),
          attendance: 'PRESENT',
        });
      }
    }
  }

  // 2. Roster-Informationen anreichern (Stufe, Abteilung, Alter)
  if (roster?.items) {
    for (const item of roster.items) {
      const key = `user:${item.userId}`;
      const helper = helpersMap.get(key);
      if (helper) {
        helper.departmentName = item.departmentName ?? helper.departmentName;
        helper.stufen = item.stufen?.map((s) => s.name) ?? helper.stufen;
        helper.age = item.age ?? helper.age;
        if (item.nickname || item.ceviName) {
          helper.nickname = item.nickname ?? item.ceviName;
          helper.ceviName = item.nickname ?? item.ceviName;
        }
        if (item.firstName) helper.firstName = item.firstName;
        if (item.lastName) helper.lastName = item.lastName;
      }
    }
  }

  // 3. Stunden pro Helfer berechnen
  const helpersList: HelperPersonStat[] = [];
  let sumMinutes = 0;
  let sumSetupMinutes = 0;
  let sumEventMinutes = 0;
  let sumShifts = 0;
  let activeHelpersCount = 0;

  for (const helper of helpersMap.values()) {
    let relevantMinutes = 0;
    let setupMin = 0;
    let eventMin = 0;
    let attendedMin = 0;
    let attendedCount = 0;

    for (const shift of helper.shifts) {
      if (shift.isSetupTeardown) {
        setupMin += shift.durationMinutes;
      } else {
        eventMin += shift.durationMinutes;
      }

      if (shift.attendance === 'PRESENT') {
        attendedMin += shift.durationMinutes;
        attendedCount++;
      }

      // Prüfen, ob Schicht für die Auswertung zählt
      if (config.countAttendedOnly && shift.attendance !== 'PRESENT') {
        continue;
      }
      if (!config.includeSetupTeardown && shift.isSetupTeardown) {
        continue;
      }

      relevantMinutes += shift.durationMinutes;
    }

    helper.totalMinutes = relevantMinutes;
    helper.totalHours = Math.round((relevantMinutes / 60) * 10) / 10;
    helper.formattedTime = formatMinutes(relevantMinutes);
    helper.eventMinutes = eventMin;
    helper.eventHours = Math.round((eventMin / 60) * 10) / 10;
    helper.setupMinutes = setupMin;
    helper.setupHours = Math.round((setupMin / 60) * 10) / 10;
    helper.attendedMinutes = attendedMin;
    helper.attendedHours = Math.round((attendedMin / 60) * 10) / 10;
    helper.attendedShiftCount = attendedCount;
    helper.shiftCount = helper.shifts.length;

    if (relevantMinutes > 0) {
      activeHelpersCount++;
    }

    sumMinutes += relevantMinutes;
    sumSetupMinutes += setupMin;
    sumEventMinutes += eventMin;
    sumShifts += helper.shifts.length;

    helpersList.push(helper);
  }

  // Sortierung: Nach Gesamtstunden absteigend, dann nach Name
  helpersList.sort((a, b) => b.totalMinutes - a.totalMinutes || a.displayName.localeCompare(b.displayName, 'de'));

  const totalHours = Math.round((sumMinutes / 60) * 10) / 10;
  const avgHoursPerHelper =
    activeHelpersCount > 0 ? Math.round((totalHours / activeHelpersCount) * 10) / 10 : 0;

  const summary: HelperStatsSummary = {
    totalHelpers: helpersList.length,
    activeHelpers: activeHelpersCount,
    totalShifts: sumShifts,
    totalMinutes: sumMinutes,
    totalHours,
    totalSetupHours: Math.round((sumSetupMinutes / 60) * 10) / 10,
    totalEventHours: Math.round((sumEventMinutes / 60) * 10) / 10,
    avgHoursPerHelper,
  };

  return { helpers: helpersList, summary };
}

/** Berechnet die Stufen-Rangliste für einen Anlass */
export function computeStufenStats(
  helpers: HelperPersonStat[],
  summary: HelperStatsSummary
): HelperStufenStat[] {
  const map = new Map<
    string,
    {
      helperKeys: Set<string>;
      totalMinutes: number;
      shiftCount: number;
      helpersMap: Map<string, { displayName: string; hours: number; ceviName?: string | null; shiftCount: number }>;
    }
  >();

  for (const h of helpers) {
    if (h.totalMinutes <= 0) continue;

    // Wenn Person keine Stufe hat: unter "Ohne Stufe / Gäste" erfassen
    const stufenNames = h.stufen.length > 0 ? h.stufen : ['Ohne Stufe / Gäste'];

    for (const stufe of stufenNames) {
      let entry = map.get(stufe);
      if (!entry) {
        entry = {
          helperKeys: new Set(),
          totalMinutes: 0,
          shiftCount: 0,
          helpersMap: new Map(),
        };
        map.set(stufe, entry);
      }

      entry.helperKeys.add(h.key);
      entry.totalMinutes += h.totalMinutes;
      entry.shiftCount += h.shiftCount;

      const existingH = entry.helpersMap.get(h.key);
      if (!existingH) {
        entry.helpersMap.set(h.key, {
          displayName: h.displayName,
          hours: h.totalHours,
          ceviName: h.ceviName,
          shiftCount: h.shiftCount,
        });
      }
    }
  }

  const result: HelperStufenStat[] = [];
  const totalEventMinutes = Math.max(1, summary.totalMinutes);

  for (const [name, data] of map.entries()) {
    const totalHours = Math.round((data.totalMinutes / 60) * 10) / 10;
    const helperCount = data.helperKeys.size;
    const avgHours = helperCount > 0 ? Math.round((totalHours / helperCount) * 10) / 10 : 0;
    const percentage = Math.min(100, Math.round((data.totalMinutes / totalEventMinutes) * 100));

    const helperList = Array.from(data.helpersMap.values()).sort((a, b) => b.hours - a.hours);

    result.push({
      name,
      helperCount,
      totalMinutes: data.totalMinutes,
      totalHours,
      formattedTime: formatMinutes(data.totalMinutes),
      shiftCount: data.shiftCount,
      avgHoursPerHelper: avgHours,
      percentageOfTotal: percentage,
      helpers: helperList,
    });
  }

  // Sortierung: Nach Gesamtstunden absteigend
  result.sort((a, b) => b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name, 'de'));

  return result;
}

/** Exportiert die Helferstunden-Statistik als Excel-CSV */
export function exportHelperHoursCsv(
  eventSlug: string,
  helpers: HelperPersonStat[],
  summary: HelperStatsSummary
) {
  const rows: (string | number)[][] = [
    [
      'Name',
      'Vorname',
      'Nachname',
      'Cevi-Name',
      'Abteilung',
      'Stufe',
      'Alter',
      'Typ',
      'E-Mail',
      'Telefon',
      'Anzahl Schichten',
      'Gesamtstunden (Dezimal)',
      'Gesamtzeit',
      'Anlass-Stunden',
      'Auf-/Abbau-Stunden',
      'Eingeteilte Schichten',
    ],
  ];

  for (const h of helpers) {
    const shiftDetails = h.shifts
      .map(
        (s) =>
          `${shiftName(s)}${s.taskTitle ? ` (${s.taskTitle})` : ''} ${fmtShortWeekday(s.startTime)} ${fmtTimeRange(s.startTime, s.endTime)}`
      )
      .join(' | ');

    rows.push([
      h.displayName,
      h.firstName ?? '',
      h.lastName ?? '',
      h.ceviName ?? '',
      h.departmentName ?? '',
      h.stufen.join(', '),
      h.age ?? '',
      h.isGuest ? 'Gast' : 'Konto',
      h.guestEmail ?? '',
      h.guestPhone ?? '',
      h.shiftCount,
      h.totalHours,
      h.formattedTime,
      h.eventHours,
      h.setupHours,
      shiftDetails,
    ]);
  }

  // Leerzeile + Zusammenfassungszeile
  rows.push([]);
  rows.push([
    'TOTAL / ZUSAMMENFASSUNG',
    '',
    '',
    '',
    '',
    '',
    '',
    `${summary.activeHelpers} aktive Helfende`,
    '',
    '',
    summary.totalShifts,
    summary.totalHours,
    formatMinutes(summary.totalMinutes),
    summary.totalEventHours,
    summary.totalSetupHours,
    `Durchschnitt: ${summary.avgHoursPerHelper} Std./Person`,
  ]);

  downloadCsv(`helferstunden-${eventSlug}.csv`, rows);
}

/** Exportiert die Stufen-Rangliste als Excel-CSV */
export function exportStufenRankingCsv(
  eventSlug: string,
  stufen: HelperStufenStat[],
  summary: HelperStatsSummary
) {
  const rows: (string | number)[][] = [
    [
      'Rang',
      'Stufe / Gruppe',
      'Helfende Personen',
      'Gesamtstunden (Dezimal)',
      'Gesamtzeit',
      'Anteil (%)',
      'Schicht-Einsätze',
      'Durchschnitt (Std./Person)',
      'Helfende (mit Stunden)',
    ],
  ];

  stufen.forEach((s, idx) => {
    const helperListText = s.helpers
      .map((h) => `${h.displayName}${h.ceviName ? ` (${h.ceviName})` : ''}: ${h.hours}h`)
      .join(' | ');

    rows.push([
      idx + 1,
      s.name,
      s.helperCount,
      s.totalHours,
      s.formattedTime,
      `${s.percentageOfTotal}%`,
      s.shiftCount,
      s.avgHoursPerHelper,
      helperListText,
    ]);
  });

  rows.push([]);
  rows.push([
    'TOTAL',
    '',
    summary.activeHelpers,
    summary.totalHours,
    formatMinutes(summary.totalMinutes),
    '100%',
    summary.totalShifts,
    summary.avgHoursPerHelper,
    '',
  ]);

  downloadCsv(`stufen-rangliste-${eventSlug}.csv`, rows);
}
