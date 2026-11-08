import { z } from 'zod';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, } from '../../db.js';
import {
  CreateDepartmentFromCeviDbSchema,
  UpdateDepartmentSchema,
  type DepartmentDirectoryItemDto,
  type DepartmentPermission,
} from '@schichtplan/shared';
import { autoCreateCeviDbDepartmentStufen, ceviDbGroupPeople, NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { isDepartmentInsider, } from '../../services/departmentVisibility.js';
import { departmentAccess, } from '../../services/permissions.js';
import { computeDepartmentStats } from '../../services/departmentStats.js';
import { contactCandidateWhere, loadContactPerson, NOT_ELIGIBLE_MESSAGES, departmentCreationEligibility, requireDepartmentPermission, } from './shared.js';

/** Abteilung: Angaben, Verzeichnis, Statistik, Anlegen und Einstellungen */
const departmentInfoRoutes: FastifyPluginAsync = async (fastify) => {
  /** Recht in der Abteilung der Subdomain prüfen (siehe shared.ts) */
  const requirePermission = (request: FastifyRequest, reply: FastifyReply, permission: DepartmentPermission) =>
    requireDepartmentPermission(fastify, request, reply, permission);

  // Current department (auf Subdomain)
  fastify.get(
    '/api/departments/current',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Aktuelle Abteilung abrufen',
        description: 'Liefert die Konfigurationsdaten (Name, Logo, Primärfarbe, Kontaktperson) der Abteilung für die aktuelle Subdomain.',
      },
      preHandler: [fastify.optionalAuthenticate],
    },
    async (request, reply) => {
    if (!request.tenant) {
      return reply.status(404).send({ error: 'Keine Abteilung für diese Subdomain gefunden' });
    }
    reply.header('Cache-Control', 'no-store');

    return {
      id: request.tenant.id,
      name: request.tenant.name,
      slug: request.tenant.slug,
      logoUrl: request.tenant.logoUrl,
      primaryColor: request.tenant.primaryColor,
      secondaryColor: request.tenant.secondaryColor,
      qrStyle: request.tenant.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID' | null,
      qrCustomColors: request.tenant.qrCustomColors,
      qrColorPrimary: request.tenant.qrColorPrimary,
      qrColorSecondary: request.tenant.qrColorSecondary,
      contactUserId: request.tenant.contactUserId,
      contactPerson: await loadContactPerson(fastify.prisma, request.tenant.contactUserId, Boolean(request.user)),
      ceviDbGroupId: request.tenant.ceviDbGroupId,
      membersOnly: request.tenant.membersOnly,
      viewerIsMember: await isDepartmentInsider(fastify.prisma, request.tenant.id, request.user?.id),
      createdAt: request.tenant.createdAt.toISOString(),
    };
  });

  // Alle Abteilungen mit ihren Stufen (Auswahl im Login, Whitelist und Stufen-Filter bei Anlässen)
  fastify.get(
    '/api/departments/directory',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Öffentliches Abteilungsverzeichnis abrufen',
        description: 'Liefert alle Abteilungen inklusive ihrer Stufen für Auswahldialoge und Anlassfreigaben.',
      },
    },
    async (_request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    const departments = await fastify.prisma.department.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        stufen: { select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    });
    return departments satisfies DepartmentDirectoryItemDto[];
  });

  // Statistiken und Jahresrückblick für die Abteilung (z. B. für GV / Helferstunden)
  fastify.get<{
    Querystring: {
      year?: string;
      countAttendedOnly?: 'true' | 'false';
      includeSetupTeardown?: 'true' | 'false';
    };
  }>(
    '/api/departments/current/stats',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Statistiken & Jahresrückblick der Abteilung abrufen',
        description: 'Liefert aggregierte Helferstunden, Anlass-Auswertungen, Stufen-Beteiligung und Top-Helfende für die GV.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          year: z.string().optional().describe('Kalenderjahr (z. B. 2026) oder "ALL" für alle Jahre'),
          countAttendedOnly: z.enum(['true', 'false']).optional().describe('Nur bestätigte Anwesenheiten zählen'),
          includeSetupTeardown: z.enum(['true', 'false']).optional().describe('Auf-/Abbau-Schichten einbeziehen'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
      }
      const access = await departmentAccess(fastify.prisma, request.tenant.id, request.user.id);
      if (!access.permissions.has('PEOPLE_VIEW') && !access.permissions.has('DEPARTMENT_SETTINGS')) {
        return reply.status(403).send({ error: 'Keine Berechtigung zum Einsehen der Abteilungsstatistik.' });
      }

      reply.header('Cache-Control', 'no-store');

      const queryYear = request.query.year;
      let year: number | 'ALL' | undefined;
      if (queryYear === 'ALL') {
        year = 'ALL';
      } else if (queryYear && /^\d{4}$/.test(queryYear)) {
        year = parseInt(queryYear, 10);
      }

      const countAttendedOnly = request.query.countAttendedOnly === 'true';
      const includeSetupTeardown = request.query.includeSetupTeardown !== 'false';

      return computeDepartmentStats(fastify.prisma, request.tenant.id, {
        year,
        countAttendedOnly,
        includeSetupTeardown,
      });
    }
  );

  // Liste aller Abteilungen (für Hauptseite / Suche)
  fastify.get(
    '/api/departments',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Alle Abteilungen auflisten',
        description: 'Öffentliche Übersicht aller aktiven Abteilungen mit Anzahlinformationen zu aktiven Anlässen.',
      },
    },
    async () => {
    const departments = await fastify.prisma.department.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        _count: {
          select: {
            events: { where: { isPublished: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      logoUrl: d.logoUrl,
      primaryColor: d.primaryColor,
      activeEventsCount: d._count.events,
    }));
  });

  // Darf ich für meine Gruppe eine Abteilung anlegen? (Abteilungsleitung laut Cevi.DB)
  fastify.get(
    '/api/departments/creation-eligibility',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Berechtigung zum Anlegen einer Abteilung prüfen',
        description: 'Prüft, ob die angemeldete Person in der Cevi.DB als Abteilungsleitung einer Ortsgruppe hinterlegt ist.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return departmentCreationEligibility(fastify.prisma, request.user.id);
    }
  );

  // Abteilung anlegen als Abteilungsleitung: ohne Passwort, verknüpft mit der Cevi.DB-Gruppe
  fastify.post(
    '/api/departments/cevidb',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Neue Abteilung über Cevi.DB erstellen',
        description: 'Legt eine neue Abteilung anhand der Cevi.DB-Leitungsrolle an und weist die Subdomain zu.',
        security: [{ bearerAuth: [] }],
        body: CreateDepartmentFromCeviDbSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof CreateDepartmentFromCeviDbSchema>;
      const { departmentName, slug } = input;

      const eligibility = await departmentCreationEligibility(fastify.prisma, request.user.id);
      if (!eligibility.eligible || eligibility.ortsgruppeId === null) {
        const reason = eligibility.reason ?? 'NOT_LEADER';
        return reply
          .status(reason === 'EXISTS' ? 409 : 403)
          .send({ error: NOT_ELIGIBLE_MESSAGES[reason], reason, existingDepartment: eligibility.existingDepartment });
      }
      const ceviDbGroupId = eligibility.ortsgruppeId;

      try {
        const departmentResult = await fastify.prisma.$transaction(async (tx) => {
          const created = await tx.department.create({
            data: {
              name: departmentName,
              slug,
              contactUserId: request.user.id,
              ceviDbGroupId,
            },
          });
          await tx.departmentMember.create({
            data: { departmentId: created.id, userId: request.user.id, role: 'ADMIN', leaderSource: 'CEVIDB' },
          });
          await tx.user.update({
            where: { id: request.user.id },
            data: { homeDepartmentId: created.id, homeDepartmentSource: 'CEVIDB', ...NO_HOME_CONFIRMATION, departmentSetupAt: new Date() },
          });

          // Alle bereits angemeldeten Cevi.DB-Personen dieser Gruppe werden Helfer*innen bzw. Abteilungsleitung
          // (nur über ihre eigene Leitungsrolle) und bekommen die neue Abteilung wenn möglich als Heimabteilung
          const people = await ceviDbGroupPeople(tx, ceviDbGroupId);
          await tx.user.updateMany({
            where: { id: { in: people.filter((p) => p.moveHome).map((p) => p.id) } },
            data: { homeDepartmentId: created.id, homeDepartmentSource: 'CEVIDB', ...NO_HOME_CONFIRMATION, departmentSetupAt: new Date() },
          });
          await tx.departmentMember.createMany({
            data: people.map((p) => ({
              departmentId: created.id,
              userId: p.id,
              role: p.isLeader ? 'ADMIN' : 'HELPER',
              leaderSource: p.isLeader ? 'CEVIDB' : null,
            })),
            skipDuplicates: true,
          });
          const leaderIds = people.filter((p) => p.isLeader).map((p) => p.id);
          if (leaderIds.length) {
            await tx.departmentMember.updateMany({
              where: { departmentId: created.id, userId: { in: leaderIds } },
              data: { role: 'ADMIN', leaderSource: 'CEVIDB' },
            });
          }

          return { department: created, memberIds: people.map((p) => p.id) };
        });

        for (const memberId of departmentResult.memberIds) {
          await autoCreateCeviDbDepartmentStufen(fastify.prisma, departmentResult.department.id, memberId);
        }

        request.log.info(
          { userId: request.user.id, departmentId: departmentResult.department.id, slug, ceviDbGroupId },
          'Abteilung von Abteilungsleitung (Cevi.DB) angelegt'
        );
        return reply.status(201).send({
          department: {
            id: departmentResult.department.id,
            name: departmentResult.department.name,
            slug: departmentResult.department.slug,
          },
          message: 'Abteilung erfolgreich erstellt!',
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const target = String(err.meta?.target ?? '');
          if (target.includes('slug')) {
            return reply.status(409).send({ error: 'Diese Subdomain ist bereits vergeben' });
          }
          return reply
            .status(409)
            .send({ error: NOT_ELIGIBLE_MESSAGES.EXISTS, reason: 'EXISTS', existingDepartment: null });
        }
        throw err;
      }
    }
  );

  // Abteilungs-Einstellungen aktualisieren (Logo, Name, Kontaktperson): Recht «Abteilung bearbeiten»
  fastify.patch(
    '/api/departments/current',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Abteilungseinstellungen bearbeiten',
        description: 'Aktualisiert Logo, Primärfarbe, Name oder Kontaktperson der aktuellen Abteilung.',
        security: [{ bearerAuth: [] }],
        body: UpdateDepartmentSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'DEPARTMENT_SETTINGS');
      if (!ctx) return;
      const { tenant } = ctx;

      const input = request.body as z.output<typeof UpdateDepartmentSchema>;
      const { contactUserId } = input;
      if (contactUserId) {
        const candidate = await fastify.prisma.departmentMember.findFirst({
          where: { ...contactCandidateWhere(tenant.id), userId: contactUserId },
          select: { id: true },
        });
        if (!candidate) {
          return reply.status(400).send({
            error: 'Kontaktperson kann nur die Abteilungsleitung oder jemand mit «Personen und Rechte verwalten» sein.',
          });
        }
      }

      const updated = await fastify.prisma.department.update({
        where: { id: tenant.id },
        data: {
          name: input.name !== undefined ? input.name : undefined,
          logoUrl: input.logoUrl !== undefined ? input.logoUrl : undefined,
          primaryColor: input.primaryColor !== undefined ? input.primaryColor : undefined,
          secondaryColor: input.secondaryColor !== undefined ? input.secondaryColor : undefined,
          qrStyle: input.qrStyle !== undefined ? input.qrStyle : undefined,
          qrCustomColors: input.qrCustomColors !== undefined ? input.qrCustomColors : undefined,
          qrColorPrimary: input.qrColorPrimary !== undefined ? input.qrColorPrimary : undefined,
          qrColorSecondary: input.qrColorSecondary !== undefined ? input.qrColorSecondary : undefined,
          contactUserId,
          membersOnly: input.membersOnly,
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        logoUrl: updated.logoUrl,
        primaryColor: updated.primaryColor,
        secondaryColor: updated.secondaryColor,
        qrStyle: updated.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID' | null,
        qrCustomColors: updated.qrCustomColors,
        qrColorPrimary: updated.qrColorPrimary,
        qrColorSecondary: updated.qrColorSecondary,
        contactUserId: updated.contactUserId,
      };
    }
  );
};

export default departmentInfoRoutes;
