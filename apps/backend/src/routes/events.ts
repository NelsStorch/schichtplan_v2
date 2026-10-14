import { FastifyPluginAsync } from 'fastify';
import {
  CreateEventSchema,
  AddEventOrganizerSchema,
  SignupMode,
  SaveAsTemplateSchema,
  UnregisterHelperSchema,
} from '@schichtplan/shared';

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
            tasks: {
              include: {
                signups: true,
              },
              orderBy: { createdAt: 'asc' },
            },
            signups: {
              include: {
                task: true,
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
              orderBy: { createdAt: 'asc' },
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

          const userBirthDate = su.user?.birthDate ? su.user.birthDate.toISOString() : null;
          let userAge: number | null = null;
          if (su.user?.birthDate) {
            const shiftDate = new Date(s.startTime);
            const bDate = new Date(su.user.birthDate);
            userAge = shiftDate.getFullYear() - bDate.getFullYear();
            const m = shiftDate.getMonth() - bDate.getMonth();
            if (m < 0 || (m === 0 && shiftDate.getDate() < bDate.getDate())) {
              userAge--;
            }
          }

          return {
            id: su.id,
            shiftId: su.shiftId,
            taskId: su.taskId || null,
            taskTitle: su.task?.title || null,
            userId: su.user?.id || null,
            guestName: su.guestName,
            guestEmail: su.guestEmail,
            guestPhone: su.guestPhone,
            displayName,
            userFirstName: su.user?.firstName || null,
            userLastName: su.user?.lastName || null,
            userCeviName: su.user?.ceviName || null,
            userBirthDate,
            userAge,
            createdAt: su.createdAt.toISOString(),
            isConfirmed: su.isConfirmed,
          };
        });

        const tasks = s.tasks.map((t) => {
          const taskSignups = signups.filter((su) => su.taskId === t.id);
          return {
            id: t.id,
            shiftId: t.shiftId,
            taskDefinitionId: t.taskDefinitionId || null,
            title: t.title,
            description: t.description,
            requiredSlots: t.requiredSlots,
            freeSlots: Math.max(0, t.requiredSlots - taskSignups.length),
            minAge: t.minAge,
            ageRequirementType: t.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
            signups: taskSignups,
          };
        });

        return {
          id: s.id,
          eventId: s.eventId,
          title: s.title,
          category: s.category,
          isSetupTeardown: s.isSetupTeardown,
          description: s.description,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          requiredSlots: s.requiredSlots,
          freeSlots: Math.max(0, s.requiredSlots - signups.length),
          minAge: s.minAge,
          tasks,
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
        organizers: requestedOrganizers,
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

      // OK-Mitglieder auflösen
      const organizersToCreate: Array<{ userId: string; role: string; roleTitle?: string }> = [];
      const userIdsSeen = new Set<string>();

      if (Array.isArray(requestedOrganizers) && requestedOrganizers.length > 0) {
        for (const item of requestedOrganizers) {
          let targetUser = null;
          if (item.userId) {
            targetUser = await fastify.prisma.user.findUnique({ where: { id: item.userId } });
          } else if (item.ceviName) {
            targetUser = await fastify.prisma.user.findFirst({
              where: { ceviName: { equals: item.ceviName.trim(), mode: 'insensitive' } },
            });
          } else if (item.email) {
            targetUser = await fastify.prisma.user.findUnique({
              where: { email: item.email.toLowerCase() },
            });
          }

          if (targetUser && !userIdsSeen.has(targetUser.id)) {
            userIdsSeen.add(targetUser.id);
            organizersToCreate.push({
              userId: targetUser.id,
              role: item.role || 'OK_MEMBER',
              roleTitle: item.roleTitle?.trim() || (item.role === 'OK_LEAD' ? 'Event-Leitung' : undefined),
            });

            // Sicherstellen, dass die Person Mitglied der Abteilung ist
            await fastify.prisma.departmentMember.upsert({
              where: {
                departmentId_userId: {
                  departmentId: request.tenant.id,
                  userId: targetUser.id,
                },
              },
              update: {},
              create: {
                departmentId: request.tenant.id,
                userId: targetUser.id,
                role: 'HELPER',
              },
            });
          }
        }
      }

      // Falls der Ersteller noch nicht im OK ist, als OK-Leitung hinzufügen
      if (!userIdsSeen.has(request.user.id)) {
        organizersToCreate.unshift({
          userId: request.user.id,
          role: 'OK_LEAD',
          roleTitle: 'Event-Leitung',
        });
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
          organizers: {
            create: organizersToCreate,
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

  // Helfer komplett vom Event abmelden (aus allen Schichten dieses Events austragen)
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/unregister-helper',
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

      // Berechtigung prüfen: Admin, Planner oder Event-OK
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Abmelden von Helfern' });
      }

      const parse = UnregisterHelperSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { userId, guestName } = parse.data;

      if (!userId && !guestName) {
        return reply.status(400).send({ error: 'userId oder guestName erforderlich' });
      }

      const whereClause: any = {
        shift: { eventId: event.id },
      };

      if (userId) {
        whereClause.userId = userId;
      } else if (guestName) {
        whereClause.guestName = { equals: guestName, mode: 'insensitive' };
      }

      const deleted = await fastify.prisma.shiftSignup.deleteMany({
        where: whereClause,
      });

      return {
        message: `${deleted.count} Schichteintragung(en) erfolgreich entfernt`,
        deletedCount: deleted.count,
      };
    }
  );

  // Event als Vorlage für künftige Jahre speichern
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/save-as-template',
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
          shifts: {
            include: {
              tasks: {
                orderBy: { createdAt: 'asc' },
              },
            },
            orderBy: { startTime: 'asc' },
          },
        },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      const isEventOk = event.organizers.some((o) => o.userId === request.user.id);

      if (!isDeptAdmin && !isEventOk && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Erstellen von Vorlagen' });
      }

      const parse = SaveAsTemplateSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const templateTitle = parse.data.title || `${event.title} (Vorlage)`;
      const templateDescription = parse.data.description || event.description || null;

      // Berechne relative Tage und Zeiten ausgehend vom Startdatum des Events
      const eventStart = new Date(event.startDate);
      const baseMidnight = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());

      const pad = (n: number) => String(n).padStart(2, '0');
      const formatTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const shiftTemplates = event.shifts.map((s) => {
        const sStart = new Date(s.startTime);
        const sEnd = new Date(s.endTime);

        const sDayMidnight = new Date(sStart.getFullYear(), sStart.getMonth(), sStart.getDate());
        const diffMs = sDayMidnight.getTime() - baseMidnight.getTime();
        const dayOffset = Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));

        return {
          title: s.title,
          category: s.category,
          isSetupTeardown: s.isSetupTeardown,
          description: s.description,
          minAge: s.minAge,
          dayOffset,
          startTimeStr: formatTimeStr(sStart),
          endTimeStr: formatTimeStr(sEnd),
          tasks: s.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            requiredSlots: t.requiredSlots,
            minAge: t.minAge,
            ageRequirementType: t.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
          })),
        };
      });

      const template = await fastify.prisma.eventTemplate.create({
        data: {
          departmentId: request.tenant.id,
          title: templateTitle,
          description: templateDescription,
          signupMode: event.signupMode,
          requireEmailForGuests: event.requireEmailForGuests,
          requirePhoneForGuests: event.requirePhoneForGuests,
          data: {
            shifts: shiftTemplates,
          },
        },
      });

      return {
        id: template.id,
        title: template.title,
        description: template.description,
        shiftCount: shiftTemplates.length,
        createdAt: template.createdAt.toISOString(),
      };
    }
  );
};

export default eventRoutes;
