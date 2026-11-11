import type { PrismaClient } from '../generated/prisma/client.js';
import { sendEmail } from './email.js';
import { sendPushToUser } from './webPush.js';
import { eventUrl } from './shiftReminders.js';

/**
 * Sendet Bon-Erinnerungen (E-Mail und/oder Web Push) an Helfende mit offenen Bons:
 * 1. Schichtende-Erinnerung: ~30 Min nach Ende der Schicht (Fenster: 20–60 Min nach Schichtende)
 * 2. Festende-Erinnerung: ~1 Std vor Festende (Fenster: 40–80 Min vor der letzten Schicht des Anlasses)
 */
export async function sendDueCateringReminders(
  prisma: PrismaClient,
  now = new Date()
): Promise<number> {
  // Finde alle Events mit aktiven Bons und aktiver Erinnerung
  const events = await prisma.event.findMany({
    where: {
      cateringTokensEnabled: true,
      cateringRemindersEnabled: true,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      department: { select: { slug: true, name: true, organization: true } },
      shifts: {
        select: {
          id: true,
          endTime: true,
        },
        orderBy: { endTime: 'desc' },
      },
    },
  });

  if (events.length === 0) return 0;

  let totalSent = 0;

  for (const event of events) {
    if (event.shifts.length === 0) continue;

    const lastShiftEnd = event.shifts[0].endTime;
    const msUntilFestEnd = lastShiftEnd.getTime() - now.getTime();
    // Ca. 1 Stunde vor Festende (Fenster 30 bis 90 Minuten vor der letzten Schicht)
    const isNearFestEnd = msUntilFestEnd >= 30 * 60_000 && msUntilFestEnd <= 90 * 60_000;

    // Finde alle offenen digitalen Bons für dieses Event, die noch keine Erinnerung erhalten haben
    const openTokens = await prisma.cateringToken.findMany({
      where: {
        status: 'AVAILABLE',
        reminderSentAt: null,
        isPhysical: false,
        OR: [
          { shift: { eventId: event.id } },
          { signup: { shift: { eventId: event.id } } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            firstName: true,
            nickname: true,
            emailNotifyCateringTokens: true,
            pushNotifyCateringTokens: true,
            _count: { select: { pushSubscriptions: true } },
          },
        },
        shift: { select: { id: true, endTime: true, title: true } },
        signup: {
          select: {
            id: true,
            guestEmail: true,
            guestName: true,
            shift: { select: { id: true, endTime: true, title: true } },
          },
        },
      },
    });

    if (openTokens.length === 0) continue;

    // Gruppiere nach Person (userId oder guestEmail)
    type RecipientGroup = {
      user: (typeof openTokens)[0]['user'];
      guestEmail: string | null;
      guestName: string | null;
      tokens: Array<{ id: string; title: string }>;
      shiftEnd: Date | null;
    };

    const byPerson = new Map<string, RecipientGroup>();

    for (const t of openTokens) {
      const shiftEnd = t.shift?.endTime ?? t.signup?.shift?.endTime ?? null;
      const key = t.user?.id ? `user_${t.user.id}` : t.signup?.guestEmail ? `guest_${t.signup.guestEmail}` : null;
      if (!key) continue;

      let group = byPerson.get(key);
      if (!group) {
        group = {
          user: t.user,
          guestEmail: t.signup?.guestEmail ?? null,
          guestName: t.signup?.guestName ?? null,
          tokens: [],
          shiftEnd,
        };
        byPerson.set(key, group);
      }
      group.tokens.push({ id: t.id, title: t.title });
    }

    for (const group of byPerson.values()) {
      let isDue = false;

      // 1. Schichtende-Trigger (20-60 Min nach Schichtende)
      if (group.shiftEnd) {
        const msSinceEnd = now.getTime() - group.shiftEnd.getTime();
        if (msSinceEnd >= 20 * 60_000 && msSinceEnd <= 60 * 60_000) {
          isDue = true;
        }
      }

      // 2. Festende-Trigger (ca. 1 Stunde vor Festende)
      if (isNearFestEnd) {
        isDue = true;
      }

      if (!isDue) continue;

      const recipientName = group.user?.nickname || group.user?.firstName || group.guestName || 'Helfende Person';
      const count = group.tokens.length;
      const tokenNames = group.tokens.map((x) => x.title).join(', ');
      const targetUrl = `${eventUrl(event.department.slug, event.slug, event.department.organization)}/meine-schichten`;

      let sent = false;

      // Web Push
      if (
        group.user &&
        group.user.pushNotifyCateringTokens !== false &&
        group.user._count.pushSubscriptions > 0
      ) {
        try {
          await sendPushToUser(prisma, group.user.id, {
            title: `🎁 Verpflegungs-Bons nicht vergessen!`,
            body: `Hallo ${recipientName}! Du hast bei «${event.title}» noch ${count} offene Gutscheine (${tokenNames}). Hol sie dir am Stand ab!`,
            url: targetUrl,
            tag: `catering-reminder-${event.id}`,
          });
          sent = true;
        } catch {}
      }

      // E-Mail
      const email = (group.user?.emailVerified && group.user?.email) ? group.user.email : group.guestEmail;
      if (email && (group.user ? group.user.emailNotifyCateringTokens !== false : true)) {
        try {
          await sendEmail({
            to: email,
            organization: event.department.organization,
            subject: `🎁 Verpflegungs-Gutschein nicht vergessen – ${event.title}`,
            text: `Hallo ${recipientName}!\n\nDanke für deinen grossartigen Helfereinsatz bei «${event.title}»!\n\nDu hast noch ${count} un-eingelöste Verpflegungs- oder Getränkegutscheine (${tokenNames}).\n\nVergiss nicht, dein Helferessen und dein Getränk vor Festende am Stand abzuholen!\n\nDeine Bons aufrufen: ${targetUrl}\n\nLiebe Grüsse\nDein OK von ${event.title}`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px 16px; color: #1e293b; line-height: 1.5;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <span style="display: inline-block; background-color: #f0fdf4; color: #15803d; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 13px;">🎁 Noch offene Verpflegungs-Bons</span>
                  <h1 style="font-size: 22px; font-weight: 800; margin: 12px 0 4px; color: #0f172a;">En Guete am Stand!</h1>
                  <p style="font-size: 14px; color: #64748b; margin: 0;">${event.title}</p>
                </div>
                <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                  <p style="margin-top: 0; font-size: 15px;">Hallo <strong>${recipientName}</strong>,</p>
                  <p style="font-size: 14px; color: #334155;">Vielen Dank für deinen tatkräftigen Helfereinsatz! Bei «<strong>${event.title}</strong>» warten noch un-eingelöste Bons auf dich:</p>
                  <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
                    <strong style="color: #0369a1; font-size: 14px;">${count} offene Gutscheine:</strong>
                    <div style="font-size: 14px; color: #0f172a; margin-top: 4px; font-weight: 600;">${tokenNames}</div>
                  </div>
                  <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Hol dir dein Helferessen und dein Getränk vor Festende am Stand ab. Dein Bon kann einfach am Smartphone per Schieberegler entwertet werden.</p>
                </div>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${targetUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 12px 28px; border-radius: 9999px; display: inline-block;">Gutscheine öffnen</a>
                </div>
                <div style="text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                  Cevi Schichtplan · <a href="${targetUrl}" style="color: #64748b;">Benachrichtigungseinstellungen ändern</a>
                </div>
              </div>
            `,
          });
          sent = true;
        } catch {}
      }

      // Markiere diese Tokens atomar als erinnert
      const tokenIds = group.tokens.map((x) => x.id);
      await prisma.cateringToken.updateMany({
        where: { id: { in: tokenIds } },
        data: { reminderSentAt: now },
      });

      if (sent) totalSent++;
    }
  }

  return totalSent;
}
