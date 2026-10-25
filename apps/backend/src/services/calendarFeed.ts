import crypto from 'node:crypto';
import type { PrismaClient } from '../db.js';
import { toZurichInput } from '@schichtplan/shared';

export interface CalendarShiftItem {
  uid: string;
  shiftId: string;
  title: string;
  category: string | null;
  description: string | null;
  taskTitle: string | null;
  startTime: Date;
  endTime: Date;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  isResponsible: boolean;
  responsibleRole: string | null;
}

export interface BuildFeedOptions {
  userDisplayName?: string | null;
  shifts: CalendarShiftItem[];
  domain?: string;
}

/** Formatiert ein Date im iCal-UTC-Format YYYYMMDDTHHmmssZ */
export function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escaped Sonderzeichen für iCal-Textfelder gemäss RFC 5545 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Faltet iCal-Zeilen auf maximal 75 Bytes gemäss RFC 5545 §3.1 */
export function foldIcsLine(line: string): string {
  const maxBytes = 75;
  if (Buffer.byteLength(line, 'utf8') <= maxBytes) return line;

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (currentBytes + charBytes > maxBytes) {
      chunks.push(current);
      current = ' ' + char;
      currentBytes = 1 + charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }

  if (current) chunks.push(current);
  return chunks.join('\r\n');
}

/** Erzeugt einen sicheren, zufälligen Token für den persönlichen Kalenderfeed */
export function generateCalendarToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** Ermittelt oder erstellt den Kalender-Token eines Benutzers */
export async function getOrCreateCalendarToken(
  prisma: PrismaClient,
  userId: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarToken: true },
  });

  if (user?.calendarToken) {
    return user.calendarToken;
  }

  const token = generateCalendarToken();
  await prisma.user.update({
    where: { id: userId },
    data: { calendarToken: token },
  });

  return token;
}

/** Erneuert den Kalender-Token (ungültigmachen alter Abos) */
export async function resetCalendarToken(
  prisma: PrismaClient,
  userId: string
): Promise<string> {
  const token = generateCalendarToken();
  await prisma.user.update({
    where: { id: userId },
    data: { calendarToken: token },
  });
  return token;
}

