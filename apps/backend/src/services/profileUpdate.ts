import { Prisma, type PrismaClient } from '../db.js';
import { PLACEHOLDER_EMAIL_REGEX, type UpdateProfileInput } from '@schichtplan/shared';
import { findCeviNameMatches, isCeviNameProfile } from './nicknameLogin.js';

/**
 * Darf die Person ihre E-Mail selbst setzen bzw. ändern? Wo noch keine echte steht immer. Eine selbst
 * eingetragene, noch unbestätigte Adresse (Konto ohne Passwort und ohne Cevi.DB) lässt sich korrigieren.
 * Bei Passwort-Konten ist die E-Mail der Login, bei Cevi.DB-Konten kommt sie aus Cevi.DB.
 */
export function canChangeOwnEmail(user: {
  email: string | null;
  emailVerified: boolean;
  passwordHash: string | null;
  providerId?: string | null;
  ceviDbId?: number | null;
}): boolean {
  const hasRealEmail = Boolean(user.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));
  if (!hasRealEmail) return true;
  const hasProvider = user.providerId !== undefined ? Boolean(user.providerId) : user.ceviDbId !== null && user.ceviDbId !== undefined;
  return !user.emailVerified && !user.passwordHash && !hasProvider;
}

/**
 * Profilangaben der Person selbst ändern (nur gesetzte Felder).
 * Die E-Mail lässt sich nur ergänzen, wo noch keine echte hinterlegt ist: Sie ist bei Passwort-Konten
 * der Login, bei Cevi.DB-Konten kommt sie aus Cevi.DB.
 */
export async function applyProfileUpdate(
  prisma: Pick<PrismaClient, 'user'>,
  userId: string,
  input: UpdateProfileInput
): Promise<{ ok: true } | { error: string; status: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      nickname: true,
      passwordHash: true,
      providerId: true,
      emailVerified: true,
      birthDate: true,
      homeDepartmentId: true,
      memberships: { select: { departmentId: true } },
    },
  });
  if (!user) return { error: 'Konto nicht gefunden', status: 404 };

  const data: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.shiftReminders !== undefined) data.shiftRemindersEnabled = input.shiftReminders;
  if (input.emailReminderMinutes !== undefined) {
    const sorted = [...new Set(input.emailReminderMinutes)].sort((a, b) => a - b);
    data.emailReminderMinutes = sorted;
    if (input.shiftReminders === undefined) {
      data.shiftRemindersEnabled = sorted.length > 0;
    }
  }
  if (input.pushReminders !== undefined) data.pushRemindersEnabled = input.pushReminders;
  if (input.pushReminderMinutes !== undefined) {
    const sorted = [...new Set(input.pushReminderMinutes)].sort((a, b) => a - b);
    data.pushReminderMinutes = sorted;
    if (input.pushReminders === undefined) {
      data.pushRemindersEnabled = sorted.length > 0;
    }
  }
  if (input.pushNotifyReplacement !== undefined) data.pushNotifyReplacement = input.pushNotifyReplacement;
  if (input.pushNotifyMessages !== undefined) data.pushNotifyMessages = input.pushNotifyMessages;
  if (input.emailNotifyCateringTokens !== undefined) data.emailNotifyCateringTokens = input.emailNotifyCateringTokens;
  if (input.pushNotifyCateringTokens !== undefined) data.pushNotifyCateringTokens = input.pushNotifyCateringTokens;
  if (input.emailNotifyReplacement !== undefined) data.emailNotifyReplacement = input.emailNotifyReplacement;
  if (input.emailNotifyMessages !== undefined) data.emailNotifyMessages = input.emailNotifyMessages;
  if (input.birthDate !== undefined) {
    const date = new Date(`${input.birthDate}T00:00:00Z`);
    if (isNaN(date.getTime()) || date > new Date()) return { error: 'Ungültiges Geburtsdatum', status: 400 };
    // Bei Cevi.DB-Konten kommt das Geburtsdatum aus Cevi.DB (zählt für Altersgrenzen): dort ändern
    if (user.providerId !== null && user.birthDate && user.birthDate.getTime() !== date.getTime()) {
      return { error: 'Dein Geburtsdatum kommt aus Cevi.DB. Ändere es bitte dort.', status: 400 };
    }
    // Bei Cevi-Name-Profilen ist das Geburtsdatum Teil des Logins: pro Abteilung eindeutig mit dem Namen
    if (user.nickname && isCeviNameProfile(user)) {
      const departmentIds = [
        ...new Set([user.homeDepartmentId, ...user.memberships.map((m) => m.departmentId)].filter(Boolean)),
      ] as string[];
      for (const departmentId of departmentIds) {
        const clash = (await findCeviNameMatches(prisma, departmentId, user.nickname, input.birthDate)).some(
          (m) => m.id !== userId
        );
        if (clash) {
          return {
            error: 'In deiner Abteilung gibt es schon ein Profil mit diesem Cevi-Namen und Geburtsdatum.',
            status: 409,
          };
        }
      }
    }
    data.birthDate = date;
  }
  if (input.email !== undefined) {
    const nextEmail = input.email.toLowerCase();
    if (nextEmail !== user.email) {
      if (!canChangeOwnEmail(user)) {
        return {
          error: user.providerId !== null
            ? 'Deine E-Mail kommt aus Cevi.DB. Ändere sie bitte dort.'
            : 'Deine E-Mail-Adresse lässt sich hier nicht mehr ändern.',
          status: 400,
        };
      }
      // Selbst eingetragen heisst unbestätigt: Die Adresse gilt erst nach einer Bestätigung als die eigene.
      // Alte Bestätigungslinks gelten für die alte Adresse und fallen weg.
      data.email = nextEmail;
      data.emailVerified = false;
      data.emailVerifiedAt = null;
      data.emailVerificationTokens = { deleteMany: {} };
    }
  }

  try {
    await prisma.user.update({ where: { id: userId }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { error: 'Diese E-Mail gehört bereits zu einem anderen Konto.', status: 409 };
    }
    throw err;
  }
  return { ok: true };
}
