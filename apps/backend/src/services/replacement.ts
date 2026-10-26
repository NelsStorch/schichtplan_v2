import { formatZurichDate, formatZurichTimeRange, replacementDeadline } from '@schichtplan/shared';
import type { PrismaClient } from '../db.js';
import { usableEmail } from '../routes/eventMessages.js';
import { sendReplacementTakenEmail } from './email.js';
import { evaluateEventAccess, type ManagerFlags } from './eventAccess.js';
import { eventUrl } from './shiftReminders.js';

type ReplacementEvent = { allowReplacement: boolean; replacementCutoffHours: number };

/**
 * Kann für diese Schicht noch «Ersatz gesucht» gesetzt bzw. übernommen werden?
 * Gilt bis `replacementCutoffHours` vor Schichtbeginn (0 = bis Schichtbeginn).
 */
export function replacementOpen(event: ReplacementEvent, shiftStart: Date, now = new Date()): boolean {
  return event.allowReplacement && now < replacementDeadline(shiftStart, event.replacementCutoffHours);
}

/**
 * Darf die Person eine Schicht mit «Ersatz gesucht» übernehmen? Dieselben Regeln wie beim Eintragen,
 * aber auch wenn das Eintragen geschlossen oder noch nicht offen ist: Es kommt kein Platz dazu,
 * nur die Person wechselt.
 */
export function canTakeOver(
  event: Parameters<typeof evaluateEventAccess>[0] & ReplacementEvent,
  departmentName: string,
  user: Parameters<typeof evaluateEventAccess>[2],
  flags: ManagerFlags,
  hasGrant: boolean
): boolean {
  if (!event.allowReplacement || !user) return false;
  return evaluateEventAccess({ ...event, allowPublicSignup: true, signupOpensAt: null }, departmentName, user, flags, hasGrant)
    .canSignup;
}

type ReplacedSignup = {
  user: { firstName: string; email: string | null; emailVerified: boolean } | null;
};

/** Mail an die Person, deren Schicht übernommen wurde (nur bestätigte, echte Adresse) */
export async function notifyReplacementTaken(
  prisma: Pick<PrismaClient, 'department'>,
  replaced: ReplacedSignup,
  shift: { title: string; startTime: Date; endTime: Date },
  event: { title: string; slug: string; departmentId: string },
  takenBy: string,
  send: typeof sendReplacementTakenEmail = sendReplacementTakenEmail
): Promise<boolean> {
  const to = replaced.user ? usableEmail(replaced.user) : null;
  if (!replaced.user || !to) return false;
  const department = await prisma.department.findUnique({ where: { id: event.departmentId }, select: { slug: true } });
  return send({
    to,
    name: replaced.user.firstName,
    takenBy,
    eventTitle: event.title,
    shiftTitle: shift.title,
    timeRangeFormatted: `${formatZurichDate(shift.startTime)}, ${formatZurichTimeRange(shift.startTime, shift.endTime)}`,
    eventUrl: department ? eventUrl(department.slug, event.slug) : undefined,
  });
}
