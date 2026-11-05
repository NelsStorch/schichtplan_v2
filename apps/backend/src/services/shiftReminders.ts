/**
 * Erinnerungen vor einer Schicht (E-Mail + Web Push, frei wählbare Vorlaufzeiten).
 *
 * Nur wenn SHIFT_REMINDERS_ENABLED=true gesetzt ist (siehe server.ts): Alle 10 Minuten werden
 * fällige E-Mail- und Browser-Push-Erinnerungen für eingetragene Helfende (`shift_signups`) sowie
 * eingeteilte Schichtverantwortliche (`shift_responsibles`) geprüft.
 *
 * - Jede Person kann im Profil mehrere Vorlaufzeiten wählen (z. B. 1440 = 24h, 120 = 2h).
 * - Ist eine Person gleichzeitig in einer Schicht eingetragen UND als Schichtleitung zugeteilt,
 *   bekommt sie pro Vorlaufzeit nur eine einzige Erinnerung.
 * - Atomares Setzen in `sent_email_reminders` bzw. `sent_push_reminders` (`NOT (sent_... @> ARRAY[m])`)
 *   verhindert doppelten Versand bei parallelen Backend-Containern (Zero-Downtime-Deploy).
 */
import {
  DEFAULT_EMAIL_REMINDER_MINUTES,
  DEFAULT_PUSH_REMINDER_MINUTES,
  PLACEHOLDER_EMAIL_REGEX,
  formatReminderLeadTime,
} from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';
import { sendShiftReminderEmail } from './email.js';
import { sendPushToUser } from './webPush.js';

export const REMINDER_LEAD_HOURS = 24;
/** Maximales Suchfenster in die Zukunft: 7 Tage (10080 Minuten) */
export const MAX_REMINDER_WINDOW_MINUTES = 10_080;
export const REMINDER_INTERVAL_MS = 10 * 60 * 1000;

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

interface CandidateEntry {
  kind: 'signup' | 'responsible';
  recordId: string;
  userId: string | null;
  shiftId: string;
  isResponsible: boolean;
  sentEmail: Set<number>;
  sentPush: Set<number>;
  user: {
    id: string | null;
    email: string | null;
    emailVerified: boolean;
    ceviName: string | null;
    firstName: string;
    shiftRemindersEnabled: boolean;
    emailReminderMinutes: number[];
    pushRemindersEnabled: boolean;
    pushReminderMinutes: number[];
    hasPushSubscriptions: boolean;
  };
  taskTitle: string | null;
  shift: {
    id: string;
    title: string | null;
    category: string | null;
    startTime: Date;
    endTime: Date;
    event: {
      title: string;
      slug: string;
      reminderNote: string | null;
      department: { slug: string; name: string; primaryColor: string | null };
    };
  };
}

async function claimEmailReminder(
  prisma: PrismaClient,
  kind: 'signup' | 'responsible',
  recordId: string,
  leadMinutes: number
): Promise<boolean> {
  if (kind === 'signup') {
    const count = await prisma.$executeRaw`
      UPDATE "shift_signups"
      SET "sent_email_reminders" = array_append("sent_email_reminders", ${leadMinutes})
      WHERE "id" = ${recordId}
        AND NOT ("sent_email_reminders" @> ARRAY[${leadMinutes}]::INTEGER[])
    `;
    return Number(count) > 0;
  } else {
    const count = await prisma.$executeRaw`
      UPDATE "shift_responsibles"
      SET "sent_email_reminders" = array_append("sent_email_reminders", ${leadMinutes})
      WHERE "id" = ${recordId}
        AND NOT ("sent_email_reminders" @> ARRAY[${leadMinutes}]::INTEGER[])
    `;
    return Number(count) > 0;
  }
}

async function unclaimEmailReminder(
  prisma: PrismaClient,
  kind: 'signup' | 'responsible',
  recordId: string,
  leadMinutes: number
): Promise<void> {
  if (kind === 'signup') {
    await prisma.$executeRaw`
      UPDATE "shift_signups"
      SET "sent_email_reminders" = array_remove("sent_email_reminders", ${leadMinutes})
      WHERE "id" = ${recordId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "shift_responsibles"
      SET "sent_email_reminders" = array_remove("sent_email_reminders", ${leadMinutes})
      WHERE "id" = ${recordId}
    `;
  }
}

