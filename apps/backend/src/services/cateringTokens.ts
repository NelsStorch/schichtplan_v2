import type { PrismaClient } from '../generated/prisma/client.js';
import {
  DEFAULT_CATERING_EARLY_HOURS,
  DEFAULT_CATERING_TOKEN_ITEMS,
  businessDayKey,
  type CateringTokenDto,
  type CateringTokensOverviewDto,
  type CateringTokenStatus,
} from '@schichtplan/shared';
import { personLabel } from './attendance.js';

/**
 * Prüft, ob ein Verpflegungs-Bon im aktuellen Moment eingelöst werden darf.
 * Einlösbar, sobald:
 * - `earlyHours < 0` («Immer gültig» ohne Zeitfenster), ODER
 * - die Person bereits als ANWESEND (`PRESENT`) eingecheckt ist, ODER
 * - das Kulanz-Fenster (`shiftStartTime - earlyHours`) erreicht wurde.
 */
export function isTokenAvailableNow(params: {
  shiftStartTime: Date;
  earlyHours: number;
  attendance: string | null;
  now?: Date;
}): boolean {
  const { shiftStartTime, earlyHours, attendance, now = new Date() } = params;
  if (earlyHours < 0) return true;
  if (attendance === 'PRESENT') return true;
  const availableFromMs = shiftStartTime.getTime() - earlyHours * 60 * 60_000;
  return now.getTime() >= availableFromMs;
}

export function availableFromTime(shiftStartTime: Date, earlyHours: number): Date {
  if (earlyHours < 0) return new Date(0);
  return new Date(shiftStartTime.getTime() - earlyHours * 60 * 60_000);
}

/**
 * Stellt sicher, dass für die übergebenen Schicht-Anmeldungen alle konfigurierten
 * Verpflegungs-Bons existieren (idempotent: legt nur fehlende Titel pro Anmeldung an).
 */
export async function ensureCateringTokensForSignups(
  prisma: PrismaClient,
  params: {
    signupIds: string[];
    enabled: boolean;
    tokenItems: string[];
  }
): Promise<void> {
  const { signupIds, enabled, tokenItems } = params;
  if (!enabled || signupIds.length === 0) return;

  const items = (tokenItems.length > 0 ? tokenItems : [...DEFAULT_CATERING_TOKEN_ITEMS])
    .map((t) => t.trim())
    .filter(Boolean);
  if (items.length === 0) return;

  const [signups, existing] = await Promise.all([
    prisma.shiftSignup.findMany({
      where: { id: { in: signupIds } },
      select: { id: true, shiftId: true, userId: true },
    }),
    prisma.cateringToken.findMany({
      where: { shiftSignupId: { in: signupIds } },
      select: { shiftSignupId: true, title: true },
    }),
  ]);

  const existingBySignup = new Map<string, Set<string>>();
  for (const row of existing) {
    if (!row.shiftSignupId) continue;
    let set = existingBySignup.get(row.shiftSignupId);
    if (!set) {
      set = new Set();
      existingBySignup.set(row.shiftSignupId, set);
    }
    set.add(row.title);
  }

  const toCreate: Array<{ shiftSignupId: string; shiftId: string; userId: string | null; title: string }> = [];
  for (const signup of signups) {
    const have = existingBySignup.get(signup.id) ?? new Set<string>();
    for (const title of items) {
      if (!have.has(title)) {
        toCreate.push({
          shiftSignupId: signup.id,
          shiftId: signup.shiftId,
          userId: signup.userId,
          title,
        });
      }
    }
  }

  if (toCreate.length > 0) {
    await prisma.cateringToken.createMany({ data: toCreate });
  }
}

/**
 * Synchronisiert sämtliche Verpflegungs-Bons eines Anlasses (oder einer einzelnen Person)
 * sowohl für reguläre Schicht-Anmeldungen (`ShiftSignup`) als auch für Schichtleitungen
 * (`ShiftResponsible` bzw. `EventDayResponsible`).
 */
