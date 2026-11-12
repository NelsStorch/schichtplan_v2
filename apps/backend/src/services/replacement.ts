import { formatZurichDate, formatZurichTimeRange, replacementDeadline } from '@schichtplan/shared';
import { shiftDisplayTitle } from './shiftDto.js';
import type { PrismaClient } from '../db.js';
import { usableEmail } from '../routes/eventMessages.js';
import { sendReplacementTakenEmail } from './email.js';
import { evaluateEventAccess, type ManagerFlags } from './eventAccess.js';
import { eventUrl } from './shiftReminders.js';
import { sendPushToUser } from './webPush.js';

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
  user: {
    id?: string;
    firstName: string;
    nickname?: string | null;
    ceviName?: string | null;
    email: string | null;
    emailVerified: boolean;
    pushNotifyReplacement?: boolean;
  } | null;
};

/** Mail + optionale Push-Benachrichtigung an die Person, deren Schicht übernommen wurde */
export async function notifyReplacementTaken(
  prisma: Pick<PrismaClient, 'department'> & Partial<Pick<PrismaClient, 'pushSubscription'>>,
  replaced: ReplacedSignup,
  shift: { title: string | null; startTime: Date; endTime: Date },
  event: { title: string; slug: string; departmentId: string },
  takenBy: string,
  send: typeof sendReplacementTakenEmail = sendReplacementTakenEmail
): Promise<boolean> {
  if (!replaced.user) return false;
  const department = await prisma.department.findUnique({
    where: { id: event.departmentId },
    select: { slug: true, name: true, primaryColor: true, organization: true },
  });
  const timeRangeFormatted = `${formatZurichDate(shift.startTime)}, ${formatZurichTimeRange(shift.startTime, shift.endTime)}`;
  const targetUrl = department ? eventUrl(department.slug, event.slug, department.organization) : undefined;

  // Web Push an alle registrierten Geräte (auch für Cevi-Name-Profile ohne E-Mail)
  if (replaced.user.id && replaced.user.pushNotifyReplacement !== false && prisma.pushSubscription) {
    void sendPushToUser(prisma as PrismaClient, replaced.user.id, {
      title: `Ersatz gefunden: ${shift.title?.trim() || 'Schicht'}`,
      body: `${takenBy} hat deine Schicht bei ${event.title} (${timeRangeFormatted}) übernommen.`,
      url: targetUrl,
      tag: `replacement-taken-${event.slug}`,
    }).catch(() => undefined);
  }

  const to = usableEmail(replaced.user);
  if (!to) return false;

  return send({
    to,
    name: replaced.user.nickname || replaced.user.ceviName || replaced.user.firstName,
    takenBy,
    eventTitle: event.title,
    shiftTitle: shiftDisplayTitle(shift),
    timeRangeFormatted,
    eventUrl: targetUrl,
    departmentName: department?.name,
    accentColor: department?.primaryColor,
    organization: department?.organization,
  });
}
