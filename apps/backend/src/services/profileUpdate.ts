import { Prisma, type PrismaClient } from '@prisma/client';
import { PLACEHOLDER_EMAIL_REGEX, type UpdateProfileInput } from '@schichtplan/shared';

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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { error: 'Benutzerkonto nicht gefunden', status: 404 };

  const data: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address;
  if (input.birthDate !== undefined) {
    const date = new Date(`${input.birthDate}T00:00:00Z`);
    if (isNaN(date.getTime()) || date > new Date()) return { error: 'Ungültiges Geburtsdatum', status: 400 };
    data.birthDate = date;
  }
  if (input.email !== undefined) {
    const hasRealEmail = Boolean(user.email && !PLACEHOLDER_EMAIL_REGEX.test(user.email));
    if (!hasRealEmail) data.email = input.email.toLowerCase();
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
