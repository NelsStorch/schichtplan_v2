import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  CeviNameQuickLoginSchema,
  CeviNameRegisterSchema,
  getVocabulary,
  getOrganizationByDbType,
} from '@schichtplan/shared';
import {
  RATE_LIMIT_ERROR,
  findCeviNameMatches,
  pickCeviNameMatch,
  claimCeviNameAttempt,
  releaseCeviNameAttempt,
  tooManyRequests,
} from '../../services/ceviNameLogin.js';
import { trackUsage } from '../../services/usageStats.js';

import {
  setAuthCookie,
  cleanReturnTo,
  loadUserDto,
  ensureHelperMembership,
} from '../../services/authSession.js';


/** Passwortlose Anmeldung und Registrierung mit Cevi-Name und Geburtsdatum (nur an einer Abteilung) */
const ceviNameAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // 3. Cevi-Name-Login (ohne Passwort, nur an einer Abteilung)
  //    Cevi-Name + Geburtsdatum + Abteilung bestimmen das Profil. Nur reine Cevi-Name-Profile ohne
  //    Rechte lassen sich so anmelden; Cevi.DB- und Passwort-Konten verlangen ihren eigenen Login.
  //    Findet sich niemand, bietet das Login-Portal die Registrierung an (ceviname-register).
  fastify.post(
    '/api/auth/ceviname-login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Schnellanmeldung mit Cevi-Name und Geburtsdatum',
        description: 'Passwortlose Helfer-Anmeldung an einer Abteilung mit Cevi-Name und Geburtsdatum.',
        body: CeviNameQuickLoginSchema,
      },
    },
    async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const input = request.body as z.output<typeof CeviNameQuickLoginSchema>;
    const { departmentSlug, ceviName, birthDate, returnTo } = input;

    const department = await fastify.prisma.department.findUnique({
      where: {
        organization_slug: {
          organization: request.organization,
          slug: departmentSlug.toLowerCase(),
        },
      },
      select: { id: true, name: true },
    });
    if (!department) {
      return reply.status(404).send({ error: 'Diese Abteilung gibt es nicht.' });
    }

    // Sperre vor der Suche: Auch ein richtiges Geburtsdatum kommt während der Sperre nicht durch
    if (claimCeviNameAttempt(department.id, ceviName)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const matches = await findCeviNameMatches(fastify.prisma, department.id, ceviName, birthDate);
    const result = pickCeviNameMatch(matches);
    const vocab = getVocabulary(request.organization);
    // Nur ein erfolgreicher Login ist kein Fehlversuch
    if (result.kind === 'LOGIN') releaseCeviNameAttempt(department.id, ceviName);
    if (result.kind === 'USE_CEVIDB') {
      trackUsage('LOGIN_FAILED', { dim: 'CEVINAME_USE_CEVIDB', departmentId: department.id });
      return reply.status(403).send({
        code: 'USE_CEVIDB',
        error: `Zu diesem ${vocab.nickname} gibt es ein Konto mit ${vocab.authProvider}. Melde dich bitte mit ${vocab.authProvider} an.`,
      });
    }
    if (result.kind === 'USE_PASSWORD') {
      trackUsage('LOGIN_FAILED', { dim: 'CEVINAME_USE_PASSWORD', departmentId: department.id });
      return reply.status(403).send({
        code: 'USE_PASSWORD',
        error: `Zu diesem ${vocab.nickname} gibt es ein geschütztes Konto. Melde dich bitte mit E-Mail und Passwort an.`,
      });
    }
    if (result.kind === 'NONE') {
      trackUsage('LOGIN_FAILED', { dim: 'CEVINAME_NOT_FOUND', departmentId: department.id });
      return reply.status(404).send({
        code: 'NOT_FOUND',
        error: `Bei ${department.name} gibt es noch kein Profil mit diesem ${vocab.nickname} und Geburtsdatum.`,
      });
    }

    await ensureHelperMembership(fastify.prisma, department.id, result.userId);
    const user = await fastify.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    trackUsage('LOGIN', { dim: 'ceviname', departmentId: department.id });
    return signInCeviNameProfile(reply, user, returnTo);
  });

  // 3b. Neues Cevi-Name-Profil an einer Abteilung (nach einem Login ohne Treffer)
  fastify.post(
    '/api/auth/ceviname-register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Neues Helferprofil mit Cevi-Name anlegen',
        description: 'Erstellt ein neues passwortloses Helferprofil für eine Abteilung.',
        body: CeviNameRegisterSchema,
      },
    },
    async (request, reply) => {
    if (tooManyRequests(request.ip)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const input = request.body as z.output<typeof CeviNameRegisterSchema>;
    const { departmentSlug, ceviName, birthDate, firstName, lastName, phone, stufen, returnTo } = input;

    const department = await fastify.prisma.department.findUnique({
      where: {
        organization_slug: {
          organization: request.organization,
          slug: departmentSlug.toLowerCase(),
        },
      },
      select: { id: true, name: true },
    });
    if (!department) {
      return reply.status(404).send({ error: 'Diese Abteilung gibt es nicht.' });
    }

    // Gleicher Cevi-Name und gleiches Geburtsdatum in derselben Abteilung gibt es nur einmal.
    // Die Antwort verrät, ob Name und Geburtsdatum passen: gleiche Bremse wie beim Login.
    if (claimCeviNameAttempt(department.id, ceviName)) {
      return reply.status(429).send({ error: RATE_LIMIT_ERROR, code: 'RATE_LIMITED' });
    }
    const matches = await findCeviNameMatches(fastify.prisma, department.id, ceviName, birthDate);
    // Kein Treffer verrät nichts: kein Fehlversuch
    if (matches.length === 0) releaseCeviNameAttempt(department.id, ceviName);
    if (matches.length > 0) {
      const vocab = getVocabulary(request.organization);
      const result = pickCeviNameMatch(matches);
      return reply.status(409).send({
        code: result.kind === 'USE_CEVIDB' ? 'USE_CEVIDB' : result.kind === 'USE_PASSWORD' ? 'USE_PASSWORD' : 'EXISTS',
        error:
          result.kind === 'LOGIN'
            ? `Dieses Profil gibt es schon. Melde dich mit ${vocab.nickname} und Geburtsdatum an.`
            : `Zu diesem ${vocab.nickname} und Geburtsdatum gibt es schon ein Konto. Melde dich damit an.`,
      });
    }

    const stufeIds = [...new Set(stufen.map((s) => s.stufeId))];
    if (stufeIds.length) {
      const found = await fastify.prisma.departmentStufe.count({
        where: { id: { in: stufeIds }, departmentId: department.id },
      });
      if (found !== stufeIds.length) {
        return reply.status(400).send({ error: 'Eine Stufe gehört nicht zu dieser Abteilung' });
      }
    }

    const cleanCeviName = ceviName.trim();
    const user = await fastify.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          nickname: cleanCeviName,
          firstName: firstName?.trim() || cleanCeviName,
          lastName: lastName?.trim() || null,
          birthDate: new Date(`${birthDate}T00:00:00Z`),
          phone: phone?.trim() || null,
          homeDepartmentId: department.id,
          homeDepartmentSource: 'SELF',
          departmentSetupAt: new Date(),
        },
      });
      await tx.departmentMember.create({
        data: { departmentId: department.id, userId: created.id, role: 'HELPER' },
      });
      const unique = new Map(stufen.map((s) => [s.stufeId, s.role]));
      if (unique.size) {
        await tx.userStufe.createMany({
          data: [...unique].map(([stufeId, role]) => ({ userId: created.id, stufeId, role, source: 'SELF' })),
        });
      }
      return created;
    });

    fastify.log.info({ userId: user.id, departmentId: department.id }, 'Cevi-Name-Profil angelegt');
    trackUsage('REGISTER', { dim: 'ceviname', departmentId: department.id });
    trackUsage('LOGIN', { dim: 'ceviname', departmentId: department.id });
    return signInCeviNameProfile(reply, user, returnTo);
  });

  /** Cookie setzen und Profil zurückgeben (Login und Registrierung mit Cevi-Name) */
  async function signInCeviNameProfile(
    reply: FastifyReply,
    user: { id: string; email: string | null; nickname?: string | null; ceviName?: string | null; isGlobalAdmin: boolean },
    returnTo: string | undefined
  ) {
    const nick = user.nickname ?? user.ceviName ?? 'helfer';
    const orgDomain = getOrganizationByDbType(reply.request?.organization).domain;
    const token = fastify.signAuthToken({
      id: user.id,
      email:
        user.email ||
        `${nick.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.${orgDomain}`,
      isGlobalAdmin: user.isGlobalAdmin,
      amr: 'ceviname',
    });
    setAuthCookie(reply, token);
    return {
      redirectUrl: cleanReturnTo(returnTo),
      user: await loadUserDto(fastify.prisma, user.id, null),
    };
  }
};

export default ceviNameAuthRoutes;
