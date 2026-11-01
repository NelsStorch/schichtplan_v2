import crypto from 'node:crypto';
import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '../db.js';
import { z } from 'zod';
import type {
  AdminOverviewDto,
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUserListItemDto,
  LoginMethod,
} from '@schichtplan/shared';
import { AdminBatchDeleteUsersSchema, normalizePermissions } from '@schichtplan/shared';
import { hashResetToken } from './passwordReset.js';
import { getLoginPortalBaseUrl } from './auth.js';
import { toCeviDbStufeDto } from '../services/homeDepartment.js';
import { recordAdminAction } from '../services/adminAudit.js';

const ListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  method: z.enum(['cevidb', 'password', 'ceviname', 'stale_ceviname', 'duplicate']).optional(),
  role: z.enum(['admin']).optional(),
  departmentId: z.union([z.string().uuid(), z.literal('none')]).optional(),
  sort: z.enum(['created', 'name', 'email', 'seen']).default('created'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const userSelect = {
  id: true,
  email: true,
  emailVerified: true,
  firstName: true,
  lastName: true,
  ceviName: true,
  phone: true,
  birthDate: true,
  isGlobalAdmin: true,
  ceviDbId: true,
  ceviDbOrtsgruppeId: true,
  ceviDbOrtsgruppeName: true,
  ceviDbDepartmentLeader: true,
  ceviDbLeaderGroupName: true,
  homeDepartmentId: true,
  homeDepartmentSource: true,
  homeDepartment: { select: { id: true, name: true, slug: true } },
  // passwordHash wird nur gelesen, um "hat Passwort" abzuleiten, und nie ausgeliefert
  passwordHash: true,
  lastSeenOn: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    select: {
      role: true,
      permissions: true,
      department: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { department: { name: 'asc' } },
  },
  _count: { select: { signups: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function loginMethods(user: Pick<UserRow, 'ceviDbId' | 'passwordHash'>): LoginMethod[] {
  const methods: LoginMethod[] = [];
  if (user.ceviDbId !== null) methods.push('CEVIDB');
  if (user.passwordHash) methods.push('PASSWORD');
  if (methods.length === 0) methods.push('CEVINAME');
  return methods;
}

export function toListItem(
  user: UserRow,
  potentialDuplicateOf: { id: string; name: string; ceviName: string | null; email: string | null } | null = null
): AdminUserListItemDto {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    ceviName: user.ceviName,
    phone: user.phone,
    birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
    isGlobalAdmin: user.isGlobalAdmin,
    ceviDbId: user.ceviDbId,
    loginMethods: loginMethods(user),
    signupCount: user._count.signups,
    memberships: user.memberships.map((m) => ({
      departmentId: m.department.id,
      departmentName: m.department.name,
      departmentSlug: m.department.slug,
      role: m.role,
      permissions: m.role === 'ADMIN' ? [] : normalizePermissions(m.permissions),
    })),
    homeDepartmentId: user.homeDepartmentId,
    homeDepartmentName: user.homeDepartment?.name ?? null,
    homeDepartmentSlug: user.homeDepartment?.slug ?? null,
    homeDepartmentSource: user.homeDepartmentSource,
    ceviDbOrtsgruppeId: user.ceviDbOrtsgruppeId,
    ceviDbOrtsgruppeName: user.ceviDbOrtsgruppeName,
    ceviDbDepartmentLeader: user.ceviDbDepartmentLeader,
    ceviDbLeaderGroupName: user.ceviDbLeaderGroupName,
    lastSeenOn: user.lastSeenOn ? user.lastSeenOn.toISOString().slice(0, 10) : null,
    potentialDuplicateOf: potentialDuplicateOf ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}


export interface DuplicateUserRow {
  id: string;
  duplicateId: string;
  duplicateName: string;
  duplicateCeviName: string | null;
  duplicateEmail: string | null;
}

export async function findDuplicateUsers(prisma: any) {
  try {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT 
        u1."id", 
        u2."id" as "duplicateId", 
        TRIM(CONCAT(u2."firstName", ' ', COALESCE(NULLIF(u2."lastName", '(Helfer)'), ''))) as "duplicateName",
        u2."ceviName" as "duplicateCeviName",
        u2."email" as "duplicateEmail"
      FROM "users" u1
      JOIN "users" u2 ON u1."id" != u2."id" AND (
        (u1."ceviName" IS NOT NULL AND u1."ceviName" != '' AND u1."birthDate" IS NOT NULL 
         AND LOWER(u1."ceviName") = LOWER(u2."ceviName") AND u1."birthDate" = u2."birthDate")
        OR
        (u1."email" IS NOT NULL AND u1."email" != '' AND LOWER(u1."email") = LOWER(u2."email"))
      )
    `;
    const map = new Map<string, { id: string; name: string; ceviName: string | null; email: string | null }>();
    for (const r of rows) {
      if (!map.has(r.id)) {
        map.set(r.id, {
          id: r.duplicateId,
          name: r.duplicateName,
          ceviName: r.duplicateCeviName,
          email: r.duplicateEmail,
        });
      }
    }
    return map;
  } catch {
    return new Map<string, { id: string; name: string; ceviName: string | null; email: string | null }>();
  }
}

/** Jeder Suchbegriff muss in mindestens einem Feld vorkommen ("nels storch" findet Vor- und Nachname). */
function searchFilter(q: string | undefined): Prisma.UserWhereInput[] {
  const terms = (q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
  return terms.map((term) => {
    const fields: Prisma.UserWhereInput[] = [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { ceviName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
    ];
    // Cevi.DB-ID ist ein Int4: längere Zahlen würden die Abfrage sprengen
    if (/^\d{1,9}$/.test(term)) fields.push({ ceviDbId: Number(term) });
    return { OR: fields };
  });
}

function methodFilter(method: 'cevidb' | 'password' | 'ceviname' | 'stale_ceviname' | undefined): Prisma.UserWhereInput[] {
  if (method === 'cevidb') return [{ ceviDbId: { not: null } }];
  if (method === 'password') return [{ passwordHash: { not: null } }];
  if (method === 'ceviname') return [{ ceviDbId: null, passwordHash: null }];
  if (method === 'stale_ceviname') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return [{ ceviDbId: null, passwordHash: null, signups: { none: {} }, createdAt: { lt: thirtyDaysAgo } }];
  }
  return [];
}

function departmentFilter(departmentId: string | undefined): Prisma.UserWhereInput[] {
  if (!departmentId) return [];
  if (departmentId === 'none') {
    return [{ homeDepartmentId: null, memberships: { none: {} } }];
  }
  return [
    {
      OR: [{ homeDepartmentId: departmentId }, { memberships: { some: { departmentId } } }],
    },
  ];
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Personendaten: nie zwischenspeichern, weder im Browser noch in Proxys
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  fastify.get(
    '/api/admin/overview',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Globale System- und Benutzerübersicht',
        description: 'Liefert aggregierte Plattform-Statistiken über Benutzer, Abteilungen, Anlässe und Eintragungen.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      users,
      cevidbUsers,
      passwordUsers,
      guestUsers,
      staleGuestUsers,
      globalAdmins,
      newUsers7d,
      departments,
      events,
      signups,
    ] = await fastify.prisma.$transaction([
      fastify.prisma.user.count(),
      fastify.prisma.user.count({ where: { ceviDbId: { not: null } } }),
      fastify.prisma.user.count({ where: { passwordHash: { not: null } } }),
      fastify.prisma.user.count({ where: { ceviDbId: null, passwordHash: null } }),
      fastify.prisma.user.count({
        where: { ceviDbId: null, passwordHash: null, signups: { none: {} }, createdAt: { lt: thirtyDaysAgo } },
      }),
      fastify.prisma.user.count({ where: { isGlobalAdmin: true } }),
      fastify.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      fastify.prisma.department.count(),
      fastify.prisma.event.count(),
      fastify.prisma.shiftSignup.count(),
    ]);

    const duplicateMap = await findDuplicateUsers(fastify.prisma);
    const overview: AdminOverviewDto = {
      users,
      cevidbUsers,
      passwordUsers,
      guestUsers,
      staleGuestUsers,
      duplicateUsers: duplicateMap.size,
      globalAdmins,
      newUsers7d,
      departments,
      events,
      signups,
    };
    return overview;
  });

  fastify.get(
    '/api/admin/users',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerliste abrufen (Admin)',
        description: 'Filterbare, sortierbare und paginierte Übersicht aller Benutzerkonten auf der Plattform.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async (request, reply) => {
    const parse = ListQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }
    const { q, method, role, departmentId, sort, page, pageSize } = parse.data;
    const duplicateMap = await findDuplicateUsers(fastify.prisma);
    const duplicateIds = Array.from(duplicateMap.keys());
    const dir = parse.data.dir ?? (sort === 'created' ? 'desc' : 'asc');

    const where: Prisma.UserWhereInput = {
      AND: [
        ...searchFilter(q),
...(method === 'duplicate' ? [{ id: { in: duplicateIds } }] : methodFilter(method as any)),
        ...departmentFilter(departmentId),
        ...(role === 'admin' ? [{ isGlobalAdmin: true }] : []),
      ],
    };

    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      sort === 'name'
        ? [{ lastName: dir }, { firstName: dir }, { id: 'asc' }]
        : sort === 'email'
          ? [{ email: { sort: dir, nulls: 'last' } }, { id: 'asc' }]
          : sort === 'seen'
            ? [{ lastSeenOn: { sort: dir, nulls: 'last' } }, { id: 'asc' }]
            : [{ createdAt: dir }, { id: 'asc' }];

    const [total, rows] = await fastify.prisma.$transaction([
      fastify.prisma.user.count({ where }),
      fastify.prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: userSelect,
      }),
    ]);

    request.log.info({ adminId: request.user.id, q: q || undefined, total }, 'Admin: Userliste abgerufen');

    const result: AdminUserListDto = {
      items: rows.map((r) => toListItem(r, duplicateMap.get(r.id))),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerdetails abrufen (Admin)',
        description: 'Detaillierte Übersicht über Rollen, Mitgliedschaften, Schichten und Cevi.DB-Verknüpfung einer Person.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Benutzers'),
        }),
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.params.id },
        select: {
          ...userSelect,
          ceviDbStufen: true,
          organizedEvents: {
            select: {
              role: true,
              roleTitle: true,
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  department: { select: { name: true, slug: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          signups: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              isConfirmed: true,
              createdAt: true,
              shift: {
                select: {
                  title: true,
                  category: true,
                  startTime: true,
                  endTime: true,
                  event: {
                    select: {
                      title: true,
                      slug: true,
                      department: { select: { name: true, slug: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      request.log.info({ adminId: request.user.id, userId: user.id }, 'Admin: Userdetail abgerufen');

      const detail: AdminUserDetailDto = {
        ...toListItem(user),
        stufen: user.ceviDbStufen
          .map(toCeviDbStufeDto)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.groupName.localeCompare(b.groupName, 'de')),
        organizedEvents: user.organizedEvents.map((o) => ({
          eventId: o.event.id,
          eventTitle: o.event.title,
          eventSlug: o.event.slug,
          departmentName: o.event.department.name,
          departmentSlug: o.event.department.slug,
          role: o.role,
          roleTitle: o.roleTitle,
        })),
        signups: user.signups.map((s) => ({
          id: s.id,
          shiftTitle: s.shift.title,
          shiftCategory: s.shift.category,
          startTime: s.shift.startTime.toISOString(),
          endTime: s.shift.endTime.toISOString(),
          eventTitle: s.shift.event.title,
          eventSlug: s.shift.event.slug,
          departmentName: s.shift.event.department.name,
          departmentSlug: s.shift.event.department.slug,
          isConfirmed: s.isConfirmed,
          createdAt: s.createdAt.toISOString(),
        })),
      };
      return detail;
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Benutzerkonto löschen (Admin)',
        description: 'Löscht ein Benutzerkonto und alle personenbezogenen Daten unwiderruflich.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Benutzers'),
        }),
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async (request, reply) => {
      const targetUserId = request.params.id;

      if (targetUserId === request.user.id) {
        return reply.status(400).send({ error: 'Du kannst dein eigenes Admin-Konto nicht löschen.' });
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          ceviName: true,
          isGlobalAdmin: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Person nicht gefunden' });
      }

      if (user.isGlobalAdmin) {
        const adminCount = await fastify.prisma.user.count({ where: { isGlobalAdmin: true } });
        if (adminCount <= 1) {
          return reply.status(400).send({ error: 'Das letzte Konto mit globalen Admin-Rechten kann nicht gelöscht werden.' });
        }
      }

      await fastify.prisma.$transaction(async (tx) => {
        // EventAccessLinks entkoppeln, falls dieser User gebunden war
        await tx.eventAccessLink.updateMany({
          where: { boundUserId: targetUserId },
          data: { boundUserId: null },
        });

        // EventDeregistrations und EventAccessLinks createdById auf null setzen
        await tx.eventDeregistration.updateMany({
          where: { createdById: targetUserId },
          data: { createdById: null },
        });

        await tx.eventAccessLink.updateMany({
          where: { createdById: targetUserId },
          data: { createdById: null },
        });

        // Benutzer löschen (kaskadiert zu ShiftSignups, DepartmentMembers, UserStufen, UserCeviDbStufen, EventOrganizers, EventAnswers, EventAccessGrants, EventDeregistrations)
        await tx.user.delete({
          where: { id: targetUserId },
        });
      });

      const userDisplayName = user.ceviName
        ? `${user.ceviName} (${user.firstName} ${user.lastName})`
        : `${user.firstName} ${user.lastName}`;

      await recordAdminAction(fastify.prisma, request, {
        action: 'USER_DELETE',
        targetType: 'USER',
        targetId: targetUserId,
        targetLabel: userDisplayName,
        details: { email: user.email, wasGlobalAdmin: user.isGlobalAdmin },
      });

      return { success: true };
    }
  );
  // Passwort-Reset-Link als Notfall-Hilfe durch globale Admins generieren
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/reset-token',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Passwort-Reset-Link generieren (Admin)',
        description: 'Erzeugt einen 24 Stunden gültigen Passwort-Reset-Link für Supportfälle.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID des Benutzers'),
        }),
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, email: true, firstName: true, lastName: true, ceviName: true, passwordHash: true },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (!user.email && !user.passwordHash) {
        return reply.status(400).send({ error: 'Person hat weder E-Mail noch Passwort hinterlegt.' });
      }

      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h gültig bei manueller Generierung
      await fastify.prisma.$transaction([
        fastify.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        fastify.prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashResetToken(token),
            expiresAt,
          },
        }),
      ]);

      const resetUrl = `${getLoginPortalBaseUrl(request.headers.host)}/passwort-zuruecksetzen?token=${token}`;
      const name = user.ceviName ? `${user.ceviName} (${user.firstName} ${user.lastName})` : `${user.firstName} ${user.lastName}`;

      await recordAdminAction(fastify.prisma, request, {
        action: 'USER_PASSWORD_RESET_LINK_GENERATE',
        targetType: 'USER',
        targetId: user.id,
        targetLabel: name,
        details: { email: user.email },
      });

      return { resetUrl, expiresAt: expiresAt.toISOString() };
    }
  );

  // Mehrere verwaiste oder gewählte Personen im Stapel löschen
  fastify.post(
    '/api/admin/users/batch-delete',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Mehrere Benutzer löschen (Admin)',
        description: 'Löscht mehrere Benutzerkonten (z. B. verwaiste Gastkonten) in einem Vorgang.',
        security: [{ bearerAuth: [] }],
        body: AdminBatchDeleteUsersSchema,
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async (request, reply) => {
      const parse = AdminBatchDeleteUsersSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
      const rawIds = parse.data.userIds;
      const filteredIds = rawIds.filter((id) => id !== request.user.id);
      if (filteredIds.length === 0) {
        return reply.status(400).send({ error: 'Das eigene Admin-Konto kann nicht gelöscht werden.' });
      }

      const users = await fastify.prisma.user.findMany({
        where: { id: { in: filteredIds } },
        select: { id: true, firstName: true, lastName: true, ceviName: true, isGlobalAdmin: true },
      });

      if (users.some((u) => u.isGlobalAdmin)) {
        return reply.status(400).send({ error: 'Konten mit globalen Admin-Rechten können nicht im Stapel gelöscht werden.' });
      }

      const idsToDelete = users.map((u) => u.id);

      await fastify.prisma.$transaction(async (tx) => {
        await tx.eventAccessLink.updateMany({
          where: { boundUserId: { in: idsToDelete } },
          data: { boundUserId: null },
        });
        await tx.eventDeregistration.updateMany({
          where: { createdById: { in: idsToDelete } },
          data: { createdById: null },
        });
        await tx.eventAccessLink.updateMany({
          where: { createdById: { in: idsToDelete } },
          data: { createdById: null },
        });
        await tx.user.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      });

      await recordAdminAction(fastify.prisma, request, {
        action: 'USER_BATCH_DELETE',
        targetType: 'USER',
        targetId: null,
        targetLabel: `${idsToDelete.length} Personen gelöscht`,
        details: { count: idsToDelete.length, userIds: idsToDelete },
      });

      return { success: true, count: idsToDelete.length };
    }
  );

};

export default adminRoutes;
