import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CreateDepartmentFromCeviDbSchema,
  RegisterDepartmentSchema,
  type DepartmentCreationEligibilityDto,
} from '@schichtplan/shared';
import { ceviDbLeadership } from '../services/cevidb.js';

const NOT_ELIGIBLE_MESSAGES = {
  NOT_CEVIDB: 'Um eine Abteilung anzulegen, melde dich bitte mit Cevi.DB an.',
  NOT_LEADER:
    'Nur die Abteilungsleitung (Rolle «Abteilungsleiter/-in» in Cevi.DB) kann eine Abteilung anlegen.',
  NO_ORTSGRUPPE: 'In Cevi.DB ist für dich keine Ortsgruppe hinterlegt.',
  EXISTS: 'Für deine Ortsgruppe gibt es bereits eine Abteilung.',
} as const;

/** Darf die Person (laut gespeichertem Cevi.DB-Profil) für ihre Ortsgruppe eine Abteilung anlegen? */
async function departmentCreationEligibility(
  prisma: PrismaClient,
  userId: string
): Promise<DepartmentCreationEligibilityDto> {
  const denied = (
    reason: NonNullable<DepartmentCreationEligibilityDto['reason']>,
    extra: Partial<DepartmentCreationEligibilityDto> = {}
  ): DepartmentCreationEligibilityDto => ({
    eligible: false,
    reason,
    ortsgruppeId: null,
    leaderGroupName: null,
    existingDepartment: null,
    ...extra,
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ceviDbId: true, ceviDbData: true },
  });
  // ceviDbData wird nur vom Cevi.DB-Login geschrieben und ist deshalb vertrauenswürdig
  if (!user || user.ceviDbId === null || !user.ceviDbData) return denied('NOT_CEVIDB');

  const { isLeader, ortsgruppeId, leaderGroupName } = ceviDbLeadership(user.ceviDbData);
  if (!isLeader) return denied('NOT_LEADER');
  if (ortsgruppeId === null) return denied('NO_ORTSGRUPPE', { leaderGroupName });

  const existing = await prisma.department.findUnique({
    where: { ceviDbGroupId: ortsgruppeId },
    select: { name: true, slug: true },
  });
  if (existing) return denied('EXISTS', { ortsgruppeId, leaderGroupName, existingDepartment: existing });

  return { eligible: true, reason: null, ortsgruppeId, leaderGroupName, existingDepartment: null };
}

const departmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Current department (auf Subdomain)
  fastify.get('/api/departments/current', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(404).send({ error: 'Keine Abteilung für diese Subdomain gefunden' });
    }

    return {
      id: request.tenant.id,
      name: request.tenant.name,
      slug: request.tenant.slug,
      logoUrl: request.tenant.logoUrl,
      primaryColor: request.tenant.primaryColor,
      contactEmail: request.tenant.contactEmail,
      createdAt: request.tenant.createdAt.toISOString(),
    };
  });

  // Liste aller Abteilungen (für Hauptseite / Suche)
  fastify.get('/api/departments', async () => {
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

  // Darf ich für meine Ortsgruppe eine Abteilung anlegen? (Abteilungsleitung laut Cevi.DB)
  fastify.get(
    '/api/departments/creation-eligibility',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return departmentCreationEligibility(fastify.prisma, request.user.id);
    }
  );

  // Abteilung anlegen als Abteilungsleitung: ohne Passwort, verknüpft mit der Cevi.DB-Ortsgruppe
  fastify.post(
    '/api/departments/cevidb',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parse = CreateDepartmentFromCeviDbSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const { departmentName, slug } = parse.data;

      const eligibility = await departmentCreationEligibility(fastify.prisma, request.user.id);
      if (!eligibility.eligible || eligibility.ortsgruppeId === null) {
        const reason = eligibility.reason ?? 'NOT_LEADER';
        return reply
          .status(reason === 'EXISTS' ? 409 : 403)
          .send({ error: NOT_ELIGIBLE_MESSAGES[reason], reason, existingDepartment: eligibility.existingDepartment });
      }
      const ortsgruppeId = eligibility.ortsgruppeId;

      try {
        const department = await fastify.prisma.$transaction(async (tx) => {
          const user = await tx.user.findUniqueOrThrow({
            where: { id: request.user.id },
            select: { email: true },
          });
          // Platzhalter-Adressen aus dem Cevi.DB-Login (kein E-Mail im Profil) nicht als Kontakt übernehmen
          const hasRealEmail = user.email && !/^cevidb_\d+@cevi-schichtplan\.ch$/.test(user.email);

          const created = await tx.department.create({
            data: {
              name: departmentName,
              slug,
              contactEmail: hasRealEmail ? user.email : null,
              ceviDbGroupId: ortsgruppeId,
            },
          });
          await tx.departmentMember.create({
            data: { departmentId: created.id, userId: request.user.id, role: 'ADMIN' },
          });

          // Alle bereits angemeldeten Cevi.DB-Personen dieser Ortsgruppe gleich als Helfer zuordnen
          await tx.$executeRaw`
            INSERT INTO "department_members" ("id", "departmentId", "userId", "role")
            SELECT gen_random_uuid()::text, ${created.id}::text, u."id", 'HELPER'
            FROM "users" u
            WHERE CASE
                    WHEN u."ceviDbData"->>'ortsgruppe_id' ~ '^[0-9]{1,9}$'
                    THEN (u."ceviDbData"->>'ortsgruppe_id')::integer
                  END = ${ortsgruppeId}::integer
            ON CONFLICT ("departmentId", "userId") DO NOTHING`;

          return created;
        });

        request.log.info(
          { userId: request.user.id, departmentId: department.id, slug, ortsgruppeId },
          'Abteilung von Abteilungsleitung (Cevi.DB) angelegt'
        );
        return reply.status(201).send({
          department: { id: department.id, name: department.name, slug: department.slug },
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

  // Neue Abteilung registrieren (von Hauptseite aus)
  fastify.post('/api/departments', async (request, reply) => {
    const parse = RegisterDepartmentSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const {
      departmentName,
      slug,
      adminFirstName,
      adminLastName,
      adminCeviName,
      adminEmail,
      adminPassword,
      adminPhone,
    } = parse.data;

    const normalizedSlug = slug.toLowerCase();

    // Prüfen, ob Slug bereits existiert
    const existingDept = await fastify.prisma.department.findUnique({
      where: { slug: normalizedSlug },
    });

    if (existingDept) {
      return reply.status(409).send({ error: 'Diese Subdomain ist bereits vergeben' });
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // Transaktion: Abteilung + Admin-User + Zuordnung anlegen
    const result = await fastify.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email: adminEmail.toLowerCase() },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: adminEmail.toLowerCase(),
            passwordHash,
            firstName: adminFirstName,
            lastName: adminLastName,
            ceviName: adminCeviName || null,
            phone: adminPhone || null,
          },
        });
      }

      const department = await tx.department.create({
        data: {
          name: departmentName,
          slug: normalizedSlug,
          contactEmail: adminEmail.toLowerCase(),
        },
      });

      await tx.departmentMember.create({
        data: {
          departmentId: department.id,
          userId: user.id,
          role: 'ADMIN',
        },
      });

      return { department, user };
    });

    const token = fastify.jwt.sign({
      id: result.user.id,
      email: result.user.email,
      isGlobalAdmin: result.user.isGlobalAdmin,
    });

    return {
      department: {
        id: result.department.id,
        name: result.department.name,
        slug: result.department.slug,
      },
      token,
      message: 'Abteilung erfolgreich erstellt!',
    };
  });

  // Abteilungs-Einstellungen aktualisieren (Logo, Name, Kontakt) - nur Abteilungsleitung
  fastify.patch(
    '/api/departments/current',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }

      const member = await fastify.prisma.departmentMember.findUnique({
        where: {
          departmentId_userId: {
            departmentId: request.tenant.id,
            userId: request.user.id,
          },
        },
      });

      if (!member || (member.role !== 'ADMIN' && !request.user.isGlobalAdmin)) {
        return reply
          .status(403)
          .send({ error: 'Nur die Abteilungsleitung darf das Logo und die Einstellungen anpassen' });
      }

      const { UpdateDepartmentSchema } = await import('@schichtplan/shared');
      const parse = UpdateDepartmentSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const updated = await fastify.prisma.department.update({
        where: { id: request.tenant.id },
        data: {
          name: parse.data.name !== undefined ? parse.data.name : undefined,
          logoUrl: parse.data.logoUrl !== undefined ? parse.data.logoUrl : undefined,
          primaryColor: parse.data.primaryColor !== undefined ? parse.data.primaryColor : undefined,
          contactEmail: parse.data.contactEmail !== undefined ? parse.data.contactEmail : undefined,
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        logoUrl: updated.logoUrl,
        primaryColor: updated.primaryColor,
        contactEmail: updated.contactEmail,
      };
    }
  );
};

export default departmentRoutes;
