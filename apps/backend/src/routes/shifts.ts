import { FastifyPluginAsync } from 'fastify';
import { CreateShiftSchema } from '@schichtplan/shared';

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

  // In Schicht eintragen (Angemeldeter Helfer)
  fastify.post<{ Params: { id: string } }>(
    '/api/shifts/:id/signup',
    { preHandler: [fastify.authenticate] },
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

      // Prüfe ob bereits eingetragen
      const alreadySignedUp = shift.signups.some((s) => s.userId === request.user.id);
      if (alreadySignedUp) {
        return reply.status(409).send({ error: 'Du bist für diese Schicht bereits eingetragen' });
      }

      // Prüfe freie Plätze
      if (shift.signups.length >= shift.requiredSlots) {
        return reply.status(409).send({ error: 'Diese Schicht ist bereits voll belegt' });
      }

      const signup = await fastify.prisma.shiftSignup.create({
        data: {
          shiftId,
          userId: request.user.id,
        },
      });

      return {
        id: signup.id,
        message: 'Erfolgreich für die Schicht eingetragen!',
      };
    }
  );

  // Aus Schicht austragen
  fastify.delete<{ Params: { id: string } }>(
    '/api/shifts/:id/signup',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const shiftId = request.params.id;

      const existingSignup = await fastify.prisma.shiftSignup.findUnique({
        where: {
          shiftId_userId: {
            shiftId,
            userId: request.user.id,
          },
        },
      });

      if (!existingSignup) {
        return reply.status(404).send({ error: 'Eintragung nicht gefunden' });
      }

      await fastify.prisma.shiftSignup.delete({
        where: {
          shiftId_userId: {
            shiftId,
            userId: request.user.id,
          },
        },
      });

      return { message: 'Erfolgreich aus der Schicht ausgetragen' };
    }
  );
};

export default shiftRoutes;
