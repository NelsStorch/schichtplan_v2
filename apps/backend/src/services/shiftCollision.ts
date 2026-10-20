import type { PrismaClient } from '../generated/prisma/client.js';
import type { ShiftTimeCollision } from '@schichtplan/shared';

export interface CollisionCheckOptions {
  shiftId: string;
  startTime: Date;
  endTime: Date;
  eventId: string;
  userId?: string | null;
  guestName?: string | null;
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
  const sA = new Date(startA).getTime();
  const eA = new Date(endA).getTime();
  const sB = new Date(startB).getTime();
  const eB = new Date(endB).getTime();
  return sA < eB && sB < eA;
}

/**
 * Schweizer Zeitformatierung HH:MM in der Zeitzone Europe/Zurich
 */
export function formatZurichTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('de-CH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  });
}

/**
 * Findet alle aktiven Eintragungen einer Person (oder eines Gastes im selben Event),
 * die zeitlich mit dem Fenster [startTime, endTime) der Schicht kollidieren.
 */
export async function findShiftCollisions(
  prisma: PrismaClient,
  options: CollisionCheckOptions
): Promise<ShiftTimeCollision[]> {
  const { shiftId, startTime, endTime, eventId, userId, guestName } = options;

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

    return signups.map((s) => ({
      signupId: s.id,
      shiftId: s.shift.id,
      shiftTitle: s.shift.title,
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

    return signups.map((s) => ({
      signupId: s.id,
      shiftId: s.shift.id,
      shiftTitle: s.shift.title,
      taskTitle: s.task?.title || null,
      startTime: s.shift.startTime.toISOString(),
      endTime: s.shift.endTime.toISOString(),
      sameShift: s.shift.id === shiftId,
    }));
  }

  return [];
}
