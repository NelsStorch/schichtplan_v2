/**
 * «Passwort vergessen» für Konten mit E-Mail und Passwort.
 *
 * 1. POST /api/auth/password-reset/request {email}: schickt einen Link (2 Stunden gültig) an die
 *    Adresse, falls es dazu ein Passwort-Konto gibt. Die Antwort ist immer gleich, damit sich nicht
 *    herausfinden lässt, welche E-Mails ein Konto haben.
 * 2. POST /api/auth/password-reset/confirm {token, password}: setzt das neue Passwort. Danach gelten
 *    ältere Login-Tokens nicht mehr (users.passwordChangedAt), die Person meldet sich neu an.
 *
 * In der DB steht nur der SHA-256-Hash des Tokens: Ein Datenbank-Auszug verrät keine gültigen Links.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RequestPasswordResetSchema, ResetPasswordSchema } from '@schichtplan/shared';
import { sendPasswordResetEmail } from '../services/email.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { RATE_LIMIT_ERROR } from '../services/ceviNameLogin.js';
import { getLoginPortalBaseUrl } from '../services/authSession.js';
import { trackUsage } from '../services/usageStats.js';

export const PASSWORD_RESET_TTL_HOURS = 2;

/** Höchstens 10 Anfragen pro IP und Stunde (gegen Mail-Bomben) */
const requestsByIp = createRateLimiter(60 * 60 * 1000, 10);
/** Höchstens 30 Versuche pro IP in 10 Minuten, ein Token einzulösen */
const confirmsByIp = createRateLimiter(10 * 60 * 1000, 30);

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const GENERIC_MESSAGE =
  'Falls es zu dieser E-Mail ein Konto mit Passwort gibt, haben wir dir einen Link geschickt. Prüfe auch den Spam-Ordner.';

const passwordResetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/auth/password-reset/request',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Link zum Zurücksetzen des Passworts anfordern',
        description:
          'Sendet einen Link zum Zurücksetzen des Passworts an die angegebene E-Mail-Adresse (2 Stunden gültig). Aus Sicherheitsgründen ist die Antwort stets identisch, unabhängig davon, ob ein Passwort-Konto existiert.',
        body: RequestPasswordResetSchema,
      },
    },
    async (request, reply) => {
      if (requestsByIp.hit(request.ip)) {
        return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
      }
      const input = request.body as z.output<typeof RequestPasswordResetSchema>;
      const email = input.email.toLowerCase();
      trackUsage('PASSWORD_RESET', { dim: 'REQUEST' });

      const user = await fastify.prisma.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, nickname: true, firstName: true },
      });
      // Nur Passwort-Konten: Cevi.DB- und Cevi-Name-Konten melden sich anders an
      if (!user?.passwordHash) return { success: true, message: GENERIC_MESSAGE };

      // Höchstens ein Link pro Minute und Konto
      const recent = await fastify.prisma.passwordResetToken.findFirst({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 1000) } },
        select: { id: true },
      });
      if (recent) return { success: true, message: GENERIC_MESSAGE };

      const token = crypto.randomBytes(32).toString('base64url');
      await fastify.prisma.$transaction([
        fastify.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        fastify.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000),
          },
        }),
      ]);

      const resetUrl = `${getLoginPortalBaseUrl(process.env, request.headers.host)}/passwort-zuruecksetzen?token=${token}`;
      const sent = await sendPasswordResetEmail({
        to: email,
        name: user.nickname || user.firstName,
        resetUrl,
        expiresHours: PASSWORD_RESET_TTL_HOURS,
        organization: request.organization,
      });
      if (!sent) request.log.warn({ userId: user.id }, 'Passwort-Reset: E-Mail konnte nicht gesendet werden');
      request.log.info({ userId: user.id }, 'Passwort-Reset angefordert');

      return { success: true, message: GENERIC_MESSAGE };
    }
  );

  fastify.post(
    '/api/auth/password-reset/confirm',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Neues Passwort mit Reset-Token setzen',
        description:
          'Setzt ein neues Passwort für das Benutzerkonto anhand des per E-Mail erhaltenen Tokens. Bestehende Sitzungen werden dadurch ungültig.',
        body: ResetPasswordSchema,
      },
    },
    async (request, reply) => {
      if (confirmsByIp.hit(request.ip)) {
        return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
      }
      const input = request.body as z.output<typeof ResetPasswordSchema>;

      const record = await fastify.prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(input.token) },
        select: { id: true, userId: true, expiresAt: true },
      });
      if (!record || record.expiresAt < new Date()) {
        if (record) await fastify.prisma.passwordResetToken.delete({ where: { id: record.id } });
        return reply.status(400).send({
          error: 'Dieser Link ist ungültig oder abgelaufen. Fordere bitte einen neuen an.',
          code: 'INVALID_TOKEN',
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const now = new Date();
      // Wer den Link aus der E-Mail öffnet, hat die Adresse bestätigt
      await fastify.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId }, select: { emailVerifiedAt: true } });
        await tx.user.update({
          where: { id: record.userId },
          data: {
            passwordHash,
            passwordChangedAt: now,
            emailVerified: true,
            emailVerifiedAt: user.emailVerifiedAt ?? now,
          },
        });
        await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
      });

      request.log.info({ userId: record.userId }, 'Passwort zurückgesetzt');
      trackUsage('PASSWORD_RESET', { dim: 'DONE' });
      return { success: true, message: 'Dein Passwort ist geändert. Du kannst dich jetzt damit anmelden.' };
    }
  );
};

export default passwordResetRoutes;
