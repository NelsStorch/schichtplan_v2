import type { PrismaClient } from '../generated/prisma/client.js';
import { shiftDisplayTitle } from './shiftDto.js';
import type { ShiftTimeCollision } from '@schichtplan/shared';

export interface CollisionCheckOptions {
  shiftId: string;
  startTime: Date;
  endTime: Date;
  eventId: string;
  userId?: string | null;
  guestName?: string | null;
  overlapToleranceMinutes?: number;
}

/**
 * Prüft, ob sich zwei halboffene Zeitintervalle [startA, endA) und [startB, endB) überschneiden.
 * Berühren sich die Zeiten nur (z. B. 10:00-12:00 und 12:00-14:00), liegt keine Überschneidung vor.
 */
export function doIntervalsOverlap(
  startA: Date | string | number,
  endA: Date | string | number,
  startB: Date | string | number,
  endB: Date | string | number
): boolean {
  return hasShiftCollision(startA, endA, startB, endB, 0);
}

/**
 * Berechnet, ob zwei Schichten kollidieren unter Berücksichtigung eines Übergabe-Toleranzfensters.
 * - Berühren sich die Zeiten nur (z. B. 10:00-12:00 und 12:00-14:00), ist es keine Kollision (0 Min Überlappung).
 * - Liegt eine Schicht komplett in der anderen (Verschachtelung), ist es IMMER eine Kollision (kein Übergang).
 * - Überlappen sie sich um höchstens `toleranceMinutes` (z. B. 15 Min), ist es als Übergabe erlaubt.
 * - Übersteigt die Überlappung `toleranceMinutes`, ist es eine Kollision.
 */
export function hasShiftCollision(
  startA: Date | string | number,
  endA: Date | string | number,
  startB: Date | string | number,
  endB: Date | string | number,
  toleranceMinutes = 0
): boolean {
  const sA = new Date(startA).getTime();
  const eA = new Date(endA).getTime();
  const sB = new Date(startB).getTime();
  const eB = new Date(endB).getTime();

  // Keine Überlappung (höchstens Berührung am Rand)
  if (sA >= eB || sB >= eA) {
    return false;
  }

  // Verschachtelung: Liegt eine Schicht komplett innerhalb der anderen?
  // Das ist kein Übergang von Schicht A nach Schicht B, sondern eine parallele Doppelbelegung.
  const isNested = (sA <= sB && eA >= eB) || (sB <= sA && eB >= eA);
  if (isNested) {
    return true;
  }

  // Überlappungszeit in Minuten
  const overlapMs = Math.min(eA, eB) - Math.max(sA, sB);
  const overlapMinutes = overlapMs / (60 * 1000);

  return overlapMinutes > toleranceMinutes;
}

/** HH:MM in Schweizer Zeit (gemeinsame Hilfe aus @schichtplan/shared) */
export { formatZurichTime } from '@schichtplan/shared';

/**
 * Findet alle aktiven Eintragungen einer Person (oder eines Gastes im selben Event),
 * die zeitlich mit dem Fenster [startTime, endTime) der Schicht kollidieren.
 * Berücksichtigt das Übergabe-Toleranzfenster des Anlasses (z. B. 15 Minuten).
 */
export async function findShiftCollisions(
  prisma: PrismaClient,
  options: CollisionCheckOptions
): Promise<ShiftTimeCollision[]> {
  const { shiftId, startTime, endTime, eventId, userId, guestName } = options;

  let tolerance = options.overlapToleranceMinutes;
  if (tolerance === undefined) {
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: { overlapToleranceMinutes: true },
    });
    tolerance = ev?.overlapToleranceMinutes ?? 15;
  }

  if (userId) {
    const signups = await prisma.shiftSignup.findMany({
      where: {
        userId,
        shift: {
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
      include: {
        shift: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        shift: { startTime: 'asc' },
      },
    });

    const filtered = signups.filter((s) => {
      if (s.shift.id === shiftId) return true; // Gleiche Schicht = doppelte Eintragung
      return hasShiftCollision(startTime, endTime, s.shift.startTime, s.shift.endTime, tolerance);
    });

    return filtered.map((s) => ({
      signupId: s.id,
      shiftId: s.shift.id,
      shiftTitle: shiftDisplayTitle(s.shift, s.task),
      taskTitle: s.task?.title || null,
      startTime: s.shift.startTime.toISOString(),
      endTime: s.shift.endTime.toISOString(),
      sameShift: s.shift.id === shiftId,
    }));
  }

  if (guestName && guestName.trim().length > 0) {
    const trimmed = guestName.trim();
    const signups = await prisma.shiftSignup.findMany({
      where: {
        shift: {
          eventId,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        guestName: { equals: trimmed, mode: 'insensitive' },
      },
      include: {
        shift: {
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        shift: { startTime: 'asc' },
      },
    });

    const filtered = signups.filter((s) => {
      if (s.shift.id === shiftId) return true;
      return hasShiftCollision(startTime, endTime, s.shift.startTime, s.shift.endTime, tolerance);
    });

    return filtered.map((s) => ({
      signupId: s.id,
      shiftId: s.shift.id,
      shiftTitle: shiftDisplayTitle(s.shift, s.task),
      taskTitle: s.task?.title || null,
      startTime: s.shift.startTime.toISOString(),
      endTime: s.shift.endTime.toISOString(),
      sameShift: s.shift.id === shiftId,
    }));
  }

  return [];
}
