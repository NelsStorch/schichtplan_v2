import { Prisma, type PrismaClient } from '../db.js';
import { PLACEHOLDER_EMAIL_REGEX, type UpdateProfileInput } from '@schichtplan/shared';
import { findCeviNameMatches, isCeviNameProfile } from './ceviNameLogin.js';

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
      ceviName: true,
      passwordHash: true,
      ceviDbId: true,
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
  if (input.address !== undefined) data.address = input.address;
  if (input.shiftReminders !== undefined) data.shiftRemindersEnabled = input.shiftReminders;
  if (input.birthDate !== undefined) {
    const date = new Date(`${input.birthDate}T00:00:00Z`);
    if (isNaN(date.getTime()) || date > new Date()) return { error: 'Ungültiges Geburtsdatum', status: 400 };
    // Bei Cevi.DB-Konten kommt das Geburtsdatum aus Cevi.DB (zählt für Altersgrenzen): dort ändern
    if (user.ceviDbId !== null && user.birthDate && user.birthDate.getTime() !== date.getTime()) {
      return { error: 'Dein Geburtsdatum kommt aus Cevi.DB. Ändere es bitte dort.', status: 400 };
    }
    // Bei Cevi-Name-Profilen ist das Geburtsdatum Teil des Logins: pro Abteilung eindeutig mit dem Namen
    if (user.ceviName && isCeviNameProfile(user)) {
      const departmentIds = [
        ...new Set([user.homeDepartmentId, ...user.memberships.map((m) => m.departmentId)].filter(Boolean)),
      ] as string[];
      for (const departmentId of departmentIds) {
        const clash = (await findCeviNameMatches(prisma, departmentId, user.ceviName, input.birthDate)).some(
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
    const hasRealEmail = Boolean(user.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));
    // Selbst eingetragen heisst unbestätigt: Die Adresse gilt erst nach einer Bestätigung als die eigene
    if (!hasRealEmail) {
      data.email = input.email.toLowerCase();
      data.emailVerified = false;
      data.emailVerifiedAt = null;
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
