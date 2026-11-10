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
      nickname?: string | null;
      ceviName?: string | null;
      phone?: string | null;
      email?: string | null;
    };
  },
  contactVisibility: string = 'BOTH'
): ResponsiblePersonDto {
  const allowPhone = contactVisibility === 'BOTH' || contactVisibility === 'PHONE';
  const allowEmail = (contactVisibility === 'BOTH' || contactVisibility === 'EMAIL') && Boolean(r.user.email && !PLACEHOLDER_EMAIL_REGEX.test(r.user.email));
  const nickname = r.user.nickname ?? r.user.ceviName ?? null;
  return {
    id: r.user.id,
    displayName: nickname
      ? `${r.user.firstName} / ${nickname}`
      : `${r.user.firstName} ${r.user.lastName ?? ''}`.trim(),
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    nickname,
    ceviName: nickname,
    phone: allowPhone ? r.user.phone : null,
    email: allowEmail ? r.user.email : null,
  };
}

/**
 * Anzeigename einer Schicht für Meldungen, Protokoll und Mails. Schichttitel sind optional:
 * ohne Titel steht die Arbeit an dessen Stelle, sonst «Schicht».
 */
export function shiftDisplayTitle(
  shift: { title?: string | null },
  task?: { title?: string | null } | null
): string {
  return shift.title?.trim() || task?.title?.trim() || 'Schicht';
}