async function claimPushReminder(
  prisma: PrismaClient,
  kind: 'signup' | 'responsible',
  recordId: string,
  leadMinutes: number
): Promise<boolean> {
  if (kind === 'signup') {
    const count = await prisma.$executeRaw`
      UPDATE "shift_signups"
      SET "sent_push_reminders" = array_append("sent_push_reminders", ${leadMinutes})
      WHERE "id" = ${recordId}
        AND NOT ("sent_push_reminders" @> ARRAY[${leadMinutes}]::INTEGER[])
    `;
    return Number(count) > 0;
  } else {
    const count = await prisma.$executeRaw`
      UPDATE "shift_responsibles"
      SET "sent_push_reminders" = array_append("sent_push_reminders", ${leadMinutes})
      WHERE "id" = ${recordId}
        AND NOT ("sent_push_reminders" @> ARRAY[${leadMinutes}]::INTEGER[])
    `;
    return Number(count) > 0;
  }
}

/**
 * Fällige E-Mail- und Push-Erinnerungen verschicken. Gibt die Anzahl verschickter Erinnerungen zurück.
 * `now`, `send` und `sendPush` lassen sich für Tests ersetzen.
 */
export async function sendDueShiftReminders(
  prisma: PrismaClient,
  now: Date = new Date(),
  send: typeof sendShiftReminderEmail = sendShiftReminderEmail,
  sendPush: typeof sendPushToUser = sendPushToUser
): Promise<number> {
  const until = new Date(now.getTime() + MAX_REMINDER_WINDOW_MINUTES * 60 * 1000);

  const [signups, responsibles] = await Promise.all([
    prisma.shiftSignup.findMany({
      where: {
        shift: { startTime: { gt: now, lte: until } },
        OR: [
          { userId: { not: null } },
          { guestEmail: { not: null } },
        ],
      },
      select: {
        id: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        sentEmailReminders: true,
        sentPushReminders: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            ceviName: true,
            firstName: true,
            shiftRemindersEnabled: true,
            emailReminderMinutes: true,
            pushRemindersEnabled: true,
            pushReminderMinutes: true,
            _count: { select: { pushSubscriptions: true } },
          },
        },
        task: { select: { title: true } },
        shift: {
          select: {
            id: true,
            title: true,
            category: true,
            startTime: true,
            endTime: true,
            event: {
              select: {
                title: true,
                slug: true,
                reminderNote: true,
                department: { select: { slug: true, name: true, primaryColor: true } },
              },
            },
          },
        },
      },
      orderBy: { shift: { startTime: 'asc' } },
      take: 400,
    }),
    prisma.shiftResponsible.findMany({
      where: {
        shift: { startTime: { gt: now, lte: until } },
      },
      select: {
        id: true,
        userId: true,
        sentEmailReminders: true,
        sentPushReminders: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            ceviName: true,
            firstName: true,
            shiftRemindersEnabled: true,
            emailReminderMinutes: true,
            pushRemindersEnabled: true,
            pushReminderMinutes: true,
            _count: { select: { pushSubscriptions: true } },
          },
        },
        shift: {
          select: {
            id: true,
            title: true,
            category: true,
            startTime: true,
            endTime: true,
            event: {
              select: {
                title: true,
                slug: true,
                reminderNote: true,
                department: { select: { slug: true, name: true, primaryColor: true } },
              },
            },
          },
        },
      },
      orderBy: { shift: { startTime: 'asc' } },
      take: 400,
    }),
  ]);

  // Deduplizieren pro (userId, shiftId): Ist jemand sowohl eingetragen als auch Schichtleitung,
  // führen wir den Eintrag zusammen (Signup hat Vorrang wegen Task-Titel, isResponsible wird true).
  const byUserShift = new Map<string, CandidateEntry & { companionResponsibleId?: string }>();

  for (const s of signups) {
    if (s.user && s.userId) {
      const key = `${s.userId}:${s.shift.id}`;
      const sentEmail = new Set<number>(s.sentEmailReminders ?? []);
      byUserShift.set(key, {
        kind: 'signup',
        recordId: s.id,
        userId: s.userId,
        shiftId: s.shift.id,
        isResponsible: false,
        sentEmail,
        sentPush: new Set<number>(s.sentPushReminders ?? []),
        user: {
          id: s.user.id,
          email: s.user.email,
          emailVerified: s.user.emailVerified,
          ceviName: s.user.ceviName,
          firstName: s.user.firstName,
          shiftRemindersEnabled: s.user.shiftRemindersEnabled,
          emailReminderMinutes:
            s.user.emailReminderMinutes && s.user.emailReminderMinutes.length > 0
              ? s.user.emailReminderMinutes
              : s.user.shiftRemindersEnabled
                ? [...DEFAULT_EMAIL_REMINDER_MINUTES]
                : [],
          pushRemindersEnabled: s.user.pushRemindersEnabled ?? true,
          pushReminderMinutes:
            s.user.pushReminderMinutes && s.user.pushReminderMinutes.length > 0
              ? s.user.pushReminderMinutes
              : [...DEFAULT_PUSH_REMINDER_MINUTES],
          hasPushSubscriptions: (s.user._count?.pushSubscriptions ?? 0) > 0,
        },
        taskTitle: s.task?.title ?? null,
        shift: s.shift,
      });
      continue;
    }

    // Gast-Anmeldung ohne Account (mit hinterlegter guestEmail)
    const trimmedGuestEmail = s.guestEmail?.trim();
    if (!s.userId && trimmedGuestEmail && trimmedGuestEmail.includes('@')) {
      const key = `guest:${s.id}`;
      const sentEmail = new Set<number>(s.sentEmailReminders ?? []);
      byUserShift.set(key, {
        kind: 'signup',
        recordId: s.id,
        userId: null,
        shiftId: s.shift.id,
        isResponsible: false,
        sentEmail,
        sentPush: new Set<number>(s.sentPushReminders ?? []),
        user: {
          id: null,
          email: trimmedGuestEmail,
          emailVerified: true,
          ceviName: null,
          firstName: s.guestName?.trim() || 'Helfer*in',
          shiftRemindersEnabled: true,
          emailReminderMinutes: [...DEFAULT_EMAIL_REMINDER_MINUTES],
          pushRemindersEnabled: false,
          pushReminderMinutes: [],
          hasPushSubscriptions: false,
        },
        taskTitle: s.task?.title ?? null,
        shift: s.shift,
      });
    }
  }

  for (const r of responsibles) {
    if (!r.user) continue;
    const key = `${r.userId}:${r.shift.id}`;
    const existing = byUserShift.get(key);
    if (existing) {
      existing.isResponsible = true;
      existing.companionResponsibleId = r.id;
      for (const m of r.sentEmailReminders ?? []) existing.sentEmail.add(m);
      for (const m of r.sentPushReminders ?? []) existing.sentPush.add(m);
      continue;
    }
    byUserShift.set(key, {
      kind: 'responsible',
      recordId: r.id,
      userId: r.userId,
      shiftId: r.shift.id,
      isResponsible: true,
      sentEmail: new Set<number>(r.sentEmailReminders ?? []),
      sentPush: new Set<number>(r.sentPushReminders ?? []),
      user: {
        id: r.user.id,
        email: r.user.email,
        emailVerified: r.user.emailVerified,
        ceviName: r.user.ceviName,
        firstName: r.user.firstName,
        shiftRemindersEnabled: r.user.shiftRemindersEnabled,
        emailReminderMinutes:
          r.user.emailReminderMinutes && r.user.emailReminderMinutes.length > 0
            ? r.user.emailReminderMinutes
            : r.user.shiftRemindersEnabled
              ? [...DEFAULT_EMAIL_REMINDER_MINUTES]
              : [],
        pushRemindersEnabled: r.user.pushRemindersEnabled ?? true,
        pushReminderMinutes:
          r.user.pushReminderMinutes && r.user.pushReminderMinutes.length > 0
            ? r.user.pushReminderMinutes
            : [...DEFAULT_PUSH_REMINDER_MINUTES],
        hasPushSubscriptions: (r.user._count?.pushSubscriptions ?? 0) > 0,
      },
      taskTitle: null,
      shift: r.shift,
    });
  }

  let sentCount = 0;

  for (const entry of byUserShift.values()) {
    const { shift, user } = entry;
    const diffMinutes = (shift.startTime.getTime() - now.getTime()) / 60_000;
    if (diffMinutes <= 0) continue;

    const shiftTitle = shift.title?.trim()
      ? (entry.taskTitle && entry.taskTitle !== shift.title ? `${shift.title} · ${entry.taskTitle}` : shift.title)
      : (entry.taskTitle || 'Schicht');
    const targetUrl = eventUrl(shift.event.department.slug, shift.event.slug);
    const timeFormatted = formatShiftTime(shift.startTime, shift.endTime);

    // 1. E-Mail-Erinnerung prüfen
    if (user.shiftRemindersEnabled && user.emailVerified && user.email) {
      const dueEmailThresholds = user.emailReminderMinutes
        .filter((m) => diffMinutes <= m && !entry.sentEmail.has(m))
        .sort((a, b) => a - b);

      if (dueEmailThresholds.length > 0) {
        // Kleinste bereits erreichte Schwelle senden (und allfällige grössere gleich mit abhaken,
        // damit nicht mehrere Erinnerungs-Mails auf einmal rausgehen)
        const targetLead = dueEmailThresholds[0];
        const claimedMinutes: number[] = [];
        const claimedCompanionMinutes: number[] = [];

        for (const m of dueEmailThresholds) {
          const c = await claimEmailReminder(prisma, entry.kind, entry.recordId, m);
          if (c) claimedMinutes.push(m);
          if (entry.companionResponsibleId) {
            const cc = await claimEmailReminder(prisma, 'responsible', entry.companionResponsibleId, m);
            if (cc) claimedCompanionMinutes.push(m);
          }
        }

        if (claimedMinutes.length > 0 || claimedCompanionMinutes.length > 0) {
          if (!PLACEHOLDER_EMAIL_REGEX.test(user.email)) {
            let ok = false;
            try {
              ok = await send({
                to: user.email,
                name: user.ceviName || user.firstName,
                eventTitle: shift.event.title,
                shiftTitle,
                timeRangeFormatted: timeFormatted,
                shiftUrl: targetUrl,
                departmentName: shift.event.department.name,
                accentColor: shift.event.department.primaryColor,
                category: shift.category,
                startTime: shift.startTime,
                endTime: shift.endTime,
                shiftId: shift.id,
                leadMinutes: targetLead,
                reminderNote: shift.event.reminderNote,
                isResponsible: entry.isResponsible,
                isGuest: entry.userId === null,
              });
            } catch {
              ok = false;
            }

            if (ok) {
              sentCount++;
            } else {
              // Rollback bei fehlgeschlagenem E-Mail-Versand, damit beim nächsten Durchlauf erneut versucht wird
              for (const m of claimedMinutes) {
                await unclaimEmailReminder(prisma, entry.kind, entry.recordId, m);
              }
              if (entry.companionResponsibleId) {
                for (const m of claimedCompanionMinutes) {
                  await unclaimEmailReminder(prisma, 'responsible', entry.companionResponsibleId, m);
                }
              }
            }
          }
        }
      }
    }

    // 2. Web-Push-Erinnerung prüfen (nur für registrierte Benutzer mit Push-Abonnement)
    if (user.id && user.pushRemindersEnabled && user.hasPushSubscriptions) {
      const duePushThresholds = user.pushReminderMinutes
        .filter((m) => diffMinutes <= m && !entry.sentPush.has(m))
        .sort((a, b) => a - b);

      if (duePushThresholds.length > 0) {
        const targetLead = duePushThresholds[0];
        let claimed = false;
        for (const m of duePushThresholds) {
          const c = await claimPushReminder(prisma, entry.kind, entry.recordId, m);
          if (c) claimed = true;
          if (entry.companionResponsibleId) {
            await claimPushReminder(prisma, 'responsible', entry.companionResponsibleId, m);
          }
        }

        if (claimed) {
          const leadText = formatReminderLeadTime(targetLead);
          const noteSuffix = shift.event.reminderNote?.trim()
            ? `\nHinweis: ${shift.event.reminderNote.trim().slice(0, 120)}`
            : '';
          const pushRes = await sendPush(prisma, user.id, {
            title: `Schicht beginnt ${leadText}: ${shiftTitle}`,
            body: `${shift.event.title} (${timeFormatted})${noteSuffix}`,
            url: targetUrl,
            tag: `shift-reminder-${shift.id}-${targetLead}`,
          });
          if (pushRes.sent > 0) sentCount++;
        }
      }
    }
  }

  return sentCount;
}
