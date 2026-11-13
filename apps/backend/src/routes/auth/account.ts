import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import {
  SetHomeDepartmentSchema,
  SetProfilePasswordSchema,
  UpdateProfileSchema,
  isPlaceholderEmail,
} from '@schichtplan/shared';
import {
  autoCreateCeviDbDepartmentStufen,
  NO_HOME_CONFIRMATION,
  syncCeviDbStufen,
} from '../../services/homeDepartment.js';
import { applyProfileUpdate } from '../../services/profileUpdate.js';
import { trackUsage } from '../../services/usageStats.js';
import { createRateLimiter } from '../../services/rateLimit.js';

/** Bremse gegen das Durchprobieren des aktuellen Passworts bei der Passwort-Änderung (pro Konto) */
const passwordChangeFailures = createRateLimiter(15 * 60 * 1000, 10);

import {
  loadUserDto,
  ensureHelperMembership,
  clearAuthCookie,
  setAuthCookie,
} from '../../services/authSession.js';


/** Eigenes Konto: Profil lesen und ändern, Heimabteilung, Konto löschen, Abmelden */
const accountRoutes: FastifyPluginAsync = async (fastify) => {
  // 6. Profil des aktuellen Users abfragen
  fastify.get(
    '/api/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Eigenes Benutzerprofil abrufen',
        description: 'Gibt die Profil- und Sitzungsdaten der aktuell angemeldeten Person zurück.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const user = await loadUserDto(fastify.prisma, request.user.id, request.tenant?.id ?? null);
      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }
      return user;
    }
  );

  // 6a. Eigene Profilangaben ergänzen (Handynummer, Adresse, ...)
  fastify.patch(
    '/api/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Eigenes Benutzerprofil aktualisieren',
        description: 'Aktualisiert persönliche Kontaktdaten wie Telefonnummer, Adresse oder Cevi-Name.',
        security: [{ bearerAuth: [] }],
        body: UpdateProfileSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof UpdateProfileSchema>;
      const result = await applyProfileUpdate(fastify.prisma, request.user.id, input);
      if ('error' in result) return reply.status(result.status).send({ error: result.error });
      return loadUserDto(fastify.prisma, request.user.id, request.tenant?.id ?? null);
    }
  );

  // 6b. Eigenes Passwort im Profil festlegen oder ändern (Notfall-Passwort für Hitobito oder Änderung)
  fastify.post(
    '/api/auth/me/password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Eigenes Passwort im Profil setzen oder ändern',
        description: 'Setzt ein neues Passwort für das eigene Konto. Hat das Konto bereits ein Passwort, muss das bisherige Passwort angegeben werden.',
        security: [{ bearerAuth: [] }],
        body: SetProfilePasswordSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof SetProfilePasswordSchema>;
      const userId = request.user.id;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          isGlobalAdmin: true,
          emailVerifiedAt: true,
        },
      });

      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (!user.email || isPlaceholderEmail(user.email)) {
        return reply.status(400).send({
          error: 'Bitte trage zuerst eine gültige E-Mail-Adresse im Profil ein.',
        });
      }

      // Wenn bereits ein Passwort existiert, muss das bisherige Passwort angegeben und korrekt sein
      if (user.passwordHash) {
        if (!input.currentPassword) {
          return reply.status(400).send({
            error: 'Bitte gib dein aktuelles Passwort ein.',
            code: 'CURRENT_PASSWORD_REQUIRED',
          });
        }
        if (passwordChangeFailures.isBlocked(user.id)) {
          return reply.status(429).send({
            error: 'Zu viele Versuche. Bitte warte ein paar Minuten.',
            code: 'RATE_LIMITED',
          });
        }
        const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!matches) {
          passwordChangeFailures.hit(user.id);
          return reply.status(401).send({
            error: 'Das aktuelle Passwort ist nicht korrekt.',
            code: 'CURRENT_PASSWORD_WRONG',
          });
        }
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 10);
      const now = new Date();

      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
        },
      });

      // Frisches Token signieren und Cookie erneuern, damit die aktuelle Sitzung aktiv bleibt
      const token = fastify.signAuthToken({
        id: user.id,
        email: user.email,
        isGlobalAdmin: user.isGlobalAdmin,
        amr: 'password',
      });
      setAuthCookie(reply, token);

      trackUsage('PASSWORD_SET', { dim: user.passwordHash ? 'CHANGE' : 'CREATE' });
      request.log.info({ userId }, user.passwordHash ? 'Passwort geändert' : 'Fallback-Passwort festgelegt');

      return {
        success: true,
        message: user.passwordHash ? 'Passwort erfolgreich geändert.' : 'Fallback-Passwort erfolgreich festgelegt.',
        user: await loadUserDto(fastify.prisma, userId, request.tenant?.id ?? null),
      };
    }
  );

  // 6c. Eigenes Konto komplett löschen (nur für Accounts mit Cevi.DB oder Passwort)
  fastify.delete(
    '/api/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Eigenes Benutzerkonto löschen',
        description: 'Löscht das eigene Benutzerkonto und alle personenbezogenen Daten unwiderruflich.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          nickname: true,
          providerId: true,
          passwordHash: true,
          isGlobalAdmin: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      // Nur Accounts über Cevi.DB oder Passwort dürfen sich selbst löschen
      if (user.providerId === null && !user.passwordHash) {
        return reply.status(403).send({
          error: 'Nur Konten mit Cevi.DB oder Passwort können sich selbst löschen.',
        });
      }

      // Schutz: Der letzte globale Administrator kann sich nicht selbst löschen
      if (user.isGlobalAdmin) {
        const adminCount = await fastify.prisma.user.count({ where: { isGlobalAdmin: true } });
        if (adminCount <= 1) {
          return reply.status(400).send({
            error: 'Du bist die letzte Plattform-Administration und kannst dein Konto nicht löschen.',
          });
        }
      }

      // Schutz: Die letzte Leitung einer Abteilung kann sich nicht selbst löschen,
      // da die Abteilung sonst führungslos wird
      const ledDepartments = await fastify.prisma.departmentMember.findMany({
        where: { userId, role: 'ADMIN' },
        select: { departmentId: true, department: { select: { name: true } } },
      });
      for (const m of ledDepartments) {
        const otherLeaders = await fastify.prisma.departmentMember.count({
          where: { departmentId: m.departmentId, role: 'ADMIN', userId: { not: userId } },
        });
        if (otherLeaders === 0) {
          return reply.status(400).send({
            error: `Du bist die einzige Leitung der Abteilung «${m.department.name}». Bitte übertrage die Leitung zuerst an eine andere Person.`,
          });
        }
      }

      await fastify.prisma.$transaction(async (tx) => {
        // EventAccessLinks entkoppeln, falls dieser User gebunden war
        await tx.eventAccessLink.updateMany({
          where: { boundUserId: userId },
          data: { boundUserId: null },
        });

        // EventDeregistrations und EventAccessLinks createdById auf null setzen
        await tx.eventDeregistration.updateMany({
          where: { createdById: userId },
          data: { createdById: null },
        });

        await tx.eventAccessLink.updateMany({
          where: { createdById: userId },
          data: { createdById: null },
        });

        // Eingelöste Verpflegungs-Bons für Event-Abrechnung und Inventar erhalten
        await tx.cateringToken.updateMany({
          where: {
            status: 'REDEEMED',
            OR: [{ userId }, { signup: { userId } }],
          },
          data: { userId: null, shiftSignupId: null },
        });

        // Benutzer löschen (kaskadiert zu ShiftSignups, DepartmentMembers, UserStufen, UserHitobitoStufen, EventOrganizers, EventAnswers, EventAccessGrants, EventDeregistrations)
        await tx.user.delete({
          where: { id: userId },
        });
      });

      clearAuthCookie(reply);
      trackUsage('ACCOUNT_DELETE');

      const userDisplayName = user.nickname
        ? `${user.nickname} (${user.firstName} ${user.lastName})`
        : `${user.firstName} ${user.lastName}`;

      request.log.info(
        { userId, email: user.email, name: userDisplayName, providerId: user.providerId, hasPassword: Boolean(user.passwordHash) },
        'Person hat ihr Konto selbst gelöscht'
      );

      return { success: true, message: 'Dein Konto wurde erfolgreich gelöscht.' };
    }
  );

  // 6b. Heimabteilung und Stufen angeben (departmentId null = keine Abteilung).
  // Kommt die Abteilung aus Cevi.DB, bleibt sie fest; Stufen aus Cevi.DB ebenfalls.
  fastify.put(
    '/api/auth/me/department',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Heimabteilung und Stufen festlegen',
        description: 'Speichert die gewählte Heimabteilung und die zugehörigen Stufen im Profil.',
        security: [{ bearerAuth: [] }],
        body: SetHomeDepartmentSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof SetHomeDepartmentSchema>;
      const userId = request.user.id;
      const current = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { homeDepartmentId: true, homeDepartmentSource: true, providerId: true },
      });
      if (!current) return reply.status(404).send({ error: 'Person nicht gefunden' });

      const fromCeviDb = current.homeDepartmentSource === 'CEVIDB';
      const departmentId = fromCeviDb ? current.homeDepartmentId : input.departmentId;
      // Stufen ändern lässt eine Bestätigung bestehen, ein Abteilungswechsel beendet sie
      let staysConfirmed = current.homeDepartmentSource === 'CONFIRMED' && departmentId === current.homeDepartmentId;
      let confirmedByInvite = false;

      if (departmentId && !fromCeviDb) {
        const dept = await fastify.prisma.department.findUnique({
          where: { id: departmentId },
          select: { id: true, joinMode: true, inviteToken: true },
        });
        if (!dept) return reply.status(400).send({ error: 'Diese Abteilung gibt es nicht' });

        const alreadyMember =
          current.homeDepartmentId === departmentId ||
          (await fastify.prisma.departmentMember.count({
            where: {
              departmentId,
              userId,
              OR: [{ role: { not: 'HELPER' } }, { permissions: { isEmpty: false } }],
            },
          })) > 0 ||
          (await fastify.prisma.eventOrganizer.count({ where: { userId, event: { departmentId } } })) > 0;
        const validInvite = Boolean(input.inviteToken && dept.inviteToken && input.inviteToken === dept.inviteToken);

        if (validInvite) {
          confirmedByInvite = true;
          staysConfirmed = false;
        } else if (!alreadyMember) {
          if (dept.joinMode === 'INVITE_ONLY') {
            return reply.status(403).send({
              code: 'INVITE_REQUIRED',
              error: 'Beitritt nur per Einladung möglich. Bitte nutze einen gültigen Einladungs-Link.',
            });
          }
          if (dept.joinMode === 'LINK_ONLY' && !input.viaLink && request.tenant?.id !== departmentId) {
            return reply.status(403).send({
              code: 'LINK_REQUIRED',
              error: 'Beitritt nur über den Link der Abteilung/des Vereins oder per Einladung möglich.',
            });
          }
        }
      }

      const wanted = departmentId ? input.stufen : [];
      const stufen = wanted.length
        ? await fastify.prisma.departmentStufe.findMany({
            where: { id: { in: wanted.map((s) => s.stufeId) }, departmentId: departmentId ?? undefined },
            select: { id: true },
          })
        : [];
      if (stufen.length !== new Set(wanted.map((s) => s.stufeId)).size) {
        return reply.status(400).send({ error: 'Eine Stufe gehört nicht zu dieser Abteilung' });
      }

      await fastify.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            homeDepartmentId: departmentId,
            ...(staysConfirmed
              ? {}
              : confirmedByInvite
                ? {
                    homeDepartmentSource: 'CONFIRMED',
                    homeDepartmentConfirmedAt: new Date(),
                    homeDepartmentConfirmedById: null,
                  }
                : {
                    homeDepartmentSource: departmentId ? (fromCeviDb ? 'CEVIDB' : 'SELF') : null,
                    ...NO_HOME_CONFIRMATION,
                  }),
            departmentSetupAt: new Date(),
          },
        });
        // Selbst angegebene Stufen ersetzen; Stufen aus Cevi.DB bleiben
        const ceviDbStufen = await tx.userStufe.findMany({
          where: { userId, source: 'CEVIDB' },
          select: { stufeId: true },
        });
        const locked = new Set(ceviDbStufen.map((s) => s.stufeId));
        await tx.userStufe.deleteMany({ where: { userId, source: 'SELF' } });
        const selfStufen = wanted.filter((s) => !locked.has(s.stufeId));
        if (selfStufen.length) {
          await tx.userStufe.createMany({
            data: selfStufen.map((s) => ({ userId, stufeId: s.stufeId, role: s.role, source: 'SELF' })),
            skipDuplicates: true,
          });
        }
      });

      if (departmentId) {
        if (current.providerId !== null) {
          await autoCreateCeviDbDepartmentStufen(fastify.prisma, departmentId, userId);
          await syncCeviDbStufen(fastify.prisma, userId);
        }
        await ensureHelperMembership(fastify.prisma, departmentId, userId);
      }
      return loadUserDto(fastify.prisma, userId, request.tenant?.id ?? null);
    }
  );

  // 7. Logout
  fastify.post(
    '/api/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Abmelden',
        description: 'Entwertet das aktuelle Sitzungstoken und löscht die Authentifizierungs-Cookies.',
      },
    },
    async (request, reply) => {
    // Token serverseitig sperren: ein kopiertes Cookie hilft nach dem Abmelden nichts mehr
    await fastify.revokeAuthToken(request);
    clearAuthCookie(reply);
    return { ok: true };
  });
};

export default accountRoutes;
