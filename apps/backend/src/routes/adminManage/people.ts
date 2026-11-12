import { FastifyPluginAsync } from 'fastify';
import { Prisma, } from '../../db.js';
import { z } from 'zod';
import {
  AdminMergeUserSchema,
  AdminUpdateUserSchema,
  type AdminAuditListDto,
} from '@schichtplan/shared';
import { NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { isCeviNameProfile } from '../../services/nicknameLogin.js';
import { mergeUserInto } from '../../services/mergeProfiles.js';
import { personLabel } from '../../services/profile.js';
import { notifyAdminChange, recordAdminAction } from '../../services/adminAudit.js';
import { AuditQuerySchema, } from './shared.js';

/** Personen (Admin-Rolle, Heimabteilung, Zusammenführen) und Protokoll (nur globale Admins, siehe guard) */
const adminPeopleRoutes: FastifyPluginAsync = async (fastify) => {
  const guard = { preHandler: [fastify.requireGlobalAdmin] };

  // ---------------------------------------------------------------------------
  // Personen: globale Admin-Rolle, Heimabteilung & Konten zusammenführen
  // ---------------------------------------------------------------------------

  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerrolle oder Heimabteilung ändern (Admin)',
        description: 'Vergibt globale Admin-Rechte oder ändert die Heimabteilung einer Person.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Person'),
        }),
        body: AdminUpdateUserSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof AdminUpdateUserSchema>;
    const { isGlobalAdmin, homeDepartmentId } = input;

    const user = await fastify.prisma.user
      .findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          isGlobalAdmin: true,
          providerId: true,
          firstName: true,
          lastName: true,
          nickname: true,
          homeDepartmentId: true,
          homeDepartment: { select: { name: true } },
        },
      })
      .catch(() => null);
    if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });

    if (isGlobalAdmin !== undefined && isGlobalAdmin !== user.isGlobalAdmin) {
      // Admins melden sich mit Cevi.DB an (stärker als ein eigenes Passwort, siehe adminSecurity.ts)
      if (isGlobalAdmin && user.providerId === null) {
        return reply.status(400).send({
          error: 'Globale Admins brauchen ein Konto mit Cevi.DB. Die Person soll sich zuerst einmal mit Cevi.DB anmelden.',
        });
      }
      if (!isGlobalAdmin) {
        if (user.id === request.user.id) {
          return reply.status(400).send({ error: 'Du kannst dir die Admin-Rolle nicht selbst entziehen.' });
        }
        const adminCount = await fastify.prisma.user.count({ where: { isGlobalAdmin: true } });
        if (adminCount <= 1) {
          return reply.status(400).send({ error: 'Der letzte globale Admin kann nicht entfernt werden.' });
        }
      }
      await fastify.prisma.user.update({ where: { id: user.id }, data: { isGlobalAdmin } });
      await recordAdminAction(fastify.prisma, request, {
        action: isGlobalAdmin ? 'USER_ADMIN_GRANT' : 'USER_ADMIN_REVOKE',
        targetType: 'USER',
        targetId: user.id,
        targetLabel: personLabel(user),
      });
      const actor = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { firstName: true, lastName: true, nickname: true },
      });
      notifyAdminChange(fastify.prisma, request, {
        granted: isGlobalAdmin,
        targetUserId: user.id,
        targetLabel: personLabel(user),
        actorLabel: actor ? personLabel(actor) : request.user.email,
      });
    }

    if (homeDepartmentId !== undefined && homeDepartmentId !== user.homeDepartmentId) {
      let targetDept: { id: string; name: string } | null = null;
      if (homeDepartmentId !== null) {
        targetDept = await fastify.prisma.department
          .findUnique({ where: { id: homeDepartmentId }, select: { id: true, name: true } })
          .catch(() => null);
        if (!targetDept) {
          return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
        }
      }
      await fastify.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            homeDepartmentId,
            homeDepartmentSource: homeDepartmentId ? 'SELF' : null,
            ...NO_HOME_CONFIRMATION,
            departmentSetupAt: new Date(),
          },
        });
        if (homeDepartmentId) {
          await tx.departmentMember.upsert({
            where: { departmentId_userId: { departmentId: homeDepartmentId, userId: user.id } },
            update: {},
            create: { departmentId: homeDepartmentId, userId: user.id, role: 'HELPER' },
          });
        }
      });
      await recordAdminAction(fastify.prisma, request, {
        action: 'USER_HOME_DEPARTMENT_SET',
        targetType: 'USER',
        targetId: user.id,
        targetLabel: personLabel(user),
        details: {
          before: user.homeDepartment?.name ?? null,
          after: targetDept?.name ?? null,
        },
      });
    }

    return { success: true };
  });

  fastify.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/merge',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerkonten zusammenführen (Admin)',
        description: 'Überträgt alle Schichten, Anmeldungen und Rechte eines Quell-Kontos auf ein Ziel-Konto und löscht das Quell-Konto.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Quell-Person'),
        }),
        body: AdminMergeUserSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof AdminMergeUserSchema>;
    const sourceId = request.params.id;
    const { targetUserId } = input;

    if (sourceId === targetUserId) {
      return reply.status(400).send({ error: 'Quelle und Ziel dürfen nicht dasselbe Konto sein.' });
    }
    if (sourceId === request.user.id) {
      return reply.status(400).send({ error: 'Du kannst dein eigenes Admin-Konto nicht als Quelle zusammenführen.' });
    }

    const [source, target] = await Promise.all([
      fastify.prisma.user
        .findUnique({
          where: { id: sourceId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            nickname: true,
            isGlobalAdmin: true,
            providerId: true,
            passwordHash: true,
          },
        })
        .catch(() => null),
      fastify.prisma.user
        .findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            nickname: true,
            isGlobalAdmin: true,
            providerId: true,
            passwordHash: true,
          },
        })
        .catch(() => null),
    ]);

    if (!source) return reply.status(404).send({ error: 'Quell-Person nicht gefunden' });
    if (!target) return reply.status(404).send({ error: 'Ziel-Person nicht gefunden' });

    if (source.isGlobalAdmin) {
      return reply.status(400).send({
        error: 'Konten mit globalen Admin-Rechten können nicht als Quelle zusammengeführt werden.',
      });
    }

    if (isCeviNameProfile(target) && !isCeviNameProfile(source)) {
      return reply.status(400).send({
        error: 'Ein Konto mit Cevi.DB oder Passwort kann nicht in ein reines Cevi-Name-Profil überführt werden. Bitte umgekehrt zusammenführen.',
      });
    }

    await mergeUserInto(fastify.prisma, sourceId, targetUserId);

    const sourceLabel = personLabel(source);
    const targetLabel = personLabel(target);

    await recordAdminAction(fastify.prisma, request, {
      action: 'USER_MERGE',
      targetType: 'USER',
      targetId: targetUserId,
      targetLabel,
      details: {
        sourceId,
        sourceLabel,
        sourceEmail: source.email,
      },
    });

    return { success: true, targetUserId };
  });

  // ---------------------------------------------------------------------------
  // Protokoll
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/audit',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Plattform-Audit-Log abrufen (Admin)',
        description: 'Vollständiges Protokoll aller durchgeführten Administrator-Aktionen.',
        security: [{ bearerAuth: [] }],
        querystring: AuditQuerySchema,
      },
    },
    async (request, _reply) => {
    const queryInput = request.query as z.output<typeof AuditQuerySchema>;
    const { q, targetType, targetId, since, until, page, pageSize } = queryInput;
    const terms = (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    const where: Prisma.AdminAuditLogWhereInput = {
      AND: [
        ...(targetType ? [{ targetType }] : []),
        ...(targetId ? [{ targetId }] : []),
        ...(since ? [{ createdAt: { gte: new Date(since) } }] : []),
        ...(until ? [{ createdAt: { lte: new Date(until) } }] : []),
        ...terms.map((term) => ({
          OR: [
            { targetLabel: { contains: term, mode: 'insensitive' as const } },
            { adminName: { contains: term, mode: 'insensitive' as const } },
            { action: { contains: term, mode: 'insensitive' as const } },
          ],
        })),
      ],
    };
    const [total, rows] = await fastify.prisma.$transaction([
      fastify.prisma.adminAuditLog.count({ where }),
      fastify.prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const result: AdminAuditListDto = {
      items: rows.map((r) => ({
        id: r.id,
        adminId: r.adminId,
        adminName: r.adminName,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        details: (r.details as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });
};

export default adminPeopleRoutes;
