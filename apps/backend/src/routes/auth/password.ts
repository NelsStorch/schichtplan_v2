import { FastifyPluginAsync, } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Prisma } from '../../db.js';
import {
  LoginSchema,
  RegisterHelperSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
} from '@schichtplan/shared';
import { sendAccountExistsEmail, sendVerificationEmail } from '../../services/email.js';
import {
  RATE_LIMIT_ERROR,
} from '../../services/ceviNameLogin.js';
import { trackUsage } from '../../services/usageStats.js';
import { createRateLimiter } from '../../services/rateLimit.js';

import {
  loginFailuresByIp,
  loginFailuresByEmail,
  mailRequestsByIp,
  accountExistsMailsByEmail,
  setAuthCookie,
  getLoginPortalBaseUrl,
  loadUserDto,
  ensureHelperMembership,
  registrationAccepted,
} from '../../services/authSession.js';


export function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Vergleichswert für Logins ohne Konto (gleich viel Rechenzeit wie ein echter Passwortvergleich) */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

/** Höchstens 30 Versuche pro IP in 10 Minuten, ein E-Mail-Token einzulösen */
const verifyEmailByIp = createRateLimiter(10 * 60 * 1000, 30);

/** Anmeldung und Registrierung mit E-Mail und Passwort, E-Mail-Bestätigung */
const passwordAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // 4. Normales Login mit Passwort
  fastify.post(
    '/api/auth/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Anmeldung mit E-Mail und Passwort',
        description: 'Meldet einen Benutzer mit E-Mail und Passwort an und setzt das HttpOnly Session-Cookie.',
        body: LoginSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof LoginSchema>;

    const { email, password } = input;
    // Gegen das Durchprobieren von Passwörtern: Fehlversuche pro IP und pro Konto bremsen
    const emailKey = email.trim().toLowerCase();
    // Zuerst zählen, dann prüfen: sonst kämen viele gleichzeitige Versuche alle an der Bremse vorbei.
    // Ein erfolgreicher Login nimmt seinen Versuch wieder zurück.
    const ipBlocked = loginFailuresByIp.hit(request.ip);
    const emailBlocked = loginFailuresByEmail.hit(emailKey);
    if (ipBlocked || emailBlocked) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const user = await fastify.prisma.user.findUnique({
      where: { email: emailKey },
      select: { id: true, email: true, passwordHash: true, emailVerified: true, isGlobalAdmin: true },
    });

    // Auch ohne Konto ein Passwort prüfen: sonst verriete die Antwortzeit, ob es die Adresse gibt
    const passwordOk = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !passwordOk) {
      trackUsage('LOGIN_FAILED', { dim: 'PASSWORD_WRONG', departmentId: request.tenant?.id });
      return reply.status(401).send({ error: 'E-Mail oder Passwort falsch' });
    }
    loginFailuresByIp.undo(request.ip);
    loginFailuresByEmail.reset(emailKey);

    // E-Mail-Bestätigung erzwingen
    if (!user.emailVerified) {
      return reply.status(403).send({
        error: 'Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Bestätigungslink gesendet.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = fastify.signAuthToken({
      id: user.id,
      email: user.email || `${user.id}@cevi-schichtplan.ch`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr: 'password',
    });

    setAuthCookie(reply, token);
    trackUsage('LOGIN', { dim: 'password', departmentId: request.tenant?.id });

    // Das Token steht nur im httpOnly-Cookie, nicht in der Antwort (für Skripte unerreichbar)
    return {
      user: await loadUserDto(fastify.prisma, user.id, request.tenant?.id ?? null),
    };
  });

  // 5. Helfer registrieren mit Passwort (erfordert E-Mail-Bestätigung)
  fastify.post(
    '/api/auth/register-helper',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Neues Helferkonto mit Passwort registrieren',
        description: 'Registriert ein neues Helferkonto mit E-Mail und Passwort. Sendet einen Bestätigungslink per E-Mail.',
        body: RegisterHelperSchema,
      },
    },
    async (request, reply) => {
    if (mailRequestsByIp.hit(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const input = request.body as z.output<typeof RegisterHelperSchema>;

    const { email, password, firstName, lastName, phone } = input;
    // Neues Feld `nickname`, `ceviName` bleibt für ältere Clients
    const nickname = input.nickname || input.ceviName;
    const cleanEmail = email.toLowerCase().trim();
    const existing = await fastify.prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    // Immer hashen, auch wenn es die Adresse schon gibt: sonst verriete die Antwortzeit, ob ein Konto existiert
    const passwordHash = await bcrypt.hash(password, 10);

    // Eine nur selbst eingetragene, unbestätigte Adresse (Konto ohne Passwort und ohne Cevi.DB, z. B.
    // Cevi-Name-Profil) gehört nicht nachweislich diesem Konto. Sonst könnte jemand eine fremde Adresse
    // besetzen und die Person damit von der Registrierung aussperren. Wie beim Cevi.DB-Login: freigeben.
    const releaseUnverified = Boolean(
      existing && !existing.emailVerified && !existing.passwordHash && existing.providerId === null
    );

    // Sonst nicht übernehmen: Ein bestehendes Konto bekäme von irgendwem ein Passwort und fremde Namen.
    // Die Antwort ist dieselbe wie bei einem neuen Konto: sonst liesse sich durchprobieren, wer ein Konto
    // hat. Die Person mit dieser Adresse bekommt stattdessen einen Hinweis per Mail.
    if (existing && !releaseUnverified) {
      const loginPortalUrl = getLoginPortalBaseUrl(process.env, request.headers.host);
      if (!accountExistsMailsByEmail.hit(cleanEmail)) await sendAccountExistsEmail({
        to: cleanEmail,
        name: existing.nickname || existing.firstName,
        loginUrl: `${loginPortalUrl}/`,
        resetUrl: `${loginPortalUrl}/passwort-vergessen`,
        organization: request.organization,
      });
      return registrationAccepted(cleanEmail);
    }

    let user: { id: string; nickname: string | null; firstName: string };
    try {
      user = await fastify.prisma.$transaction(async (tx) => {
        if (existing && releaseUnverified) {
          await tx.emailVerificationToken.deleteMany({ where: { userId: existing.id } });
          await tx.user.update({ where: { id: existing.id }, data: { email: null } });
          request.log.warn({ userId: existing.id }, 'Registrierung: unbestätigte E-Mail von anderem Konto gelöst');
        }
        return tx.user.create({
          data: {
            email: cleanEmail,
            passwordHash,
            firstName,
            lastName: lastName?.trim() || null,
            nickname: nickname || null,
            phone: phone || null,
            emailVerified: false,
            emailVerifiedAt: null,
          },
        });
      });
    } catch (err) {
      // Gleichzeitig hat ein anderes Konto die Adresse bekommen: gleiche Antwort wie bei «gibt es schon»
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return registrationAccepted(cleanEmail);
      }
      throw err;
    }

    if (request.tenant) {
      await ensureHelperMembership(fastify.prisma, request.tenant.id, user.id);
    }
    trackUsage('REGISTER', { dim: 'password', departmentId: request.tenant?.id });

    // Token erzeugen & altes löschen (in der DB nur der SHA-256-Hash, wie beim Passwort-Reset)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await fastify.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    await fastify.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: hashVerificationToken(verificationToken),
        email: cleanEmail,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 Stunden
      },
    });

    // Bestätigungs-E-Mail versenden
    const loginPortalUrl = getLoginPortalBaseUrl(process.env, request.headers.host);
    const verificationUrl = `${loginPortalUrl}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail({
      to: cleanEmail,
      name: user.nickname || user.firstName,
      verificationUrl,
      deletesUnconfirmed: true,
      organization: request.organization,
    });

    // Absichtlich KEIN Auth-Cookie setzen, damit die E-Mail zuerst verifiziert werden muss
    return registrationAccepted(cleanEmail);
  });

  // 5a. Bestätigungs-E-Mail erneut anfordern
  fastify.post(
    '/api/auth/resend-verification',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Bestätigungs-E-Mail erneut senden',
        description: 'Sendet einen neuen E-Mail-Bestätigungslink an die angegebene Adresse.',
        body: ResendVerificationSchema,
      },
    },
    async (request, reply) => {
    if (mailRequestsByIp.hit(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const input = request.body as z.output<typeof ResendVerificationSchema>;

    const cleanEmail = input.email.toLowerCase().trim();
    const user = await fastify.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // Immer dieselbe Antwort: Ob es ein Konto gibt, ob es schon bestätigt ist oder eben ein Link ging,
    // soll sich hier nicht abfragen lassen
    const genericAnswer = {
      success: true,
      message: 'Falls es zu dieser E-Mail ein unbestätigtes Konto gibt, haben wir einen neuen Bestätigungslink gesendet.',
    };
    if (!user || user.emailVerified) return genericAnswer;

    const recentToken = await fastify.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });
    if (recentToken) return genericAnswer;

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await fastify.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });
    await fastify.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: hashVerificationToken(verificationToken),
        email: cleanEmail,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const loginPortalUrl = getLoginPortalBaseUrl(process.env, request.headers.host);
    const verificationUrl = `${loginPortalUrl}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail({
      to: cleanEmail,
      name: user.nickname || user.firstName,
      verificationUrl,
      // Unbestätigte Passwort-Konten löscht der Aufräumjob (Cevi-Name-Profile mit E-Mail nicht)
      deletesUnconfirmed: Boolean(user.passwordHash && user.providerId === null),
      organization: request.organization,
    });

    return genericAnswer;
  });

  // 5b. E-Mail-Adresse mit Token bestätigen (POST für UI & API)
  fastify.post(
    '/api/auth/verify-email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'E-Mail-Adresse mit Token bestätigen',
        description: 'Aktiviert das Benutzerkonto mit dem Token aus der Bestätigungs-E-Mail.',
        body: VerifyEmailSchema,
      },
    },
    async (request, reply) => {
    if (verifyEmailByIp.hit(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const input = request.body as z.output<typeof VerifyEmailSchema>;

    const { token } = input;
    const hashed = hashVerificationToken(token);
    // Unterstützt gehashte Tokens sowie ältere Klartext-Tokens für nahtlose Rückwärtskompatibilität
    const tokenRecord = await fastify.prisma.emailVerificationToken.findFirst({
      where: { OR: [{ token: hashed }, { token }] },
      include: { user: true },
    });

    if (!tokenRecord) {
      return reply.status(400).send({
        error: 'Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.',
      });
    }

    if (tokenRecord.expiresAt < new Date()) {
      await fastify.prisma.emailVerificationToken.delete({ where: { id: tokenRecord.id } });
      return reply.status(400).send({
        error: 'Dieser Bestätigungslink ist abgelaufen. Bitte fordere einen neuen an.',
        expired: true,
        email: tokenRecord.email,
      });
    }

    const updatedUser = await fastify.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
          email: tokenRecord.email,
        },
      });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: tokenRecord.userId },
      });
      return u;
    });

    trackUsage('EMAIL_VERIFIED');

    // Bewusst kein automatisches Login: Wer die Mail bekommt, hat das Konto nicht unbedingt angelegt
    // (jemand kann ein Konto mit fremder E-Mail vorbereiten). Anmelden geht nur mit dem eigenen Passwort.
    return {
      success: true,
      message: 'E-Mail-Adresse bestätigt. Melde dich jetzt mit deinem Passwort an.',
      email: updatedUser.email,
      name: updatedUser.nickname || updatedUser.firstName,
    };
  });

  // 5c. Direkter Link-Klick aus E-Mail (leitet auf Next.js Verify-Page weiter)
  fastify.get<{ Querystring: { token?: string } }>(
    '/api/auth/verify-email',
    {
      schema: {
        hide: true,
        querystring: z.object({ token: z.string().max(200).optional() }),
      },
    },
    async (request, reply) => {
      const token = request.query.token;
      const loginBase = getLoginPortalBaseUrl(process.env, request.headers.host);
      if (!token) {
        return reply.redirect(`${loginBase}/verify-email?error=missing_token`);
      }
      return reply.redirect(`${loginBase}/verify-email?token=${encodeURIComponent(token)}`);
    }
  );
};

export default passwordAuthRoutes;