export async function ensureEventCateringTokens(
  prisma: PrismaClient,
  params: {
    eventId: string;
    enabled: boolean;
    tokenItems: string[];
    onlyUserId?: string;
  }
): Promise<void> {
  const { eventId, enabled, tokenItems, onlyUserId } = params;
  if (!enabled) return;

  const items = (tokenItems.length > 0 ? tokenItems : [...DEFAULT_CATERING_TOKEN_ITEMS])
    .map((t) => t.trim())
    .filter(Boolean);
  if (items.length === 0) return;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      responsibleMode: true,
      dayCutoffTime: true,
      shifts: {
        select: {
          id: true,
          startTime: true,
          signups: {
            where: onlyUserId ? { userId: onlyUserId } : undefined,
            select: { id: true, shiftId: true, userId: true },
          },
          responsibles: {
            where: onlyUserId ? { userId: onlyUserId } : undefined,
            select: { shiftId: true, userId: true },
          },
        },
      },
      dayResponsibles: {
        where: onlyUserId ? { userId: onlyUserId } : undefined,
        select: { dayDate: true, userId: true },
      },
    },
  });
  if (!event) return;

  const shiftIds = event.shifts.map((s) => s.id);
  if (shiftIds.length === 0) return;

  const allSignups = event.shifts.flatMap((s) => s.signups);
  const signupIds = allSignups.map((s) => s.id);

  // Welche (shiftId, userId)-Kombinationen haben bereits eine reguläre ShiftSignup?
  // Falls wir nur für `onlyUserId` prüfen, sind alle Signups dieser Person in `allSignups`.
  const signedUpShiftUserKeys = new Set<string>();
  for (const s of allSignups) {
    if (s.userId) {
      signedUpShiftUserKeys.add(`${s.shiftId}:${s.userId}`);
    }
  }

  // Welche (shiftId, userId)-Paare sind als Schichtleitung eingeteilt (und nicht schon als Helfer in derselben Schicht)?
  const leaderPairs = new Map<string, { shiftId: string; userId: string }>();
  if (event.responsibleMode === 'BY_DAY') {
    const cutoff = event.dayCutoffTime ?? '04:00';
    for (const dr of event.dayResponsibles) {
      for (const sh of event.shifts) {
        if (businessDayKey(sh.startTime, cutoff) === dr.dayDate) {
          const key = `${sh.id}:${dr.userId}`;
          if (!signedUpShiftUserKeys.has(key)) {
            leaderPairs.set(key, { shiftId: sh.id, userId: dr.userId });
          }
        }
      }
    }
  } else {
    for (const sh of event.shifts) {
      for (const r of sh.responsibles) {
        const key = `${sh.id}:${r.userId}`;
        if (!signedUpShiftUserKeys.has(key)) {
          leaderPairs.set(key, { shiftId: sh.id, userId: r.userId });
        }
      }
    }
  }

  // Bestehende Tokens laden
  const existingTokens = await prisma.cateringToken.findMany({
    where: {
      OR: [
        ...(signupIds.length > 0 ? [{ shiftSignupId: { in: signupIds } }] : []),
        {
          shiftSignupId: null,
          shiftId: { in: shiftIds },
          ...(onlyUserId ? { userId: onlyUserId } : {}),
        },
      ],
    },
    select: {
      id: true,
      shiftSignupId: true,
      shiftId: true,
      userId: true,
      title: true,
      status: true,
    },
  });

  const existingBySignup = new Map<string, Set<string>>();
  const existingByLeaderKey = new Map<string, Set<string>>();
  const staleLeaderTokenIds: string[] = [];

  for (const t of existingTokens) {
    if (t.shiftSignupId) {
      let set = existingBySignup.get(t.shiftSignupId);
      if (!set) {
        set = new Set();
        existingBySignup.set(t.shiftSignupId, set);
      }
      set.add(t.title);
    } else if (t.shiftId && t.userId) {
      const key = `${t.shiftId}:${t.userId}`;
      if (!leaderPairs.has(key)) {
        if (t.status === 'AVAILABLE') {
          staleLeaderTokenIds.push(t.id);
        }
        continue;
      }
      let set = existingByLeaderKey.get(key);
      if (!set) {
        set = new Set();
        existingByLeaderKey.set(key, set);
      }
      set.add(t.title);
    }
  }

  if (staleLeaderTokenIds.length > 0) {
    await prisma.cateringToken.deleteMany({
      where: { id: { in: staleLeaderTokenIds } },
    });
  }

  const toCreate: Array<{
    shiftSignupId: string | null;
    shiftId: string;
    userId: string | null;
    title: string;
  }> = [];

  for (const signup of allSignups) {
    const have = existingBySignup.get(signup.id) ?? new Set<string>();
    for (const title of items) {
      if (!have.has(title)) {
        toCreate.push({
          shiftSignupId: signup.id,
          shiftId: signup.shiftId,
          userId: signup.userId,
          title,
        });
      }
    }
  }

  for (const [key, pair] of leaderPairs.entries()) {
    const have = existingByLeaderKey.get(key) ?? new Set<string>();
    for (const title of items) {
      if (!have.has(title)) {
        toCreate.push({
          shiftSignupId: null,
          shiftId: pair.shiftId,
          userId: pair.userId,
          title,
        });
      }
    }
  }

  if (toCreate.length > 0) {
    await prisma.cateringToken.createMany({ data: toCreate });
  }
}

