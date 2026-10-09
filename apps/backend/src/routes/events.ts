import { FastifyPluginAsync } from 'fastify';
import { CreateEventSchema, SignupMode } from '@schichtplan/shared';

const eventRoutes: FastifyPluginAsync = async (fastify) => {
  // Liste aller Events der aktuellen Abteilung
  fastify.get('/api/events', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
    }

    const events = await fastify.prisma.event.findMany({
      where: {
        departmentId: request.tenant.id,
        isPublished: true,
      },
      include: {
        _count: {
          select: { shifts: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      departmentId: e.departmentId,
      title: e.title,
      slug: e.slug,
      description: e.description,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate.toISOString(),
      isPublished: e.isPublished,
      allowPublicSignup: e.allowPublicSignup,
      signupMode: e.signupMode as SignupMode,
      requireEmailForGuests: e.requireEmailForGuests,
      requirePhoneForGuests: e.requirePhoneForGuests,
      shiftCount: e._count.shifts,
    }));
  });

  // Event Details anhand von Slug
  fastify.get<{ Params: { slug: string } }>('/api/events/:slug', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
    }

    const event = await fastify.prisma.event.findUnique({
      where: {
        departmentId_slug: {
          departmentId: request.tenant.id,
          slug: request.params.slug,
        },
      },
      include: {
        shifts: {
          include: {
            signups: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    ceviName: true,
                    birthDate: true,
                  },
                },
              },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event nicht gefunden' });
    }

    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      description: event.description,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      isPublished: event.isPublished,
      allowPublicSignup: event.allowPublicSignup,
      signupMode: event.signupMode as SignupMode,
      requireEmailForGuests: event.requireEmailForGuests,
      requirePhoneForGuests: event.requirePhoneForGuests,
      shifts: event.shifts.map((s) => {
        const signups = s.signups.map((su) => {
          const displayName =
            su.user?.ceviName ||
            (su.user ? `${su.user.firstName} ${su.user.lastName}`.trim() : null) ||
            su.guestName ||
            'Helfer*in';

          return {
            id: su.id,
            shiftId: su.shiftId,
            userId: su.user?.id || null,
            guestName: su.guestName,
            guestEmail: su.guestEmail,
            guestPhone: su.guestPhone,
            displayName,
            userFirstName: su.user?.firstName || null,
            userLastName: su.user?.lastName || null,
            userCeviName: su.user?.ceviName || null,
            createdAt: su.createdAt.toISOString(),
            isConfirmed: su.isConfirmed,
          };
        });

        return {
          id: s.id,
          eventId: s.eventId,
          title: s.title,
          category: s.category,
          description: s.description,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          requiredSlots: s.requiredSlots,
          freeSlots: Math.max(0, s.requiredSlots - signups.length),
          minAge: s.minAge,
          signups,
        };
      }),
    };
  });

  // Neues Event erstellen (Erfordert Authentifizierung & Admin/Planner Rolle)
  fastify.post(
    '/api/events',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      // Prüfe Rolle des Users in dieser Abteilung
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      if (!member || (member.role !== 'ADMIN' && member.role !== 'PLANNER')) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Erstellen von Events' });
      }

      const parse = CreateEventSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const {
        title,
        slug,
        description,
        startDate,
        endDate,
        allowPublicSignup,
        signupMode,
        requireEmailForGuests,
        requirePhoneForGuests,
      } = parse.data;

      const existing = await fastify.prisma.event.findUnique({
        where: {
          departmentId_slug: {
            departmentId: request.tenant.id,
            slug,
          },
        },
      });

      if (existing) {
        return reply
          .status(409)
          .send({ error: 'Ein Event mit diesem Slug existiert bereits in dieser Abteilung' });
      }

      const event = await fastify.prisma.event.create({
        data: {
          departmentId: request.tenant.id,
          title,
          slug,
          description: description || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          allowPublicSignup,
          signupMode,
          requireEmailForGuests,
          requirePhoneForGuests,
        },
      });

      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        signupMode: event.signupMode,
      };
    }
  );
};

export default eventRoutes;
