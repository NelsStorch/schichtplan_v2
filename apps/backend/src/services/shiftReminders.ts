/**
 * Erinnerungs-Mail vor einer Schicht («Deine Schicht steht bevor»).
 *
 * Nur wenn SHIFT_REMINDERS_ENABLED=true gesetzt ist (siehe server.ts): Alle 15 Minuten gehen Mails an
 * eingetragene Personen mit bestätigter, echter E-Mail, deren Schicht in den nächsten
 * REMINDER_LEAD_HOURS Stunden beginnt. Jede Eintragung bekommt höchstens eine Erinnerung:
 * `shift_signups.reminder_sent_at` wird vor dem Versand atomar gesetzt, so verschicken auch zwei
 * gleichzeitig laufende Backends (Zero-Downtime-Deploy) nichts doppelt. Schlägt der Versand fehl,
 * bleibt es bei dieser einen (verpassten) Erinnerung.
 */
import { PLACEHOLDER_EMAIL_REGEX } from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';
import { sendShiftReminderEmail } from './email.js';

export const REMINDER_LEAD_HOURS = 24;
export const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

const TIME_ZONE = 'Europe/Zurich';

/** «Sa, 01.06.2030, 18:00–22:00» (gleicher Tag) bzw. mit beiden Daten über Mitternacht */
export function formatShiftTime(start: Date, end: Date): string {
  const day = new Intl.DateTimeFormat('de-CH', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = new Intl.DateTimeFormat('de-CH', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
  const startDay = day.format(start);
  const endDay = day.format(end);
  return startDay === endDay
    ? `${startDay}, ${time.format(start)}–${time.format(end)}`
    : `${startDay}, ${time.format(start)} – ${endDay}, ${time.format(end)}`;
}

/** Link auf den Anlass in der Abteilung (https://<abteilung>.<domain>/events/<slug>) */
export function eventUrl(departmentSlug: string, eventSlug: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV !== 'production') return `http://${departmentSlug}.localhost:3000/events/${eventSlug}`;
  const domain = (env.COOKIE_DOMAIN || env.DOMAIN || 'cevi-schichtplan.ch').replace(/^\./, '');
  return `https://${departmentSlug}.${domain}/events/${eventSlug}`;
}

/**
 * Fällige Erinnerungen verschicken. Gibt die Anzahl verschickter Mails zurück.
 * `now` und `send` lassen sich für Tests ersetzen.
 */
export async function sendDueShiftReminders(
  prisma: PrismaClient,
  now: Date = new Date(),
  send: typeof sendShiftReminderEmail = sendShiftReminderEmail
): Promise<number> {
  const until = new Date(now.getTime() + REMINDER_LEAD_HOURS * 60 * 60 * 1000);
  const due = await prisma.shiftSignup.findMany({
    where: {
      reminderSentAt: null,
      userId: { not: null },
      user: { emailVerified: true, email: { not: null } },
      shift: { startTime: { gt: now, lte: until } },
    },
    select: {
      id: true,
      user: { select: { email: true, ceviName: true, firstName: true } },
      task: { select: { title: true } },
      shift: {
        select: {
          title: true,
          startTime: true,
          endTime: true,
          event: { select: { title: true, slug: true, department: { select: { slug: true } } } },
        },
      },
    },
    orderBy: { shift: { startTime: 'asc' } },
    take: 200,
  });

  let sent = 0;
  for (const signup of due) {
    const email = signup.user?.email;
    // Platzhalter-Adressen aus dem Cevi.DB-Login (cevidb_123@…) nie anschreiben, aber als erledigt markieren
    const claimed = await prisma.shiftSignup.updateMany({
      where: { id: signup.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0 || !email || PLACEHOLDER_EMAIL_REGEX.test(email)) continue;

    const { shift } = signup;
    const shiftTitle =
      signup.task && signup.task.title !== shift.title ? `${shift.title} · ${signup.task.title}` : shift.title;
    const ok = await send({
      to: email,
      name: signup.user?.ceviName || signup.user?.firstName,
      eventTitle: shift.event.title,
      shiftTitle,
      timeRangeFormatted: formatShiftTime(shift.startTime, shift.endTime),
      shiftUrl: eventUrl(shift.event.department.slug, shift.event.slug),
    });
    if (ok) sent++;
  }
  return sent;
}