/**
 * Lädt alle Verpflegungs-Bons einer Person für einen Anlass (inkl. Schichtleitung)
 * und legt fehlende Bons bei Bedarf automatisch an.
 */
export async function getHelperCateringTokens(
  prisma: PrismaClient,
  params: {
    eventId: string;
    userId: string;
    enabled: boolean;
    tokenItems: string[];
    earlyHours?: number;
    now?: Date;
  }
): Promise<CateringTokenDto[]> {
  const {
    eventId,
    userId,
    enabled,
    tokenItems,
    earlyHours = DEFAULT_CATERING_EARLY_HOURS,
    now = new Date(),
  } = params;
  if (!enabled) return [];

  await ensureEventCateringTokens(prisma, {
    eventId,
    enabled,
    tokenItems,
    onlyUserId: userId,
  });

  const tokens = await prisma.cateringToken.findMany({
    where: {
      OR: [
        { signup: { userId, shift: { eventId } } },
        { shiftSignupId: null, userId, shift: { eventId } },
      ],
    },
    include: {
      signup: {
        select: {
          id: true,
          attendance: true,
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
              title: true,
            },
          },
        },
      },
      shift: {
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
  });

  const dtos: CateringTokenDto[] = [];
  for (const t of tokens) {
    const shift = t.signup?.shift ?? t.shift;
    if (!shift) continue;
    const isResponsible = !t.shiftSignupId;
    dtos.push({
      id: t.id,
      shiftSignupId: t.shiftSignupId,
      shiftId: shift.id,
      shiftTitle: shift.title,
      taskTitle: isResponsible ? 'Schichtleitung' : (t.signup?.task?.title ?? null),
      shiftStartTime: shift.startTime.toISOString(),
      shiftEndTime: shift.endTime.toISOString(),
      title: t.title,
      status: (t.status === 'REDEEMED' ? 'REDEEMED' : 'AVAILABLE') as CateringTokenStatus,
      isAvailableNow: isTokenAvailableNow({
        shiftStartTime: shift.startTime,
        earlyHours,
        attendance: t.signup?.attendance ?? null,
        now,
      }),
      availableFrom: availableFromTime(shift.startTime, earlyHours).toISOString(),
      redeemedAt: t.redeemedAt ? t.redeemedAt.toISOString() : null,
      redeemedByName: t.redeemedByName ?? null,
      isResponsible,
    });
  }

  dtos.sort((a, b) => new Date(a.shiftStartTime).getTime() - new Date(b.shiftStartTime).getTime());
  return dtos;
}

/**
 * Erstellt die OK-Übersicht über ausgegebene und eingelöste Verpflegungs-Bons eines Anlasses.
 */
