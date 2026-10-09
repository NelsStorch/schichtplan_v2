import { FastifyPluginAsync } from 'fastify';
import { CreateShiftSchema, SignupShiftSchema } from '@schichtplan/shared';

const shiftRoutes: FastifyPluginAsync = async (fastify) => {
  // Schicht erstellen (Admin/Planner)
  fastify.post(
    '/api/shifts',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parse = CreateShiftSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { eventId, title, category, startTime, endTime, requiredSlots, description, minAge } =
        parse.data;

      // Event & Abteilung prüfen
      const event = await fastify.prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }

      // Prüfe Berechtigung
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: event.departmentId,
            userId: request.user.id,
          },
        },
      });

      if (!member || (member.role !== 'ADMIN' && member.role !== 'PLANNER')) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      const shift = await fastify.prisma.shift.create({
        data: {
          eventId,
          title,
          category,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          requiredSlots,
          description: description || null,
          minAge: minAge || null,
        },
      });

      return shift;
    }
  );

  // In Schicht eintragen (Unterstützt sowohl eingeloggte Cevianer als auch passwortlose Cevi-Namen)
  fastify.post<{ Params: { id: string } }>(
    '/api/shifts/:id/signup',
    { preHandler: [fastify.optionalAuthenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;

      const shift = await fastify.prisma.shift.findUnique({
        where: { id: shiftId },
        include: {
          signups: true,
          event: true,
        },
      });

      if (!shift) {
        return reply.status(404).send({ error: 'Schicht nicht gefunden' });
      }

      const event = shift.event;
      if (!event.allowPublicSignup) {
        return reply
          .status(403)
          .send({ error: 'Für dieses Event sind keine Selbsteintragungen mehr möglich' });
      }

      // Prüfe freie Plätze
      if (shift.signups.length >= shift.requiredSlots) {
        return reply.status(409).send({ error: 'Diese Schicht ist bereits voll belegt' });
      }

      let userId: string | null = null;
      let guestName: string | null = null;
      let guestEmail: string | null = null;
      let guestPhone: string | null = null;

      // Authentifizierter Benutzer vorhanden?
      if (request.user) {
        userId = request.user.id;
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          return reply.status(401).send({ error: 'Benutzerkonto nicht gefunden' });
        }

        // Modus CEVIDB_ONLY
        if (event.signupMode === 'CEVIDB_ONLY' && !user.ceviDbId) {
          return reply.status(403).send({
            error:
              'Für dieses Event sind nur verifizierte Cevi.DB-Konten zugelassen. Bitte mit Cevi.DB anmelden.',
          });
        }

        // Altersprüfung (minAge)
        if (shift.minAge && user.birthDate) {
          const shiftDate = new Date(shift.startTime);
          const birthDate = new Date(user.birthDate);
          let age = shiftDate.getFullYear() - birthDate.getFullYear();
          const monthDiff = shiftDate.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && shiftDate.getDate() < birthDate.getDate())) {
            age--;
          }

          if (age < shift.minAge) {
            return reply.status(403).send({
              error: `Für diese Schicht (${shift.title}) ist ein Mindestalter von ${shift.minAge} Jahren erforderlich. Dein Alter: ${age} Jahre.`,
            });
          }
        }

        // Prüfe ob bereits eingetragen
        const alreadySignedUp = shift.signups.some((s) => s.userId === userId);
        if (alreadySignedUp) {
          return reply.status(409).send({ error: 'Du bist für diese Schicht bereits eingetragen' });
        }
      } else {
        // Nicht eingeloggt: Prüfe ob Event anonyme / passwortlose Eintragung erlaubt
        if (event.signupMode === 'LOGIN_REQUIRED' || event.signupMode === 'CEVIDB_ONLY') {
          return reply.status(401).send({
            error:
              'Für dieses Event ist ein Login erforderlich. Bitte melde dich an.',
            requiresLogin: true,
          });
        }

        const parse = SignupShiftSchema.safeParse(request.body);
        if (!parse.success) {
          return reply.status(400).send({ error: parse.error.issues[0].message });
        }

        guestName = parse.data.guestName?.trim() || null;
        guestEmail = parse.data.guestEmail?.trim() || null;
        guestPhone = parse.data.guestPhone?.trim() || null;

        if (!guestName || guestName.length < 2) {
          return reply
            .status(400)
            .send({ error: 'Bitte gib deinen Cevi-Namen oder Namen ein (mind. 2 Zeichen)' });
        }

        if (event.requireEmailForGuests && !guestEmail) {
          return reply
            .status(400)
            .send({ error: 'Für dieses Event ist eine E-Mail-Adresse erforderlich' });
        }

        if (event.requirePhoneForGuests && !guestPhone) {
          return reply
            .status(400)
            .send({ error: 'Für dieses Event ist eine Telefonnummer erforderlich' });
        }

        // Prüfe ob der gleiche Name bereits für die Schicht existiert
        const nameConflict = shift.signups.some(
          (s) => s.guestName?.toLowerCase() === guestName!.toLowerCase()
        );
        if (nameConflict) {
          return reply.status(409).send({
            error: `Jemand mit dem Namen "${guestName}" ist für diese Schicht bereits eingetragen`,
          });
        }
      }

      const signup = await fastify.prisma.shiftSignup.create({
        data: {
          shiftId,
          userId,
          guestName,
          guestEmail,
          guestPhone,
        },
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
      });

      const displayName =
        signup.user?.ceviName ||
        (signup.user ? `${signup.user.firstName} ${signup.user.lastName}`.trim() : null) ||
        signup.guestName ||
        'Helfer*in';

      return {
        id: signup.id,
        shiftId: signup.shiftId,
        displayName,
        message: 'Erfolgreich für die Schicht eingetragen!',
      };
    }
  );

  // Aus Schicht austragen (Eigene Eintragung oder Admin/Planner)
  fastify.delete<{ Params: { id: string }; Querystring: { signupId?: string } }>(
    '/api/shifts/:id/signup',
    { preHandler: [fastify.optionalAuthenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;
      const { signupId } = request.query;

      if (!signupId && !request.user) {
        return reply.status(401).send({ error: 'Nicht autorisiert' });
      }

      let existingSignup = null;

      if (signupId) {
        existingSignup = await fastify.prisma.shiftSignup.findUnique({
          where: { id: signupId },
          include: { shift: { include: { event: true } } },
        });
      } else if (request.user) {
        existingSignup = await fastify.prisma.shiftSignup.findFirst({
          where: {
            shiftId,
            userId: request.user.id,
          },
          include: { shift: { include: { event: true } } },
        });
      }

      if (!existingSignup) {
        return reply.status(404).send({ error: 'Eintragung nicht gefunden' });
      }

      // Prüfe Berechtigung: Eigener Eintrag ODER Admin/Planner der Abteilung
      let isAllowed = false;
      if (request.user && existingSignup.userId === request.user.id) {
        isAllowed = true;
      } else if (request.user) {
        const member = await fastify.prisma.departmentMember.findUnique({
          where: {
            departmentId_userId: {
              departmentId: existingSignup.shift.event.departmentId,
              userId: request.user.id,
            },
          },
        });
        if (member && (member.role === 'ADMIN' || member.role === 'PLANNER')) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Löschen dieser Eintragung' });
      }

      await fastify.prisma.shiftSignup.delete({
        where: { id: existingSignup.id },
      });

      return { message: 'Erfolgreich aus der Schicht ausgetragen' };
    }
  );

  // Meine Schichten abfragen
  fastify.get(
    '/api/shifts/my',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const signups = await fastify.prisma.shiftSignup.findMany({
        where: { userId: request.user.id },
        include: {
          shift: {
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  department: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
        orderBy: { shift: { startTime: 'asc' } },
      });

      return signups.map((su) => ({
        signupId: su.id,
        shiftId: su.shift.id,
        title: su.shift.title,
        category: su.shift.category,
        description: su.shift.description,
        startTime: su.shift.startTime.toISOString(),
        endTime: su.shift.endTime.toISOString(),
        eventId: su.shift.event.id,
        eventTitle: su.shift.event.title,
        eventSlug: su.shift.event.slug,
        departmentName: su.shift.event.department.name,
        departmentSlug: su.shift.event.department.slug,
        createdAt: su.createdAt.toISOString(),
      }));
    }
  );
};

export default shiftRoutes;