/** Holt alle Einsätze (Schichten, Schichtleitung, Tagesleitung) eines Benutzers ab einem bestimmten Datum */
export async function getUserCalendarShifts(
  prisma: PrismaClient,
  userId: string,
  fromDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
): Promise<CalendarShiftItem[]> {
  const [signups, shiftResp, dayResp] = await Promise.all([
    prisma.shiftSignup.findMany({
      where: {
        userId,
        shift: {
          endTime: { gte: fromDate },
        },
      },
      include: {
        task: { select: { id: true, title: true } },
        shift: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                department: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    }),
    prisma.shiftResponsible.findMany({
      where: {
        userId,
        shift: {
          endTime: { gte: fromDate },
        },
      },
      include: {
        shift: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                department: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    }),
    prisma.eventDayResponsible.findMany({
      where: {
        userId,
        event: {
          endDate: { gte: fromDate },
        },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: { select: { name: true, slug: true } },
            shifts: {
              where: {
                endTime: { gte: fromDate },
              },
            },
          },
        },
      },
    }),
  ]);

  const map = new Map<string, CalendarShiftItem>();

  for (const su of signups) {
    map.set(su.shift.id, {
      uid: `shift-${su.shift.id}-${userId}@cevi-schichtplan.ch`,
      shiftId: su.shift.id,
      title: su.shift.title,
      category: su.shift.category,
      description: su.shift.description,
      taskTitle: su.task?.title || null,
      startTime: su.shift.startTime,
      endTime: su.shift.endTime,
      eventId: su.shift.event.id,
      eventTitle: su.shift.event.title,
      eventSlug: su.shift.event.slug,
      departmentName: su.shift.event.department.name,
      departmentSlug: su.shift.event.department.slug,
      isResponsible: false,
      responsibleRole: null,
    });
  }

  for (const sr of shiftResp) {
    const existing = map.get(sr.shift.id);
    if (existing) {
      existing.isResponsible = true;
      existing.responsibleRole = 'Schichtleitung';
    } else {
      map.set(sr.shift.id, {
        uid: `shift-${sr.shift.id}-${userId}@cevi-schichtplan.ch`,
        shiftId: sr.shift.id,
        title: sr.shift.title,
        category: sr.shift.category,
        description: sr.shift.description,
        taskTitle: null,
        startTime: sr.shift.startTime,
        endTime: sr.shift.endTime,
        eventId: sr.shift.event.id,
        eventTitle: sr.shift.event.title,
        eventSlug: sr.shift.event.slug,
        departmentName: sr.shift.event.department.name,
        departmentSlug: sr.shift.event.department.slug,
        isResponsible: true,
        responsibleRole: 'Schichtleitung',
      });
    }
  }

  for (const dr of dayResp) {
    for (const s of dr.event.shifts) {
      const shiftDate = toZurichInput(s.startTime).slice(0, 10);
      if (shiftDate === dr.dayDate) {
        const existing = map.get(s.id);
        if (existing) {
          existing.isResponsible = true;
          existing.responsibleRole = existing.responsibleRole
            ? `${existing.responsibleRole} & Tagesleitung`
            : 'Tagesleitung';
        } else {
          map.set(s.id, {
            uid: `shift-${s.id}-${userId}@cevi-schichtplan.ch`,
            shiftId: s.id,
            title: s.title,
            category: s.category,
            description: s.description,
            taskTitle: null,
            startTime: s.startTime,
            endTime: s.endTime,
            eventId: dr.event.id,
            eventTitle: dr.event.title,
            eventSlug: dr.event.slug,
            departmentName: dr.event.department.name,
            departmentSlug: dr.event.department.slug,
            isResponsible: true,
            responsibleRole: 'Tagesleitung',
          });
        }
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );
}

/**
 * Erzeugt einen gültigen RFC 5545 iCalendar-Feed für Webcal / Kalender-Abonnements.
 */
export function buildIcsFeed(options: BuildFeedOptions): string {
  const { userDisplayName, shifts, domain = 'cevi-schichtplan.ch' } = options;
  const nowUtc = formatIcsUtc(new Date());
  const calName = userDisplayName
    ? `Cevi Schichtplan (${userDisplayName})`
    : 'Cevi Schichtplan';

  const rawLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cevi Schichtplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
    'X-WR-TIMEZONE:Europe/Zurich',
    'X-PUBLISHED-TTL:PT2H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
  ];

  for (const s of shifts) {
    const rolePrefix = s.isResponsible ? `[${s.responsibleRole || 'Leitung'}] ` : '';
    const taskSuffix = s.taskTitle && s.taskTitle !== s.title ? ` (${s.taskTitle})` : '';
    const summary = `${rolePrefix}${s.title}${taskSuffix} · ${s.eventTitle}`;

    const hostDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const isLocal = hostDomain.includes('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(hostDomain);
    const eventUrl = isLocal
      ? `http://${hostDomain}/events/${s.eventSlug}`
      : `https://${s.departmentSlug}.${hostDomain}/events/${s.eventSlug}`;

    const descParts = [
      s.isResponsible ? `Rolle: ${s.responsibleRole || 'Leitung'}` : null,
      s.taskTitle && s.taskTitle !== s.title ? `Aufgabe: ${s.taskTitle}` : null,
      s.category ? `Kategorie: ${s.category}` : null,
      s.description,
      `Anlass: ${s.eventTitle}`,
      `Abteilung: ${s.departmentName}`,
      `Link: ${eventUrl}`,
    ].filter(Boolean) as string[];

    const description = descParts.join('\n');

    rawLines.push(
      'BEGIN:VEVENT',
      `UID:${s.uid}`,
      `DTSTAMP:${nowUtc}`,
      `DTSTART:${formatIcsUtc(s.startTime)}`,
      `DTEND:${formatIcsUtc(s.endTime)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `LOCATION:${escapeIcsText(s.departmentName)}`,
      `URL:${eventUrl}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`Erinnerung: ${summary}`)}`,
      'END:VALARM',
      'END:VEVENT'
    );
  }

  rawLines.push('END:VCALENDAR');

  return rawLines.map(foldIcsLine).join('\r\n') + '\r\n';
}
