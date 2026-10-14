import { FastifyPluginAsync } from 'fastify';
import { CreateTaskDefinitionSchema, UpdateTaskDefinitionSchema } from '@schichtplan/shared';

const taskDefinitionRoutes: FastifyPluginAsync = async (fastify) => {
  // Liste aller Arbeiten (Task-Definitionen) der aktuellen Abteilung
  fastify.get('/api/tasks', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
    }

    const tasks = await fastify.prisma.taskDefinition.findMany({
      where: {
        departmentId: request.tenant.id,
      },
      orderBy: { title: 'asc' },
    });

    return tasks.map((t) => ({
      id: t.id,
      departmentId: t.departmentId,
      title: t.title,
      description: t.description,
      minAge: t.minAge,
      ageRequirementType: t.ageRequirementType as 'ALL' | 'AT_LEAST_ONE',
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  });

  // Neue Arbeit im Katalog erstellen (Admin, Planner oder Helfer mit Berechtigung)
  fastify.post(
    '/api/tasks',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const parse = CreateTaskDefinitionSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const { title, description, minAge, ageRequirementType } = parse.data;

      // Berechtigung: Admin, Planner oder GlobalAdmin
      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      const isDeptAdmin = member && (member.role === 'ADMIN' || member.role === 'PLANNER');
      if (!isDeptAdmin && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Erstellen von Arbeiten' });
      }

      // Prüfe ob bereits eine Arbeit mit identischem Titel existiert
      const existing = await fastify.prisma.taskDefinition.findFirst({
        where: {
          departmentId: request.tenant.id,
          title: { equals: title.trim(), mode: 'insensitive' },
        },
      });

      if (existing) {
        return reply.status(409).send({ error: `Eine Arbeit mit dem Namen "${title}" existiert bereits.` });
      }

      const task = await fastify.prisma.taskDefinition.create({
        data: {
          departmentId: request.tenant.id,
          title: title.trim(),
          description: description?.trim() || null,
          minAge: minAge || null,
          ageRequirementType: ageRequirementType || 'ALL',
        },
      });

      return {
        id: task.id,
        departmentId: task.departmentId,
        title: task.title,
        description: task.description,
        minAge: task.minAge,
        ageRequirementType: task.ageRequirementType,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
    }
  );

  // Arbeit bearbeiten
  fastify.patch<{ Params: { id: string } }>(
    '/api/tasks/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const parse = UpdateTaskDefinitionSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const task = await fastify.prisma.taskDefinition.findUnique({
        where: { id: request.params.id },
      });

      if (!task || task.departmentId !== request.tenant.id) {
        return reply.status(404).send({ error: 'Arbeit nicht gefunden' });
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
      if (!isDeptAdmin && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      const { title, description, minAge, ageRequirementType } = parse.data;

      const updated = await fastify.prisma.taskDefinition.update({
        where: { id: request.params.id },
        data: {
          title: title !== undefined ? title.trim() : undefined,
          description: description !== undefined ? description?.trim() || null : undefined,
          minAge: minAge !== undefined ? minAge : undefined,
          ageRequirementType: ageRequirementType !== undefined ? ageRequirementType : undefined,
        },
      });

      return {
        id: updated.id,
        departmentId: updated.departmentId,
        title: updated.title,
        description: updated.description,
        minAge: updated.minAge,
        ageRequirementType: updated.ageRequirementType,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }
  );

  // Arbeit löschen
  fastify.delete<{ Params: { id: string } }>(
    '/api/tasks/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const task = await fastify.prisma.taskDefinition.findUnique({
        where: { id: request.params.id },
      });

      if (!task || task.departmentId !== request.tenant.id) {
        return reply.status(404).send({ error: 'Arbeit nicht gefunden' });
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
      if (!isDeptAdmin && !request.user.isGlobalAdmin) {
        return reply.status(403).send({ error: 'Keine Berechtigung' });
      }

      await fastify.prisma.taskDefinition.delete({
        where: { id: request.params.id },
      });

      return { success: true };
    }
  );
};

export default taskDefinitionRoutes;
