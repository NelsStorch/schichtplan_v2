import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type {
  AdminOverviewDto,
  AdminUserDetailDto,
  AdminUserListDto,
  AdminUserListItemDto,
  LoginMethod,
} from '@schichtplan/shared';
import { toCeviDbStufeDto } from '../services/homeDepartment.js';

const ListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  method: z.enum(['cevidb', 'password', 'ceviname']).optional(),
  role: z.enum(['admin']).optional(),
  sort: z.enum(['created', 'name', 'email']).default('created'),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  ceviName: true,
  phone: true,
  birthDate: true,
  isGlobalAdmin: true,
  ceviDbId: true,
  // passwordHash wird nur gelesen, um "hat Passwort" abzuleiten, und nie ausgeliefert
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    select: {
      role: true,
      department: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { department: { name: 'asc' } },
  },
  _count: { select: { signups: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function loginMethods(user: Pick<UserRow, 'ceviDbId' | 'passwordHash'>): LoginMethod[] {
  const methods: LoginMethod[] = [];
  if (user.ceviDbId !== null) methods.push('CEVIDB');
  if (user.passwordHash) methods.push('PASSWORD');
  if (methods.length === 0) methods.push('CEVINAME');
  return methods;
}

function toListItem(user: UserRow): AdminUserListItemDto {
  return {
    id: user.id,
    email: user.email,
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
    })),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
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

function methodFilter(method: 'cevidb' | 'password' | 'ceviname' | undefined): Prisma.UserWhereInput[] {
  if (method === 'cevidb') return [{ ceviDbId: { not: null } }];
  if (method === 'password') return [{ passwordHash: { not: null } }];
  if (method === 'ceviname') return [{ ceviDbId: null, passwordHash: null }];
  return [];
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Personendaten: nie zwischenspeichern, weder im Browser noch in Proxys
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  fastify.get('/api/admin/overview', { preHandler: [fastify.requireGlobalAdmin] }, async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, cevidbUsers, passwordUsers, guestUsers, globalAdmins, newUsers7d, departments, events, signups] =
      await fastify.prisma.$transaction([
        fastify.prisma.user.count(),
        fastify.prisma.user.count({ where: { ceviDbId: { not: null } } }),
        fastify.prisma.user.count({ where: { passwordHash: { not: null } } }),
        fastify.prisma.user.count({ where: { ceviDbId: null, passwordHash: null } }),
        fastify.prisma.user.count({ where: { isGlobalAdmin: true } }),
        fastify.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        fastify.prisma.department.count(),
        fastify.prisma.event.count(),
        fastify.prisma.shiftSignup.count(),
      ]);

    const overview: AdminOverviewDto = {
      users,
      cevidbUsers,
      passwordUsers,
      guestUsers,
      globalAdmins,
      newUsers7d,
      departments,
      events,
      signups,
    };
    return overview;
  });

  fastify.get('/api/admin/users', { preHandler: [fastify.requireGlobalAdmin] }, async (request, reply) => {
    const parse = ListQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }
    const { q, method, role, sort, page, pageSize } = parse.data;
    const dir = parse.data.dir ?? (sort === 'created' ? 'desc' : 'asc');

    const where: Prisma.UserWhereInput = {
      AND: [
        ...searchFilter(q),
        ...methodFilter(method),
        ...(role === 'admin' ? [{ isGlobalAdmin: true }] : []),
      ],
    };

    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      sort === 'name'
        ? [{ lastName: dir }, { firstName: dir }, { id: 'asc' }]
        : sort === 'email'
          ? [{ email: { sort: dir, nulls: 'last' } }, { id: 'asc' }]
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
      items: rows.map(toListItem),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    return result;
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: [fastify.requireGlobalAdmin] },
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
        return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
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
};

export default adminRoutes;
