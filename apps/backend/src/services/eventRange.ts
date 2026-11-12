import { addDaysToDayKey, addZurichDays } from '@schichtplan/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

type Db = Pick<PrismaClient, 'shift' | 'event' | 'shiftSignup' | 'shiftResponsible' | 'eventDayResponsible' | 'cateringToken'>;

/**
 * Zeitraum eines Anlasses = erste Schicht bis letzte Schicht. Wird nach jeder Änderung an Schichten
 * nachgeführt, damit Sortierung, Filter (kommend/vorbei) und Fristen direkt auf der Spalte bleiben.
 * Ohne Schichten bleibt der bisherige Zeitraum (beim Anlegen das gewählte Datum).
 */
export async function syncEventRange(db: Pick<PrismaClient, 'shift' | 'event'>, eventId: string) {
  const range = await db.shift.aggregate({
    where: { eventId },
    _min: { startTime: true },
    _max: { endTime: true },
  });
  const start = range._min.startTime;
  const end = range._max.endTime;
  if (!start || !end) return;
  await db.event.update({ where: { id: eventId }, data: { startDate: start, endDate: end } });
}

/**
 * Verschiebt einen Anlass um ganze Tage (Schweizer Zeit, Uhrzeiten bleiben über die Zeitumstellung):
 * alle Schichten, Tagesverantwortliche, den Zeitraum und eine gesetzte Freischaltung des Eintragens. Erinnerungen werden
 * zurückgesetzt, damit sie zum neuen Termin nochmals verschickt werden.
 */
export async function moveEventByDays(db: Db, event: { id: string; startDate: Date; endDate: Date; signupOpensAt: Date | null }, days: number) {
  const shifts = await db.shift.findMany({ where: { eventId: event.id }, select: { id: true, startTime: true, endTime: true } });
  for (const shift of shifts) {
    await db.shift.update({
      where: { id: shift.id },
      data: { startTime: addZurichDays(shift.startTime, days), endTime: addZurichDays(shift.endTime, days) },
    });
  }
  // Tagesverantwortliche hängen an YYYY-MM-DD. In Verschiebe-Richtung von hinten her, sonst stösst
  // ein Eintrag kurz an den Nachbartag derselben Person (unique eventId+dayDate+userId).
  const dayResponsibles = await db.eventDayResponsible.findMany({ where: { eventId: event.id } });
  dayResponsibles.sort((a, b) => (days > 0 ? b.dayDate.localeCompare(a.dayDate) : a.dayDate.localeCompare(b.dayDate)));
  for (const r of dayResponsibles) {
    await db.eventDayResponsible.update({ where: { id: r.id }, data: { dayDate: addDaysToDayKey(r.dayDate, days) } });
  }
  await db.shiftSignup.updateMany({
    where: { shift: { eventId: event.id } },
    data: { sentEmailReminders: [], sentPushReminders: [] },
  });
  await db.shiftResponsible.updateMany({
    where: { shift: { eventId: event.id } },
    data: { sentEmailReminders: [], sentPushReminders: [] },
  });
  await db.cateringToken.updateMany({
    where: {
      status: 'AVAILABLE',
      OR: [
        { shift: { eventId: event.id } },
        { signup: { shift: { eventId: event.id } } },
      ],
    },
    data: { reminderSentAt: null },
  });
  await db.event.update({
    where: { id: event.id },
    data: {
      startDate: addZurichDays(event.startDate, days),
      endDate: addZurichDays(event.endDate, days),
      signupOpensAt: event.signupOpensAt ? addZurichDays(event.signupOpensAt, days) : undefined,
    },
  });
  await syncEventRange(db, event.id);
  return shifts.length;
}
