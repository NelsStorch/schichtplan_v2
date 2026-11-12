/**
 * Zwei-Faktor-Anmeldung (Authenticator-App, TOTP). Logik in services/twoFactor.ts.
 *
 * Login: Passwort-Login (immer) und Cevi.DB/Hitobito-Login (nur mit `totpOnProviderLogin`) setzen bei
 * aktiver 2FA statt des Login-Cookies ein Challenge-Cookie. POST /api/auth/2fa/verify löst es mit dem
 * Code ein und stellt erst dann das Login-Token aus.
 *
 * Profil: einrichten (setup → enable), Einstellung für den Cevi.DB-Login, neue Wiederherstellungscodes,
 * ausschalten. Alles ausser der Einrichtung verlangt einen aktuellen Code: Eine fremde, offene Sitzung
 * allein reicht nicht, um 2FA abzuschalten.
 */
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getOrganizationByDbType, isPlaceholderEmail } from '@schichtplan/shared';
import { RATE_LIMIT_ERROR } from '../../services/nicknameLogin.js';
import { loadUserDto, setAuthCookie } from '../../services/authSession.js';
import { trackUsage } from '../../services/usageStats.js';
import {
  clearChallengeCookie,
  consumeSecondFactor,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  isTwoFactorConfigured,
  otpauthUrl,
  readChallengeCookie,
  replaceRecoveryCodes,
  twoFactorFailuresByIp,
  twoFactorFailuresByUser,
  verifyTotp,
} from '../../services/twoFactor.js';

const CodeSchema = z.object({
  code: z.string().trim().min(1).max(40).describe('6-stelliger Code aus der App oder ein Wiederherstellungscode'),
});

const twoFactorSelect = {
  id: true,
  email: true,
  firstName: true,
  nickname: true,
  isGlobalAdmin: true,
  passwordHash: true,
  providerId: true,
  totpSecret: true,
  totpPendingSecret: true,
  totpEnabledAt: true,
  totpLastStep: true,
  totpOnProviderLogin: true,
} as const;

const NOT_CONFIGURED = 'Die Zwei-Faktor-Anmeldung ist auf diesem Server noch nicht eingerichtet.';

const twoFactorRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Zweiten Faktor mit Versuchsbremse prüfen. Gibt bei Fehler direkt die Antwort zurück.
   * Zuerst zählen, dann prüfen (wie beim Passwort-Login), ein Erfolg nimmt den Versuch zurück.
   */
  async function checkCode(
    request: FastifyRequest,
    reply: FastifyReply,
    user: { id: string; totpSecret: string | null; totpLastStep: number | null },
    code: string
  ) {
    const ipBlocked = twoFactorFailuresByIp.hit(request.ip);
    const userBlocked = twoFactorFailuresByUser.hit(user.id);
    if (ipBlocked || userBlocked) {
      reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
      return null;
    }
    const result = await consumeSecondFactor(fastify.prisma, user, code);
    if (!result.ok) {
      trackUsage('LOGIN_FAILED', { dim: 'TWO_FACTOR_WRONG' });
      reply.status(401).send({ error: 'Der Code stimmt nicht oder wurde schon verwendet.', code: 'TWO_FACTOR_WRONG' });
      return null;
    }
    twoFactorFailuresByIp.undo(request.ip);
    twoFactorFailuresByUser.reset(user.id);
    return result;
  }

  async function loadSelf(request: FastifyRequest) {
    return fastify.prisma.user.findUnique({ where: { id: request.user.id }, select: twoFactorSelect });
  }

  // ------------------------------------------------------------ Login abschliessen

  fastify.get(
    '/api/auth/2fa/challenge',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Offene Zwei-Faktor-Anmeldung abfragen',
        description: 'Sagt der Login-Seite, ob gerade ein Code erwartet wird.',
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const challenge = readChallengeCookie(request);
      if (!challenge) return reply.status(404).send({ error: 'Keine offene Anmeldung. Bitte melde dich nochmals an.' });
      return { pending: true, viaProvider: challenge.amr !== 'password' };
    }
  );

  fastify.post(
    '/api/auth/2fa/verify',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Anmeldung mit Zwei-Faktor-Code abschliessen',
        description:
          'Prüft den Code aus der Authenticator-App (oder einen Wiederherstellungscode) zur offenen Anmeldung und setzt danach das Session-Cookie.',
        body: CodeSchema,
      },
    },
    async (request, reply) => {
      const challenge = readChallengeCookie(request);
      if (!challenge) {
        return reply.status(400).send({
          error: 'Die Anmeldung ist abgelaufen. Bitte melde dich nochmals an.',
          code: 'CHALLENGE_EXPIRED',
        });
      }
      const user = await fastify.prisma.user.findUnique({ where: { id: challenge.uid }, select: twoFactorSelect });
      if (!user?.totpEnabledAt) {
        clearChallengeCookie(reply);
        return reply.status(400).send({ error: 'Die Anmeldung ist abgelaufen. Bitte melde dich nochmals an.', code: 'CHALLENGE_EXPIRED' });
      }

      const { code } = request.body as z.output<typeof CodeSchema>;
      const result = await checkCode(request, reply, user, code);
      if (!result) return reply;

      clearChallengeCookie(reply);
      const token = fastify.signAuthToken({
        id: user.id,
        email: user.email || `${user.id}@${getOrganizationByDbType(request.organization).domain}`,
        isGlobalAdmin: user.isGlobalAdmin,
        amr: challenge.amr,
      });
      setAuthCookie(reply, token);
      trackUsage('LOGIN', { dim: challenge.amr, departmentId: request.tenant?.id });
      trackUsage('TWO_FACTOR', { dim: result.method === 'totp' ? 'LOGIN_TOTP' : 'LOGIN_RECOVERY' });

      const recoveryCodesLeft =
        result.method === 'recovery'
          ? await fastify.prisma.twoFactorRecoveryCode.count({ where: { userId: user.id, usedAt: null } })
          : null;
      if (result.method === 'recovery') {
        request.log.info({ userId: user.id, recoveryCodesLeft }, '2FA: Login mit Wiederherstellungscode');
      }

      return {
        user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null),
        redirectUrl: challenge.next ?? null,
        recoveryCodesLeft,
      };
    }
  );

  fastify.delete(
    '/api/auth/2fa/challenge',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Offene Zwei-Faktor-Anmeldung abbrechen',
        description: 'Löscht das Challenge-Cookie.',
      },
    },
    async (_request, reply) => {
      clearChallengeCookie(reply);
      return { ok: true };
    }
  );

  // ------------------------------------------------------------ Einrichten im Profil

  fastify.post(
    '/api/auth/2fa/setup',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Zwei-Faktor-Anmeldung einrichten (Schritt 1)',
        description:
          'Erzeugt ein neues Secret und liefert QR-Code und Schlüssel für die Authenticator-App. Aktiv wird 2FA erst mit dem ersten Code (/api/auth/2fa/enable). Mit Passwort-Konto ist das aktuelle Passwort nötig.',
        security: [{ bearerAuth: [] }],
        body: z.object({ currentPassword: z.string().max(200).optional() }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!isTwoFactorConfigured()) return reply.status(503).send({ error: NOT_CONFIGURED });
      const user = await loadSelf(request);
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (!user.passwordHash && !user.providerId) {
        return reply.status(400).send({ error: 'Zwei-Faktor gibt es nur für Konten mit Passwort oder Verbands-Login.' });
      }
      if (user.totpEnabledAt) {
        return reply.status(409).send({ error: 'Die Zwei-Faktor-Anmeldung ist schon eingeschaltet.' });
      }
      if (user.passwordHash) {
        const { currentPassword } = request.body as { currentPassword?: string };
        // Gleiche Bremse wie bei falschen Codes: sonst liesse sich hier das Passwort durchprobieren
        if (twoFactorFailuresByUser.isBlocked(user.id)) {
          return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
        }
        if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
          twoFactorFailuresByUser.hit(user.id);
          return reply.status(401).send({ error: 'Das Passwort stimmt nicht.', code: 'CURRENT_PASSWORD_WRONG' });
        }
      }

      const secret = generateTotpSecret();
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { totpPendingSecret: encryptSecret(secret) },
      });

      const org = getOrganizationByDbType(request.organization);
      const account = user.email && !isPlaceholderEmail(user.email) ? user.email : user.nickname || user.firstName;
      const url = otpauthUrl(secret, account, org.name);
      const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' });

      reply.header('Cache-Control', 'no-store');
      // Schlüssel in Vierergruppen: leichter abzutippen, wenn der QR-Code nicht geht
      return { secret: secret.match(/.{1,4}/g)!.join(' '), otpauthUrl: url, qrDataUrl };
    }
  );

  fastify.post(
    '/api/auth/2fa/enable',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Zwei-Faktor-Anmeldung einschalten (Schritt 2)',
        description:
          'Bestätigt die Einrichtung mit dem ersten Code aus der App. Gibt einmalig 10 Wiederherstellungscodes zurück.',
        security: [{ bearerAuth: [] }],
        body: CodeSchema.extend({
          onProviderLogin: z.boolean().optional().describe('Auch beim Login über Cevi.DB/Hitobito nach dem Code fragen'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!isTwoFactorConfigured()) return reply.status(503).send({ error: NOT_CONFIGURED });
      const user = await loadSelf(request);
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (user.totpEnabledAt) return reply.status(409).send({ error: 'Die Zwei-Faktor-Anmeldung ist schon eingeschaltet.' });
      if (!user.totpPendingSecret) {
        return reply.status(400).send({ error: 'Bitte starte die Einrichtung nochmals.', code: 'SETUP_MISSING' });
      }

      const input = request.body as { code: string; onProviderLogin?: boolean };
      if (twoFactorFailuresByUser.hit(user.id)) {
        return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
      }
      let secret: string;
      try {
        secret = decryptSecret(user.totpPendingSecret);
      } catch {
        return reply.status(400).send({ error: 'Bitte starte die Einrichtung nochmals.', code: 'SETUP_MISSING' });
      }
      const step = verifyTotp(secret, input.code, null);
      if (step === null) {
        return reply.status(401).send({
          error: 'Der Code stimmt nicht. Prüfe, ob die Uhrzeit auf dem Handy stimmt, und versuche es mit dem nächsten Code.',
          code: 'TWO_FACTOR_WRONG',
        });
      }
      twoFactorFailuresByUser.reset(user.id);

      // Nur übernehmen, wenn das Secret inzwischen nicht ersetzt wurde (zweites Fenster mit neuem QR-Code)
      const updated = await fastify.prisma.user.updateMany({
        where: { id: user.id, totpPendingSecret: user.totpPendingSecret, totpEnabledAt: null },
        data: {
          totpSecret: user.totpPendingSecret,
          totpPendingSecret: null,
          totpEnabledAt: new Date(),
          totpLastStep: step,
          // Standard aus: beim Verbands-Login nur auf ausdrücklichen Wunsch nach dem Code fragen
          totpOnProviderLogin: input.onProviderLogin ?? false,
        },
      });
      if (updated.count !== 1) {
        return reply.status(409).send({ error: 'Bitte starte die Einrichtung nochmals.', code: 'SETUP_MISSING' });
      }
      const recoveryCodes = await replaceRecoveryCodes(fastify.prisma, user.id);

      trackUsage('TWO_FACTOR', { dim: 'ENABLE' });
      request.log.info({ userId: user.id }, '2FA eingeschaltet');
      reply.header('Cache-Control', 'no-store');
      return {
        recoveryCodes,
        user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null),
      };
    }
  );

  fastify.put(
    '/api/auth/2fa/settings',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Zwei-Faktor-Einstellungen ändern',
        description: 'Legt fest, ob auch beim Login über Cevi.DB/Hitobito nach dem Code gefragt wird. Verlangt einen aktuellen Code.',
        security: [{ bearerAuth: [] }],
        body: CodeSchema.extend({ onProviderLogin: z.boolean() }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = await loadSelf(request);
      if (!user?.totpEnabledAt) return reply.status(400).send({ error: 'Die Zwei-Faktor-Anmeldung ist nicht eingeschaltet.' });
      const input = request.body as { code: string; onProviderLogin: boolean };
      if (!(await checkCode(request, reply, user, input.code))) return reply;

      await fastify.prisma.user.update({ where: { id: user.id }, data: { totpOnProviderLogin: input.onProviderLogin } });
      request.log.info({ userId: user.id, onProviderLogin: input.onProviderLogin }, '2FA-Einstellung geändert');
      return { user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null) };
    }
  );

  fastify.post(
    '/api/auth/2fa/recovery-codes',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Neue Wiederherstellungscodes erzeugen',
        description: 'Ersetzt alle bisherigen Wiederherstellungscodes. Verlangt einen aktuellen Code.',
        security: [{ bearerAuth: [] }],
        body: CodeSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = await loadSelf(request);
      if (!user?.totpEnabledAt) return reply.status(400).send({ error: 'Die Zwei-Faktor-Anmeldung ist nicht eingeschaltet.' });
      const { code } = request.body as z.output<typeof CodeSchema>;
      if (!(await checkCode(request, reply, user, code))) return reply;

      const recoveryCodes = await replaceRecoveryCodes(fastify.prisma, user.id);
      request.log.info({ userId: user.id }, '2FA: neue Wiederherstellungscodes');
      reply.header('Cache-Control', 'no-store');
      return { recoveryCodes, user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null) };
    }
  );

  fastify.post(
    '/api/auth/2fa/disable',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Zwei-Faktor-Anmeldung ausschalten',
        description: 'Schaltet 2FA aus und löscht Secret und Wiederherstellungscodes. Verlangt einen aktuellen Code.',
        security: [{ bearerAuth: [] }],
        body: CodeSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const user = await loadSelf(request);
      if (!user?.totpEnabledAt) return reply.status(400).send({ error: 'Die Zwei-Faktor-Anmeldung ist nicht eingeschaltet.' });
      const { code } = request.body as z.output<typeof CodeSchema>;
      if (!(await checkCode(request, reply, user, code))) return reply;

      await fastify.prisma.$transaction([
        fastify.prisma.user.update({
          where: { id: user.id },
          data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, totpOnProviderLogin: false },
        }),
        fastify.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      ]);
      trackUsage('TWO_FACTOR', { dim: 'DISABLE' });
      request.log.info({ userId: user.id }, '2FA ausgeschaltet');
      return { user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null) };
    }
  );
};

export default twoFactorRoutes;
