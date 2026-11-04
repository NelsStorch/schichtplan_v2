import { PLACEHOLDER_EMAIL_REGEX, type ResponsiblePersonDto } from '@schichtplan/shared';

/** Welche Erinnerungsstufen sind bei einer Schicht, die bald beginnt, schon vorbei? */
export function pastReminderMinutes(shiftStartTime: Date, pool: readonly number[], now = new Date()): number[] {
  const diffMs = shiftStartTime.getTime() - now.getTime();
  return pool.filter((m) => diffMs < m * 60_000);
}

export function toResponsiblePersonDto(
  r: {
    user: {
      id: string;
      firstName: string;
      lastName: string | null;
      ceviName?: string | null;
      phone?: string | null;
      email?: string | null;
    };
  },
  contactVisibility: string = 'BOTH'
): ResponsiblePersonDto {
  const allowPhone = contactVisibility === 'BOTH' || contactVisibility === 'PHONE';
  const allowEmail = (contactVisibility === 'BOTH' || contactVisibility === 'EMAIL') && Boolean(r.user.email && !PLACEHOLDER_EMAIL_REGEX.test(r.user.email));
  return {
    id: r.user.id,
    displayName: r.user.ceviName
      ? `${r.user.firstName} / ${r.user.ceviName}`
      : `${r.user.firstName} ${r.user.lastName ?? ''}`.trim(),
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    ceviName: r.user.ceviName,
    phone: allowPhone ? r.user.phone : null,
    email: allowEmail ? r.user.email : null,
  };
}
