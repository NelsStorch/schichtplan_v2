import type { AttendanceStatus, EventRosterResponseDto } from '@schichtplan/shared';
import { downloadCsv } from '@/lib/exportFile';
import { fmtShortWeekday, fmtTime } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

export interface HelperShiftInfo {
  shiftId: string;
  signupId: string;
  title: string;
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
  setupMinutes: number;

  // Anwesenheiten
  attendedMinutes: number;
  attendedShiftCount: number;
  shiftCount: number;

  // Auswertung Bons & Geschenke
  bonCount: number;
  tshirtEligible: boolean;
}

export interface HelperStatsConfig {
  /** 'HOURS' = 1 Bon pro X Stunden, 'SHIFTS' = 1 Bon pro geleistete Schicht */
  bonCalculationMode: 'HOURS' | 'SHIFTS';
  /** Stunden für 1 Bon (Standard: 3) */
  hoursPerBon: number;
  /** Mindeststunden für Helfergeschenk / T-Shirt (Standard: 4) */
  tshirtMinHours: number;
  /** Nur bestätigte Anwesenheiten ('ATTENDED') zählen */
  countAttendedOnly: boolean;
  /** Auf- und Abbau-Schichten einbeziehen */
  includeSetupTeardown: boolean;
}

export const DEFAULT_HELPER_STATS_CONFIG: HelperStatsConfig = {
  bonCalculationMode: 'HOURS',
  hoursPerBon: 3,
  tshirtMinHours: 4,
  countAttendedOnly: false,
  includeSetupTeardown: true,
};

export interface HelperStatsSummary {
  totalHelpers: number;
  activeHelpers: number;
  totalMinutes: number;
  totalHours: number;
  totalSetupHours: number;
  totalEventHours: number;
  avgHoursPerHelper: number;
  totalBons: number;
  totalTshirts: number;
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

/** Berechnet die Helferstunden, Bons und T-Shirt-Ansprüche */
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
          ceviName: su.userCeviName ?? null,
          subName: isGuest ? 'Gast, vom OK eingetragen' : su.userCeviName ? `${su.userFirstName || ''} ${su.userLastName || ''}`.trim() : null,
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
          setupMinutes: 0,
          attendedMinutes: 0,
          attendedShiftCount: 0,
          shiftCount: 0,
          bonCount: 0,
          tshirtEligible: false,
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
        if (item.ceviName) helper.ceviName = item.ceviName;
        if (item.firstName) helper.firstName = item.firstName;
        if (item.lastName) helper.lastName = item.lastName;
      }
    }
  }

  // 3. Stunden, Bons & Kriterien pro Helfer berechnen
  const helpersList: HelperPersonStat[] = [];
  let sumMinutes = 0;
  let sumSetupMinutes = 0;
  let sumEventMinutes = 0;
  let sumBons = 0;
  let sumTshirts = 0;
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
    helper.setupMinutes = setupMin;
    helper.attendedMinutes = attendedMin;
    helper.attendedShiftCount = attendedCount;
    helper.shiftCount = helper.shifts.length;

    // Bons berechnen
    if (config.bonCalculationMode === 'HOURS') {
      const hPerBon = Math.max(0.5, config.hoursPerBon || 3);
      helper.bonCount = Math.floor(relevantMinutes / (hPerBon * 60));
    } else {
      // Pro Schicht
      const qualifyingShifts = helper.shifts.filter((s) => {
        if (config.countAttendedOnly && s.attendance !== 'PRESENT') return false;
        if (!config.includeSetupTeardown && s.isSetupTeardown) return false;
        return true;
      });
      helper.bonCount = qualifyingShifts.length;
    }

    // T-Shirt / Helfergeschenk
    const tshirtMinMinutes = (config.tshirtMinHours || 4) * 60;
    helper.tshirtEligible = relevantMinutes >= tshirtMinMinutes;

    if (relevantMinutes > 0) {
      activeHelpersCount++;
    }

    sumMinutes += relevantMinutes;
    sumSetupMinutes += setupMin;
    sumEventMinutes += eventMin;
    sumBons += helper.bonCount;
    if (helper.tshirtEligible) sumTshirts++;

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
    totalMinutes: sumMinutes,
    totalHours,
    totalSetupHours: Math.round((sumSetupMinutes / 60) * 10) / 10,
    totalEventHours: Math.round((sumEventMinutes / 60) * 10) / 10,
    avgHoursPerHelper,
    totalBons: sumBons,
    totalTshirts: sumTshirts,
  };

  return { helpers: helpersList, summary };
}

/** Exportiert die Helferstunden und Bon-Auswertung als Excel-CSV */
export function exportHelperHoursCsv(
  eventSlug: string,
  helpers: HelperPersonStat[],
  summary: HelperStatsSummary,
  config: HelperStatsConfig
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
      `Verpflegungsbons (${config.bonCalculationMode === 'HOURS' ? `je ${config.hoursPerBon}h` : 'pro Schicht'})`,
      `Helfergeschenk/T-Shirt (ab ${config.tshirtMinHours}h)`,
      'Eingeteilte Schichten',
    ],
  ];

  for (const h of helpers) {
    const shiftDetails = h.shifts
      .map(
        (s) =>
          `${s.title}${s.taskTitle ? ` (${s.taskTitle})` : ''} ${fmtShortWeekday(s.startTime)} ${fmtTime(s.startTime)}-${fmtTime(s.endTime)}`
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
      Math.round((h.eventMinutes / 60) * 10) / 10,
      Math.round((h.setupMinutes / 60) * 10) / 10,
      h.bonCount,
      h.tshirtEligible ? 'Ja' : 'Nein',
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
    '',
    summary.totalHours,
    formatMinutes(summary.totalMinutes),
    summary.totalEventHours,
    summary.totalSetupHours,
    summary.totalBons,
    summary.totalTshirts,
    `Durchschnitt: ${summary.avgHoursPerHelper} Std./Person`,
  ]);

  downloadCsv(`helferstunden-bons-${eventSlug}.csv`, rows);
}
