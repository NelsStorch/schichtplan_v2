import { z } from 'zod';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import {
  StufeInputSchema,
  type DepartmentPermission,
} from '@schichtplan/shared';
import { autoCreateAllCeviDbDepartmentStufen, backfillCeviDbStufen, } from '../../services/homeDepartment.js';
import { toStufeDto, stufenSyncDue, isUniqueViolation, requireDepartmentPermission, } from './shared.js';

/** Stufen der Abteilung */
const departmentStufenRoutes: FastifyPluginAsync = async (fastify) => {
  /** Recht in der Abteilung der Subdomain prüfen (siehe shared.ts) */
  const requirePermission = (request: FastifyRequest, reply: FastifyReply, permission: DepartmentPermission) =>
    requireDepartmentPermission(fastify, request, reply, permission);

  // Stufen der aktuellen Abteilung
  fastify.get(
    '/api/departments/current/stufen',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufen der aktuellen Abteilung abrufen',
        description: 'Liefert alle Alters- und Gruppenstufen der aktuellen Abteilung.',
      },
    },
    async (request, reply) => {
    if (!request.tenant) return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
    // Öffentlicher Abruf: das Nachführen (mit Schreibzugriffen) höchstens alle paar Minuten pro Abteilung.
    // Beim Cevi.DB-Login und in den Stufen-Vorschlägen läuft es ohnehin.
    if (stufenSyncDue(request.tenant.id)) {
      await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, request.tenant.id);
    }
    const stufen = await fastify.prisma.departmentStufe.findMany({
      where: { departmentId: request.tenant.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return stufen.map(toStufeDto);
  });

  fastify.post(
    '/api/departments/current/stufen',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Neue Stufe in der Abteilung anlegen',
        description: 'Erstellt eine neue Stufe in der aktuellen Abteilung (Recht «Stufen verwalten» erforderlich).',
        security: [{ bearerAuth: [] }],
        body: StufeInputSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
    const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
    if (!ctx) return;
    const { tenant } = ctx;
    const input = request.body as z.output<typeof StufeInputSchema>;

    try {
      const count = await fastify.prisma.departmentStufe.count({ where: { departmentId: tenant.id } });
      const stufe = await fastify.prisma.departmentStufe.create({
        data: {
          departmentId: tenant.id,
          name: input.name,
          ceviDbGroupId: input.ceviDbGroupId ?? null,
          sortOrder: input.sortOrder ?? count,
        },
      });
      if (stufe.ceviDbGroupId !== null) await backfillCeviDbStufen(fastify.prisma, tenant.id);
      return reply.status(201).send(toStufeDto(stufe));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: 'Diese Stufe (Name oder Cevi.DB-Gruppe) gibt es schon' });
      }
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/departments/current/stufen/:id',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufe bearbeiten',
        description: 'Aktualisiert Name, Cevi.DB-Verknüpfung oder Sortierreihenfolge einer Stufe.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Stufe'),
        }),
        body: StufeInputSchema.partial(),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
      if (!ctx) return;
      const { tenant } = ctx;
      // Vom Routen-Schema geprüft (StufeInputSchema.partial())
      const input = request.body as Partial<z.output<typeof StufeInputSchema>>;

      const existing = await fastify.prisma.departmentStufe.findFirst({
        where: { id: request.params.id, departmentId: tenant.id },
      });
      if (!existing) return reply.status(404).send({ error: 'Stufe nicht gefunden' });

      try {
        const stufe = await fastify.prisma.departmentStufe.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            ceviDbGroupId: input.ceviDbGroupId,
            sortOrder: input.sortOrder,
          },
        });
        if (input.ceviDbGroupId !== undefined && input.ceviDbGroupId !== existing.ceviDbGroupId) {
          // Zuordnungen aus Cevi.DB zur alten Gruppe gelten nicht mehr
          await fastify.prisma.userStufe.deleteMany({ where: { stufeId: stufe.id, source: 'CEVIDB' } });
          if (stufe.ceviDbGroupId !== null) await backfillCeviDbStufen(fastify.prisma, tenant.id);
        }
        return toStufeDto(stufe);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.status(409).send({ error: 'Diese Stufe (Name oder Cevi.DB-Gruppe) gibt es schon' });
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/departments/current/stufen/:id',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufe löschen',
        description: 'Entfernt eine Stufe aus der aktuellen Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Stufe'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
      if (!ctx) return;
      const deleted = await fastify.prisma.departmentStufe.deleteMany({
        where: { id: request.params.id, departmentId: ctx.tenant.id },
      });
      if (deleted.count === 0) return reply.status(404).send({ error: 'Stufe nicht gefunden' });
      return { message: 'Stufe gelöscht' };
    }
  );

  // Vorschläge: Cevi.DB-Stufen werden automatisch angelegt
  fastify.get(
    '/api/departments/current/stufen/suggestions',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Stufen-Vorschläge synchronisieren',
        description: 'Synchronisiert automatisch fehlende Gruppen aus der Cevi.DB als Stufen.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'STUFEN_MANAGE');
      if (!ctx) return;
      const { tenant } = ctx;
      await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, tenant.id);
      return [];
    }
  );
};

export default departmentStufenRoutes;
