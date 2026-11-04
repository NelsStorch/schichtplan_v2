import type { PrismaClient } from '../db.js';
import type { CateringTokenDto, CateringTokensOverviewDto } from '@schichtplan/shared';

export function isTokenAvailableNow(
  shiftStartTime: Date,
  attendance: string | null,
  earlyHours: number,
  now: Date = new Date()
): boolean {
  if (attendance === 'PRESENT') {
    return true;
  }
  const availableFromTime = shiftStartTime.getTime() - earlyHours * 60 * 60 * 1000;
  return now.getTime() >= availableFromTime;
}

export function tokenAvailableFrom(shiftStartTime: Date, earlyHours: number): Date {
  return new Date(shiftStartTime.getTime() - earlyHours * 60 * 60 * 1000);
}

/**
 * Erzeugt für Schicht-Anmeldungen automatisch die im Anlass hinterlegten Tokens,
 * falls Verpflegungs-Tokens aktiv sind und noch keine existieren.
 */
export async function ensureCateringTokensForSignups(
  prisma: PrismaClient,
  eventId: string,
  signupIds: string[]
): Promise<void> {
  if (signupIds.length === 0) return;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      cateringTokensEnabled: true,
      cateringTokenItems: true,
    },
  });

  if (!event?.cateringTokensEnabled || !event.cateringTokenItems || event.cateringTokenItems.length === 0) {
    return;
  }

  // Finde heraus, welche Signups bereits Tokens haben
  const existingTokens = await prisma.cateringToken.findMany({
    where: { shiftSignupId: { in: signupIds } },
    select: { shiftSignupId: true },
  });

  const signupsWithTokens = new Set(existingTokens.map((t) => t.shiftSignupId));
  const missingSignupIds = signupIds.filter((id) => !signupsWithTokens.has(id));

  if (missingSignupIds.length === 0) return;

  const toCreate: Array<{ shiftSignupId: string; title: string; status: string }> = [];
  for (const signupId of missingSignupIds) {
    for (const itemTitle of event.cateringTokenItems) {
      toCreate.push({
        shiftSignupId: signupId,
        title: itemTitle,
        status: 'AVAILABLE',
      });
    }
  }

  if (toCreate.length > 0) {
    await prisma.cateringToken.createMany({
      data: toCreate,
    });
  }
}

/**
 * Holt alle Catering-Tokens für eine bestimmte Person an einem Anlass.
 */
export async function getHelperCateringTokens(
  prisma: PrismaClient,
  eventId: string,
  userId: string,
  now: Date = new Date()
): Promise<CateringTokenDto[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { cateringEarlyHours: true, cateringTokensEnabled: true },
  });

  if (!event?.cateringTokensEnabled) {
    return [];
  }

  const signups = await prisma.shiftSignup.findMany({
    where: {
      userId,
      shift: { eventId },
    },
    select: { id: true },
  });

  if (signups.length === 0) return [];

  // Sicherstellen, dass Tokens existieren
  await ensureCateringTokensForSignups(
    prisma,
    eventId,
    signups.map((s) => s.id)
  );

  const tokens = await prisma.cateringToken.findMany({
    where: {
      signup: {
        userId,
        shift: { eventId },
      },
    },
    include: {
      signup: {
        include: {
          shift: true,
          task: true,
        },
      },
    },
    orderBy: [
      { signup: { shift: { startTime: 'asc' } } },
      { createdAt: 'asc' },
    ],
  });

  const earlyHours = event.cateringEarlyHours ?? 2;

  return tokens.map((t) => ({
    id: t.id,
    shiftSignupId: t.shiftSignupId,
    shiftTitle: t.signup.shift.title,
    taskTitle: t.signup.task?.title || null,
    shiftStartTime: t.signup.shift.startTime.toISOString(),
    shiftEndTime: t.signup.shift.endTime.toISOString(),
    title: t.title,
    status: t.status as 'AVAILABLE' | 'REDEEMED' | 'CANCELLED',
    isAvailableNow: isTokenAvailableNow(t.signup.shift.startTime, t.signup.attendance, earlyHours, now),
    availableFrom: tokenAvailableFrom(t.signup.shift.startTime, earlyHours).toISOString(),
    redeemedAt: t.redeemedAt?.toISOString() ?? null,
    redeemedByName: t.redeemedByName,
  }));
}

/**
 * Fasst Verpflegungs- und Getränke-Tokens für das OK-Dashboard zusammen.
 */
export async function getCateringOverview(
  prisma: PrismaClient,
  eventId: string
): Promise<CateringTokensOverviewDto> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      cateringTokensEnabled: true,
      cateringEarlyHours: true,
      cateringTokenItems: true,
    },
  });

  const enabled = event?.cateringTokensEnabled ?? false;
  const earlyHours = event?.cateringEarlyHours ?? 2;

  if (!enabled) {
    return {
      enabled: false,
      earlyHours,
      totalTokens: 0,
      availableTokens: 0,
      redeemedTokens: 0,
      byItem: [],
      recentRedemptions: [],
    };
  }

  const allTokens = await prisma.cateringToken.findMany({
    where: { signup: { shift: { eventId } } },
    include: {
      signup: {
        include: {
          shift: true,
          user: { select: { firstName: true, lastName: true, ceviName: true } },
        },
      },
    },
    orderBy: { redeemedAt: 'desc' },
  });

  const totalTokens = allTokens.length;
  const redeemedTokens = allTokens.filter((t) => t.status === 'REDEEMED').length;
  const availableTokens = allTokens.filter((t) => t.status === 'AVAILABLE').length;

  const itemMap = new Map<string, { total: number; redeemed: number; available: number }>();
  for (const item of event?.cateringTokenItems ?? []) {
    itemMap.set(item, { total: 0, redeemed: 0, available: 0 });
  }

  for (const t of allTokens) {
    const stats = itemMap.get(t.title) ?? { total: 0, redeemed: 0, available: 0 };
    stats.total++;
    if (t.status === 'REDEEMED') stats.redeemed++;
    if (t.status === 'AVAILABLE') stats.available++;
    itemMap.set(t.title, stats);
  }

  const byItem = Array.from(itemMap.entries()).map(([title, stats]) => ({
    title,
    ...stats,
  }));

  const recentRedemptions = allTokens
    .filter((t) => t.status === 'REDEEMED' && t.redeemedAt)
    .slice(0, 15)
    .map((t) => {
      const u = t.signup.user;
      const helperName = u ? (u.ceviName ? `${u.ceviName} (${u.firstName})` : `${u.firstName} ${u.lastName ?? ''}`.trim()) : (t.signup.guestName || 'Unbekannt');
      return {
        id: t.id,
        title: t.title,
        helperName,
        redeemedAt: t.redeemedAt!.toISOString(),
        shiftTitle: t.signup.shift.title,
      };
    });

  return {
    enabled,
    earlyHours,
    totalTokens,
    availableTokens,
    redeemedTokens,
    byItem,
    recentRedemptions,
  };
}