export async function getCateringOverview(
  prisma: PrismaClient,
  params: {
    eventId: string;
    enabled: boolean;
    tokenItems?: string[];
    earlyHours: number;
    now?: Date;
  }
): Promise<CateringTokensOverviewDto> {
  const { eventId, enabled, tokenItems = [...DEFAULT_CATERING_TOKEN_ITEMS], earlyHours, now = new Date() } = params;

  if (enabled) {
    await ensureEventCateringTokens(prisma, {
      eventId,
      enabled,
      tokenItems,
    });
  }

  const tokens = await prisma.cateringToken.findMany({
    where: {
      OR: [
        { signup: { shift: { eventId } } },
        { shiftSignupId: null, shift: { eventId } },
      ],
    },
    include: {
      signup: {
        select: {
          id: true,
          guestName: true,
          attendance: true,
          user: {
            select: { firstName: true, lastName: true, ceviName: true },
          },
          shift: {
            select: { id: true, title: true, startTime: true, endTime: true },
          },
          task: {
            select: { title: true },
          },
        },
      },
      shift: {
        select: { id: true, title: true, startTime: true, endTime: true },
      },
      user: {
        select: { firstName: true, lastName: true, ceviName: true },
      },
    },
    orderBy: [{ redeemedAt: 'desc' }, { createdAt: 'asc' }],
  });

  const byItemMap = new Map<string, { title: string; total: number; redeemed: number; available: number }>();
  let redeemedTokens = 0;
  let availableTokens = 0;

  const fullTokenList: CateringTokensOverviewDto['tokens'] = [];

  for (const t of tokens) {
    const shift = t.signup?.shift ?? t.shift;
    if (!shift) continue;

    const isRedeemed = t.status === 'REDEEMED';
    if (isRedeemed) redeemedTokens++;
    else availableTokens++;

    let entry = byItemMap.get(t.title);
    if (!entry) {
      entry = { title: t.title, total: 0, redeemed: 0, available: 0 };
      byItemMap.set(t.title, entry);
    }
    entry.total++;
    if (isRedeemed) entry.redeemed++;
    else entry.available++;

    const isResponsible = !t.shiftSignupId;
    const personUser = t.signup?.user ?? t.user;
    const helperName = personUser
      ? personLabel(personUser)
      : t.signup?.guestName || t.redeemedByName || 'Helfende Person';

    fullTokenList.push({
      id: t.id,
      shiftSignupId: t.shiftSignupId,
      shiftId: shift.id,
      shiftTitle: shift.title,
      taskTitle: isResponsible ? 'Schichtleitung' : (t.signup?.task?.title ?? null),
      shiftStartTime: shift.startTime.toISOString(),
      shiftEndTime: shift.endTime.toISOString(),
      title: t.title,
      status: (isRedeemed ? 'REDEEMED' : 'AVAILABLE') as CateringTokenStatus,
      isAvailableNow: isTokenAvailableNow({
        shiftStartTime: shift.startTime,
        earlyHours,
        attendance: t.signup?.attendance ?? null,
        now,
      }),
      availableFrom: availableFromTime(shift.startTime, earlyHours).toISOString(),
      redeemedAt: t.redeemedAt ? t.redeemedAt.toISOString() : null,
      redeemedByName: t.redeemedByName ?? null,
      isResponsible,
      helperName,
    });
  }

  fullTokenList.sort((a, b) => {
    const timeDiff = new Date(a.shiftStartTime).getTime() - new Date(b.shiftStartTime).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.helperName.localeCompare(b.helperName, 'de-CH');
  });

  const recentRedemptions = tokens
    .filter((t) => t.status === 'REDEEMED' && t.redeemedAt)
    .slice(0, 30)
    .map((t) => {
      const personUser = t.signup?.user ?? t.user;
      const helperName =
        t.redeemedByName ||
        (personUser ? personLabel(personUser) : t.signup?.guestName || 'Helfende Person');
      const shift = t.signup?.shift ?? t.shift;
      return {
        id: t.id,
        title: t.title,
        helperName,
        redeemedAt: t.redeemedAt!.toISOString(),
        shiftTitle: shift?.title ?? null,
      };
    });

  return {
    enabled,
    earlyHours,
    totalTokens: redeemedTokens + availableTokens,
    availableTokens,
    redeemedTokens,
    byItem: Array.from(byItemMap.values()),
    recentRedemptions,
    tokens: fullTokenList,
  };
}
