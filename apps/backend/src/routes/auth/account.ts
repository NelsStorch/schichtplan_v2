import { FastifyPluginAsync, } from 'fastify';
import {
  SetHomeDepartmentSchema,
  UpdateProfileSchema,
} from '@schichtplan/shared';
import {
  autoCreateCeviDbDepartmentStufen,
  NO_HOME_CONFIRMATION,
  syncCeviDbStufen,
} from '../../services/homeDepartment.js';
import { applyProfileUpdate } from '../../services/profileUpdate.js';
import { trackUsage } from '../../services/usageStats.js';

import {
  loadUserDto,
  ensureHelperMembership,
  clearAuthCookie,
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
      const parse = UpdateProfileSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const result = await applyProfileUpdate(fastify.prisma, request.user.id, parse.data);
      if ('error' in result) return reply.status(result.status).send({ error: result.error });
      return loadUserDto(fastify.prisma, request.user.id, request.tenant?.id ?? null);
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
          ceviName: true,
          ceviDbId: true,
          passwordHash: true,
          isGlobalAdmin: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      // Nur Accounts über Cevi.DB oder Passwort dürfen sich selbst löschen
      if (user.ceviDbId === null && !user.passwordHash) {
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

        // Benutzer löschen (kaskadiert zu ShiftSignups, DepartmentMembers, UserStufen, UserCeviDbStufen, EventOrganizers, EventAnswers, EventAccessGrants, EventDeregistrations)
        await tx.user.delete({
          where: { id: userId },
        });
      });

      clearAuthCookie(reply);
      trackUsage('ACCOUNT_DELETE');

      const userDisplayName = user.ceviName
        ? `${user.ceviName} (${user.firstName} ${user.lastName})`
        : `${user.firstName} ${user.lastName}`;

      request.log.info(
        { userId, email: user.email, name: userDisplayName, ceviDbId: user.ceviDbId, hasPassword: Boolean(user.passwordHash) },
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
      const parse = SetHomeDepartmentSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const userId = request.user.id;
      const current = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { homeDepartmentId: true, homeDepartmentSource: true, ceviDbId: true },
      });
      if (!current) return reply.status(404).send({ error: 'Person nicht gefunden' });

      const fromCeviDb = current.homeDepartmentSource === 'CEVIDB';
      const departmentId = fromCeviDb ? current.homeDepartmentId : parse.data.departmentId;
      // Stufen ändern lässt eine Bestätigung bestehen, ein Abteilungswechsel beendet sie
      const staysConfirmed = current.homeDepartmentSource === 'CONFIRMED' && departmentId === current.homeDepartmentId;

      if (departmentId && !fromCeviDb) {
        const exists = await fastify.prisma.department.count({ where: { id: departmentId } });
        if (!exists) return reply.status(400).send({ error: 'Diese Abteilung gibt es nicht' });
      }

      const wanted = departmentId ? parse.data.stufen : [];
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
              : { homeDepartmentSource: departmentId ? (fromCeviDb ? 'CEVIDB' : 'SELF') : null, ...NO_HOME_CONFIRMATION }),
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
        if (current.ceviDbId !== null) {
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
