import { FastifyPluginAsync } from 'fastify';
import { CreateEventSchema, AddEventOrganizerSchema, SignupMode } from '@schichtplan/shared';

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
      logoUrl: e.logoUrl,
      bannerUrl: e.bannerUrl,
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
        organizers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                ceviName: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
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
      logoUrl: event.logoUrl,
      bannerUrl: event.bannerUrl,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      isPublished: event.isPublished,
      allowPublicSignup: event.allowPublicSignup,
      signupMode: event.signupMode as SignupMode,
      requireEmailForGuests: event.requireEmailForGuests,
      requirePhoneForGuests: event.requirePhoneForGuests,
      organizers: event.organizers.map((o) => ({
        id: o.id,
        eventId: o.eventId,
        userId: o.userId,
        userFirstName: o.user.firstName,
        userLastName: o.user.lastName,
        userCeviName: o.user.ceviName,
        displayName: o.user.ceviName
          ? `${o.user.firstName} / ${o.user.ceviName}`
          : `${o.user.firstName} ${o.user.lastName}`,
        role: o.role,
        roleTitle: o.roleTitle,
        createdAt: o.createdAt.toISOString(),
      })),
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

  // Neues Event erstellen (Erfordert Authentifizierung & Abteilungsleitung / Planner Rolle)
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

      if (!member || (member.role !== 'ADMIN' && member.role !== 'PLANNER' && !request.user.isGlobalAdmin)) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung darf Events erstellen' });
      }

      const parse = CreateEventSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const {
        title,
        slug,
        description,
        logoUrl,
        bannerUrl,
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
          logoUrl: logoUrl || null,
          bannerUrl: bannerUrl || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          allowPublicSignup,
          signupMode,
          requireEmailForGuests,
          requirePhoneForGuests,
          // Ersteller automatisch als OK-Leitung eintragen
          organizers: {
            create: {
              userId: request.user.id,
              role: 'OK_LEAD',
              roleTitle: 'Event-Leitung',
            },
          },
        },
      });

      return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        logoUrl: event.logoUrl,
        bannerUrl: event.bannerUrl,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        signupMode: event.signupMode,
      };
    }
  );

  // Event bearbeiten (Abteilungsleitung ODER Event-OK)
  fastify.patch<{ Params: { slug: string } }>(
    '/api/events/:slug',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
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
          organizers: true,
        },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Prüfe Berechtigung: Abteilungsleitung (ADMIN) ODER Mitglied des Event-OKs
      const deptMember = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = deptMember && deptMember.role === 'ADMIN';
      const isEventOk = event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
        return reply
          .status(403)
          .send({ error: 'Nur die Abteilungsleitung oder das Event-OK dürfen dieses Event bearbeiten' });
      }

      const body = request.body as any;
      const updated = await fastify.prisma.event.update({
        where: { id: event.id },
        data: {
          title: body.title !== undefined ? body.title : undefined,
          description: body.description !== undefined ? body.description : undefined,
          logoUrl: body.logoUrl !== undefined ? body.logoUrl : undefined,
          bannerUrl: body.bannerUrl !== undefined ? body.bannerUrl : undefined,
          signupMode: body.signupMode !== undefined ? body.signupMode : undefined,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          allowPublicSignup:
            body.allowPublicSignup !== undefined ? body.allowPublicSignup : undefined,
          requireEmailForGuests:
            body.requireEmailForGuests !== undefined ? body.requireEmailForGuests : undefined,
          requirePhoneForGuests:
            body.requirePhoneForGuests !== undefined ? body.requirePhoneForGuests : undefined,
        },
      });

      return {
        id: updated.id,
        title: updated.title,
        slug: updated.slug,
        logoUrl: updated.logoUrl,
        bannerUrl: updated.bannerUrl,
        signupMode: updated.signupMode,
      };
    }
  );

  // Mitglied zum Event-OK hinzufügen
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/organizers',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
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
        include: { organizers: true },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Nur Abteilungsleitung oder OK_LEAD darf OK-Mitglieder verwalten
      const deptMember = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = deptMember && deptMember.role === 'ADMIN';
      const isOkLead = event.organizers.some(
        (o) => o.userId === request.user.id && o.role === 'OK_LEAD'
      );

      if (!isDeptAdmin && !isOkLead && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung zur OK-Verwaltung' });
      }

      const parse = AddEventOrganizerSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { userId, ceviName, email, role, roleTitle } = parse.data;

      // Benutzer finden anhand ID, Cevi-Name oder E-Mail
      let targetUser = null;
      if (userId) {
        targetUser = await fastify.prisma.user.findUnique({ where: { id: userId } });
      } else if (ceviName) {
        targetUser = await fastify.prisma.user.findFirst({
          where: { ceviName: { equals: ceviName.trim(), mode: 'insensitive' } },
        });
      } else if (email) {
        targetUser = await fastify.prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
      }

      if (!targetUser) {
        return reply.status(404).send({ error: 'Benutzer für das OK nicht gefunden' });
      }

      const organizer = await fastify.prisma.eventOrganizer.upsert({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: targetUser.id,
          },
        },
        update: {
          role,
          roleTitle: roleTitle || undefined,
        },
        create: {
          eventId: event.id,
          userId: targetUser.id,
          role,
          roleTitle: roleTitle || 'OK-Mitglied',
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, ceviName: true },
          },
        },
      });

      return {
        id: organizer.id,
        displayName: organizer.user.ceviName
          ? `${organizer.user.firstName} / ${organizer.user.ceviName}`
          : `${organizer.user.firstName} ${organizer.user.lastName}`,
        role: organizer.role,
        roleTitle: organizer.roleTitle,
      };
    }
  );

  // Mitglied aus dem Event-OK entfernen
  fastify.delete<{ Params: { slug: string; organizerId: string } }>(
    '/api/events/:slug/organizers/:organizerId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { organizerId } = request.params;

      const existing = await fastify.prisma.eventOrganizer.findUnique({
        where: { id: organizerId },
        include: { event: true },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'OK-Mitglied nicht gefunden' });
      }

      await fastify.prisma.eventOrganizer.delete({
        where: { id: organizerId },
      });

      return { message: 'OK-Mitglied erfolgreich entfernt' };
    }
  );
};

export default eventRoutes;
