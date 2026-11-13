import crypto from 'node:crypto';
import { FastifyPluginAsync } from 'fastify';
import { Prisma, type OrganizationType } from '../db.js';
import { z } from 'zod';
import type {
  AdminHitobitoRoleDto,
  AdminOverviewDto,
  AdminUserAccessDiagnosisDto,
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUserListItemDto,
  LoginMethod,
} from '@schichtplan/shared';
import { AdminBatchDeleteUsersSchema, isPlaceholderEmail, normalizePermissions } from '@schichtplan/shared';
import { hashResetToken } from './passwordReset.js';
import { getLoginPortalBaseUrl } from '../services/authSession.js';
import { toCeviDbStufeDto } from '../services/homeDepartment.js';
import { hitobitoRoleKind } from '../services/hitobito.js';
import { departmentCreationEligibility } from './departments/shared.js';
import { recordAdminAction } from '../services/adminAudit.js';
import { trackUsage } from '../services/usageStats.js';

const ListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  method: z.enum(['cevidb', 'password', 'ceviname', 'stale_ceviname', 'duplicate']).optional(),
  role: z.enum(['admin']).optional(),
  departmentId: z.union([z.string().uuid(), z.literal('none')]).optional(),
  /** Nur Personen dieses Verbands (Hitobito-Konto, Heim-Abteilung oder Rolle in einer Abteilung) */
  organization: z.enum(['CEVI', 'PFADI', 'JUBLA', 'OTHER']).optional(),
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
  nickname: true,
  phone: true,
  birthDate: true,
  isGlobalAdmin: true,
  provider: true,
  providerId: true,
  ortsgruppeId: true,
  ortsgruppeName: true,
  departmentLeader: true,
  leaderGroupName: true,
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
      department: { select: { id: true, name: true, slug: true, organization: true } },
    },
    orderBy: { department: { name: 'asc' } },
  },
  _count: { select: { signups: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function loginMethods(user: Pick<UserRow, 'providerId' | 'passwordHash'>): LoginMethod[] {
  const methods: LoginMethod[] = [];
  if (user.providerId !== null) methods.push('CEVIDB');
  if (user.passwordHash) methods.push('PASSWORD');
  if (methods.length === 0) methods.push('CEVINAME');
  return methods;
}

export function toListItem(
  user: UserRow,
  potentialDuplicateOf: { id: string; name: string; nickname?: string | null; ceviName: string | null; email: string | null } | null = null
): AdminUserListItemDto {
  const numericCeviDbId = user.providerId && /^\d+$/.test(user.providerId) ? Number(user.providerId) : null;
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    ceviName: user.nickname,
    phone: user.phone,
    birthDate: user.birthDate ? user.birthDate.toISOString().split('T')[0] : null,
    isGlobalAdmin: user.isGlobalAdmin,
    provider: user.provider,
    providerId: user.providerId,
    ceviDbId: numericCeviDbId,
    loginMethods: loginMethods(user),
    signupCount: user._count.signups,
    memberships: user.memberships.map((m) => ({
      departmentId: m.department.id,
      departmentName: m.department.name,
      departmentSlug: m.department.slug,
      departmentOrganization: m.department.organization,
      role: m.role,
      permissions: m.role === 'ADMIN' ? [] : normalizePermissions(m.permissions),
    })),
    homeDepartmentId: user.homeDepartmentId,
    homeDepartmentName: user.homeDepartment?.name ?? null,
    homeDepartmentSlug: user.homeDepartment?.slug ?? null,
    homeDepartmentSource: user.homeDepartmentSource,
    ortsgruppeId: user.ortsgruppeId,
    ceviDbOrtsgruppeId: user.ortsgruppeId,
    ortsgruppeName: user.ortsgruppeName,
    ceviDbOrtsgruppeName: user.ortsgruppeName,
    departmentLeader: user.departmentLeader,
    ceviDbDepartmentLeader: user.departmentLeader,
    leaderGroupName: user.leaderGroupName,
    ceviDbLeaderGroupName: user.leaderGroupName,
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
        u2."nickname" as "duplicateCeviName",
        u2."email" as "duplicateEmail"
      FROM "users" u1
      JOIN "users" u2 ON u1."id" != u2."id" AND (
        (u1."nickname" IS NOT NULL AND u1."nickname" != '' AND u1."birthDate" IS NOT NULL 
         AND LOWER(u1."nickname") = LOWER(u2."nickname") AND u1."birthDate" = u2."birthDate")
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
      { nickname: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
    ];
    // Hitobito/Provider ID
    if (/^\d{1,9}$/.test(term)) fields.push({ providerId: term });
    return { OR: fields };
  });
}

function methodFilter(method: 'cevidb' | 'password' | 'ceviname' | 'stale_ceviname' | undefined): Prisma.UserWhereInput[] {
  if (method === 'cevidb') return [{ providerId: { not: null } }];
  if (method === 'password') return [{ passwordHash: { not: null } }];
  if (method === 'ceviname') return [{ providerId: null, passwordHash: null }];
  if (method === 'stale_ceviname') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return [{ providerId: null, passwordHash: null, signups: { none: {} }, createdAt: { lt: thirtyDaysAgo } }];
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

function organizationFilter(organization: OrganizationType | undefined): Prisma.UserWhereInput[] {
  if (!organization) return [];
  return [
    {
      OR: [
        // Vereine haben kein Hitobito: dort zählt nur die Zugehörigkeit zu einem Verein
        ...(organization === 'OTHER' ? [] : [{ providerId: { not: null }, provider: organization }]),
        { homeDepartment: { organization } },
        { memberships: { some: { department: { organization } } } },
      ],
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
      fastify.prisma.user.count({ where: { providerId: { not: null } } }),
      fastify.prisma.user.count({ where: { passwordHash: { not: null } } }),
      fastify.prisma.user.count({ where: { providerId: null, passwordHash: null } }),
      fastify.prisma.user.count({
        where: { providerId: null, passwordHash: null, signups: { none: {} }, createdAt: { lt: thirtyDaysAgo } },
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
        querystring: ListQuerySchema,
      },
      preHandler: [fastify.requireGlobalAdmin],
    },
    async (request, _reply) => {
    const queryInput = request.query as z.output<typeof ListQuerySchema>;
    const { q, method, role, departmentId, organization, sort, page, pageSize } = queryInput;
    const duplicateMap = await findDuplicateUsers(fastify.prisma);
    const duplicateIds = Array.from(duplicateMap.keys());
    const dir = queryInput.dir ?? (sort === 'created' ? 'desc' : 'asc');

    const where: Prisma.UserWhereInput = {
      AND: [
        ...searchFilter(q),
...(method === 'duplicate' ? [{ id: { in: duplicateIds } }] : methodFilter(method as any)),
        ...departmentFilter(departmentId),
        ...organizationFilter(organization),
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
          totpEnabledAt: true,
          hitobitoStufen: true,
          organizedEvents: {
            select: {
              role: true,
              roleTitle: true,
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  department: { select: { name: true, slug: true, organization: true } },
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
                      department: { select: { name: true, slug: true, organization: true } },
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
        twoFactorEnabled: Boolean(user.totpEnabledAt),
        stufen: user.hitobitoStufen
          .map(toCeviDbStufeDto)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.groupName.localeCompare(b.groupName, 'de')),
        organizedEvents: user.organizedEvents.map((o) => ({
          eventId: o.event.id,
          eventTitle: o.event.title,
          eventSlug: o.event.slug,
          departmentName: o.event.department.name,
          departmentSlug: o.event.department.slug,
          departmentOrganization: o.event.department.organization,
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
          departmentOrganization: s.shift.event.department.organization,
          isConfirmed: s.isConfirmed,
          createdAt: s.createdAt.toISOString(),
        })),
      };
      return detail;
    }
  );

  // Berechtigungs-Diagnose: Rollen vom letzten Login und was der Schichtplan daraus macht.
  // Separat vom Detail, damit die Rollen nur geladen werden, wenn jemand sie wirklich braucht.
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/users/:id/access-diagnosis',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Berechtigungs-Diagnose einer Person (Admin)',
        description:
          'Rollen aus Hitobito (Cevi.DB, MiData, Jubla-DB) vom letzten Login, ihre Auswertung mit der aktuellen Konfiguration und ob die Person eine Abteilung anlegen darf.',
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
          id: true,
          provider: true,
          providerId: true,
          providerSyncedAt: true,
          hitobitoRoles: { orderBy: [{ groupName: 'asc' }, { roleClass: 'asc' }] },
          memberships: {
            select: { role: true, leaderSource: true, department: { select: { name: true, slug: true } } },
            orderBy: { department: { name: 'asc' } },
          },
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });

      const provider = user.provider;
      const hasProvider = user.providerId !== null;
      const groupIds = [...new Set(user.hitobitoRoles.flatMap((r) => (r.groupId !== null ? [r.groupId] : [])))];
      const groups = groupIds.length
        ? await fastify.prisma.hitobitoGroup.findMany({ where: { provider, id: { in: groupIds } } })
        : [];
      const groupById = new Map(groups.map((g) => [g.id, g]));
      // Gruppen-IDs, zu denen eine Abteilung gehören kann: die Gruppe selbst, ihre Jungschar, ihre Ortsgruppe
      const candidateIds = [
        ...new Set([...groupIds, ...groups.flatMap((g) => [g.jungscharId, g.ortsgruppeId])].filter((id): id is number => id !== null)),
      ];
      const departments = candidateIds.length
        ? await fastify.prisma.department.findMany({
            where: { organization: provider, hitobitoGroupId: { in: candidateIds } },
            select: { name: true, slug: true, hitobitoGroupId: true },
          })
        : [];
      const departmentsOf = (groupId: number | null) => {
        if (groupId === null) return [];
        const group = groupById.get(groupId);
        const ids = new Set([groupId, group?.jungscharId, group?.ortsgruppeId].filter((id) => id != null));
        return departments.filter((d) => d.hitobitoGroupId !== null && ids.has(d.hitobitoGroupId)).map(({ name, slug }) => ({ name, slug }));
      };

      // Ohne Verbands-Login gibt es keine Rollen. Konten mit Login, aber ohne gespeicherte Rollen,
      // haben sich seit Einführung der Diagnose noch nicht angemeldet.
      const roles: AdminHitobitoRoleDto[] | null =
        hasProvider && user.hitobitoRoles.length === 0
          ? null
          : user.hitobitoRoles.map((r) => {
              const group = r.groupId !== null ? groupById.get(r.groupId) : undefined;
              return {
                roleClass: r.roleClass,
                roleName: r.roleName,
                groupId: r.groupId,
                groupName: r.groupName,
                kind: hitobitoRoleKind(r.roleClass, provider),
                group: group
                  ? { groupType: group.groupType, jungscharId: group.jungscharId, ortsgruppeId: group.ortsgruppeId }
                  : null,
                departments: departmentsOf(r.groupId),
              };
            });

      request.log.info({ adminId: request.user.id, userId: user.id }, 'Admin: Berechtigungs-Diagnose abgerufen');

      const result: AdminUserAccessDiagnosisDto = {
        provider,
        hasProvider,
        syncedAt: user.providerSyncedAt?.toISOString() ?? null,
        roles,
        departmentCreation: await departmentCreationEligibility(fastify.prisma, user.id, provider),
        memberships: user.memberships.map((m) => ({
          departmentName: m.department.name,
          departmentSlug: m.department.slug,
          role: m.role,
          leaderSource: m.leaderSource,
        })),
      };
      return result;
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
          nickname: true,
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

        // Eingelöste Verpflegungs-Bons für Event-Abrechnung und Inventar erhalten
        await tx.cateringToken.updateMany({
          where: {
            status: 'REDEEMED',
            OR: [{ userId: targetUserId }, { signup: { userId: targetUserId } }],
          },
          data: { userId: null, shiftSignupId: null },
        });

        // Benutzer löschen (kaskadiert zu ShiftSignups, DepartmentMembers, UserStufen, UserHitobitoStufen, EventOrganizers, EventAnswers, EventAccessGrants, EventDeregistrations)
        await tx.user.delete({
          where: { id: targetUserId },
        });
      });

      const userDisplayName = user.nickname
        ? `${user.nickname} (${user.firstName} ${user.lastName})`
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
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          nickname: true,
          passwordHash: true,
          provider: true,
          homeDepartment: { select: { organization: true } },
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (!user.email || isPlaceholderEmail(user.email)) {
        return reply.status(400).send({ error: 'Person hat keine gültige E-Mail-Adresse hinterlegt.' });
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

      const org = user.homeDepartment?.organization ?? user.provider;
      const resetUrl = `${getLoginPortalBaseUrl(process.env, request.headers.host, org)}/passwort-zuruecksetzen?token=${token}`;
      const name = user.nickname ? `${user.nickname} (${user.firstName} ${user.lastName})` : `${user.firstName} ${user.lastName}`;

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

  // Zwei-Faktor zurücksetzen, wenn jemand Handy und Wiederherstellungscodes verloren hat
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/2fa/reset',
    {
      schema: {
        tags: ['Administration'],
        summary: 'Zwei-Faktor-Anmeldung zurücksetzen (Admin)',
        description:
          'Schaltet die Zwei-Faktor-Anmeldung einer Person aus (Secret und Wiederherstellungscodes werden gelöscht). Nur nach Prüfung der Identität verwenden.',
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
        select: { id: true, email: true, firstName: true, lastName: true, nickname: true, totpEnabledAt: true },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (!user.totpEnabledAt) return reply.status(400).send({ error: 'Die Person hat keine Zwei-Faktor-Anmeldung eingeschaltet.' });

      await fastify.prisma.$transaction([
        fastify.prisma.user.update({
          where: { id: user.id },
          data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, totpOnProviderLogin: false },
        }),
        fastify.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: user.id } }),
      ]);

      const name = user.nickname ? `${user.nickname} (${user.firstName} ${user.lastName})` : `${user.firstName} ${user.lastName}`;
      await recordAdminAction(fastify.prisma, request, {
        action: 'USER_TWO_FACTOR_RESET',
        targetType: 'USER',
        targetId: user.id,
        targetLabel: name,
        details: { email: user.email, enabledAt: user.totpEnabledAt.toISOString() },
      });
      trackUsage('TWO_FACTOR', { dim: 'ADMIN_RESET' });

      return { success: true };
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
      const input = request.body as z.output<typeof AdminBatchDeleteUsersSchema>;
      const rawIds = input.userIds;
      const filteredIds = rawIds.filter((id) => id !== request.user.id);
      if (filteredIds.length === 0) {
        return reply.status(400).send({ error: 'Das eigene Admin-Konto kann nicht gelöscht werden.' });
      }

      const users = await fastify.prisma.user.findMany({
        where: { id: { in: filteredIds } },
        select: { id: true, firstName: true, lastName: true, nickname: true, isGlobalAdmin: true },
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
        // Eingelöste Verpflegungs-Bons für Event-Abrechnung und Inventar erhalten
        await tx.cateringToken.updateMany({
          where: {
            status: 'REDEEMED',
            OR: [{ userId: { in: idsToDelete } }, { signup: { userId: { in: idsToDelete } } }],
          },
          data: { userId: null, shiftSignupId: null },
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
