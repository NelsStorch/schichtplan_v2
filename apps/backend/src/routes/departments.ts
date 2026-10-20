import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, PrismaClient } from '../db.js';
import {
  CreateDepartmentFromCeviDbSchema,
  StufeInputSchema,
  UpdateDepartmentPersonSchema,
  UpdateDepartmentSchema,
  type DepartmentCreationEligibilityDto,
  type DepartmentDirectoryItemDto,
  type DepartmentPersonDto,
  type DepartmentStufeDto,
  type StufeSuggestionDto,
} from '@schichtplan/shared';
import { autoCreateCeviDbDepartmentStufen, backfillCeviDbStufen } from '../services/homeDepartment.js';
import { personLabel } from '../services/profile.js';
import { isDepartmentInsider, isDepartmentManager } from '../services/departmentVisibility.js';
import { CEVINAME_ROLE_ERROR, isCeviNameProfile } from '../services/ceviNameLogin.js';

const toStufeDto = (s: {
  id: string;
  departmentId: string;
  name: string;
  ceviDbGroupId: number | null;
  sortOrder: number;
}): DepartmentStufeDto => ({
  id: s.id,
  departmentId: s.departmentId,
  name: s.name,
  ceviDbGroupId: s.ceviDbGroupId,
  sortOrder: s.sortOrder,
});

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

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
    ortsgruppeName: null,
    leaderGroupName: null,
    existingDepartment: null,
    ...extra,
  });

  // Die ceviDb*-Spalten schreibt nur der Cevi.DB-Login, sie sind deshalb vertrauenswürdig
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ceviDbId: true,
      ceviDbDepartmentLeader: true,
      ceviDbOrtsgruppeId: true,
      ceviDbOrtsgruppeName: true,
      ceviDbLeaderGroupName: true,
    },
  });
  if (!user || user.ceviDbId === null) return denied('NOT_CEVIDB');

  const ortsgruppeId = user.ceviDbOrtsgruppeId;
  const ortsgruppeName = user.ceviDbOrtsgruppeName;
  const leaderGroupName = user.ceviDbLeaderGroupName;
  if (!user.ceviDbDepartmentLeader) return denied('NOT_LEADER');
  if (ortsgruppeId === null) return denied('NO_ORTSGRUPPE', { leaderGroupName });

  const existing = await prisma.department.findUnique({
    where: { ceviDbGroupId: ortsgruppeId },
    select: { name: true, slug: true },
  });
  if (existing) {
    return denied('EXISTS', { ortsgruppeId, ortsgruppeName, leaderGroupName, existingDepartment: existing });
  }

  return { eligible: true, reason: null, ortsgruppeId, ortsgruppeName, leaderGroupName, existingDepartment: null };
}

const departmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Current department (auf Subdomain)
  fastify.get('/api/departments/current', { preHandler: [fastify.optionalAuthenticate] }, async (request, reply) => {
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
      contactEmail: request.tenant.contactEmail,
      ceviDbGroupId: request.tenant.ceviDbGroupId,
      membersOnly: request.tenant.membersOnly,
      viewerIsMember: await isDepartmentInsider(fastify.prisma, request.tenant.id, request.user?.id),
      createdAt: request.tenant.createdAt.toISOString(),
    };
  });

  // Alle Abteilungen mit ihren Stufen (Auswahl im Login, Whitelist und Stufen-Filter bei Anlässen)
  fastify.get('/api/departments/directory', async (_request, reply) => {
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

  /** Nur Abteilungsleitung (oder globale Admins, laut DB) der aktuellen Subdomain */
  async function requireDeptAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.tenant) {
      reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      return null;
    }
    const [member, dbUser] = await Promise.all([
      fastify.prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId: request.tenant.id, userId: request.user.id } },
        select: { role: true },
      }),
      fastify.prisma.user.findUnique({ where: { id: request.user.id }, select: { isGlobalAdmin: true } }),
    ]);
    if (member?.role !== 'ADMIN' && !dbUser?.isGlobalAdmin) {
      reply.status(403).send({ error: 'Nur die Abteilungsleitung' });
      return null;
    }
    return request.tenant;
  }

  // Stufen der aktuellen Abteilung
  fastify.get('/api/departments/current/stufen', async (request, reply) => {
    if (!request.tenant) return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
    const stufen = await fastify.prisma.departmentStufe.findMany({
      where: { departmentId: request.tenant.id },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return stufen.map(toStufeDto);
  });

  fastify.post('/api/departments/current/stufen', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const tenant = await requireDeptAdmin(request, reply);
    if (!tenant) return;
    const parse = StufeInputSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });

    try {
      const count = await fastify.prisma.departmentStufe.count({ where: { departmentId: tenant.id } });
      const stufe = await fastify.prisma.departmentStufe.create({
        data: {
          departmentId: tenant.id,
          name: parse.data.name,
          ceviDbGroupId: parse.data.ceviDbGroupId ?? null,
          sortOrder: parse.data.sortOrder ?? count,
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
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await requireDeptAdmin(request, reply);
      if (!tenant) return;
      const parse = StufeInputSchema.partial().safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });

      const existing = await fastify.prisma.departmentStufe.findFirst({
        where: { id: request.params.id, departmentId: tenant.id },
      });
      if (!existing) return reply.status(404).send({ error: 'Stufe nicht gefunden' });

      try {
        const stufe = await fastify.prisma.departmentStufe.update({
          where: { id: existing.id },
          data: {
            name: parse.data.name,
            ceviDbGroupId: parse.data.ceviDbGroupId,
            sortOrder: parse.data.sortOrder,
          },
        });
        if (parse.data.ceviDbGroupId !== undefined && parse.data.ceviDbGroupId !== existing.ceviDbGroupId) {
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
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await requireDeptAdmin(request, reply);
      if (!tenant) return;
      const deleted = await fastify.prisma.departmentStufe.deleteMany({
        where: { id: request.params.id, departmentId: tenant.id },
      });
      if (deleted.count === 0) return reply.status(404).send({ error: 'Stufe nicht gefunden' });
      return { message: 'Stufe gelöscht' };
    }
  );

  // Vorschläge: Stufen-Gruppen aus Cevi.DB, die bei Personen dieser Abteilung vorkommen und noch fehlen
  fastify.get(
    '/api/departments/current/stufen/suggestions',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await requireDeptAdmin(request, reply);
      if (!tenant) return;
      const [roles, existing] = await Promise.all([
        fastify.prisma.userCeviDbStufe.findMany({
          where: { user: { homeDepartmentId: tenant.id, homeDepartmentSource: 'CEVIDB' } },
          select: { groupId: true, groupName: true },
        }),
        fastify.prisma.departmentStufe.findMany({
          where: { departmentId: tenant.id, ceviDbGroupId: { not: null } },
          select: { ceviDbGroupId: true },
        }),
      ]);
      const linked = new Set(existing.map((s) => s.ceviDbGroupId));
      const byGroup = new Map<number, StufeSuggestionDto>();
      for (const stufe of roles) {
        if (linked.has(stufe.groupId)) continue;
        const entry = byGroup.get(stufe.groupId);
        if (entry) entry.personCount++;
        else byGroup.set(stufe.groupId, { ceviDbGroupId: stufe.groupId, name: stufe.groupName, personCount: 1 });
      }
      return [...byGroup.values()].sort(
        (a, b) => b.personCount - a.personCount || a.name.localeCompare(b.name, 'de')
      );
    }
  );

  // Personen der Abteilung: Heimabteilung hier oder Rolle Abteilungsleitung/Planung
  fastify.get('/api/departments/current/people', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const tenant = await requireDeptAdmin(request, reply);
    if (!tenant) return;
    reply.header('Cache-Control', 'no-store');
    const users = await fastify.prisma.user.findMany({
      where: {
        OR: [
          { homeDepartmentId: tenant.id },
          { memberships: { some: { departmentId: tenant.id, role: { in: ['ADMIN', 'PLANNER'] } } } },
        ],
      },
      select: {
        id: true,
        ceviName: true,
        firstName: true,
        lastName: true,
        ceviDbDepartmentLeader: true,
        homeDepartmentId: true,
        homeDepartmentSource: true,
        passwordHash: true,
        ceviDbId: true,
        memberships: { where: { departmentId: tenant.id }, select: { role: true } },
        stufen: {
          where: { stufe: { departmentId: tenant.id } },
          select: { stufeId: true, role: true, source: true, stufe: { select: { name: true, sortOrder: true } } },
        },
      },
      orderBy: [{ ceviName: 'asc' }, { firstName: 'asc' }],
    });
    const role = (r: string | undefined) => (r === 'ADMIN' || r === 'PLANNER' || r === 'HELPER' ? r : null);
    return users.map((u): DepartmentPersonDto => {
      const isHome = u.homeDepartmentId === tenant.id;
      return {
        userId: u.id,
        displayName: personLabel(u),
        ceviName: u.ceviName,
        firstName: u.firstName,
        lastName: u.lastName,
        isHomeDepartment: isHome,
        source: isHome ? (u.homeDepartmentSource === 'CEVIDB' ? 'CEVIDB' : 'SELF') : null,
        departmentRole: role(u.memberships[0]?.role),
        isCeviDbDepartmentLeader: u.ceviDbDepartmentLeader,
        isCeviNameProfile: isCeviNameProfile(u),
        stufen: u.stufen
          .sort((a, b) => a.stufe.sortOrder - b.stufe.sortOrder)
          .map((s) => ({
            stufeId: s.stufeId,
            name: s.stufe.name,
            role: s.role === 'LEITUNG' ? 'LEITUNG' : 'TEILNEHMER',
            source: s.source === 'CEVIDB' ? 'CEVIDB' : 'SELF',
          })),
      };
    });
  });

  // Person bearbeiten: selbst angegebene Stufen ersetzen (Cevi.DB-Stufen bleiben) und Rolle im Schichtplan
  fastify.patch<{ Params: { userId: string } }>(
    '/api/departments/current/people/:userId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await requireDeptAdmin(request, reply);
      if (!tenant) return;
      const parse = UpdateDepartmentPersonSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
      const { stufen, departmentRole } = parse.data;
      const userId = request.params.userId;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, homeDepartmentId: true, passwordHash: true, ceviDbId: true },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });

      if (departmentRole && departmentRole !== 'HELPER' && isCeviNameProfile(user)) {
        return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
      }

      if (departmentRole && userId === request.user.id && departmentRole !== 'ADMIN') {
        return reply.status(400).send({ error: 'Du kannst dir die Abteilungsleitung nicht selbst entziehen.' });
      }

      if (stufen) {
        if (user.homeDepartmentId !== tenant.id) {
          return reply.status(400).send({ error: 'Stufen gibt es nur für Personen, die zu dieser Abteilung gehören.' });
        }
        const ids = [...new Set(stufen.map((s) => s.stufeId))];
        const found = await fastify.prisma.departmentStufe.count({ where: { id: { in: ids }, departmentId: tenant.id } });
        if (found !== ids.length) return reply.status(400).send({ error: 'Eine Stufe gehört nicht zu dieser Abteilung' });
      }

      await fastify.prisma.$transaction(async (tx) => {
        if (stufen) {
          const locked = new Set(
            (
              await tx.userStufe.findMany({
                where: { userId, source: 'CEVIDB', stufe: { departmentId: tenant.id } },
                select: { stufeId: true },
              })
            ).map((s) => s.stufeId)
          );
          await tx.userStufe.deleteMany({ where: { userId, source: 'SELF', stufe: { departmentId: tenant.id } } });
          const own = stufen.filter((s) => !locked.has(s.stufeId));
          if (own.length) {
            await tx.userStufe.createMany({
              data: own.map((s) => ({ userId, stufeId: s.stufeId, role: s.role, source: 'SELF' })),
              skipDuplicates: true,
            });
          }
        }
        if (departmentRole) {
          await tx.departmentMember.upsert({
            where: { departmentId_userId: { departmentId: tenant.id, userId } },
            update: { role: departmentRole },
            create: { departmentId: tenant.id, userId, role: departmentRole },
          });
        }
      });
      return { message: 'Gespeichert' };
    }
  );

  // Selbst angegebene Zugehörigkeit entfernen (Angaben aus Cevi.DB lassen sich hier nicht ändern)
  fastify.delete<{ Params: { userId: string } }>(
    '/api/departments/current/people/:userId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await requireDeptAdmin(request, reply);
      if (!tenant) return;
      const user = await fastify.prisma.user.findFirst({
        where: { id: request.params.userId, homeDepartmentId: tenant.id },
        select: { id: true, homeDepartmentSource: true },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if (user.homeDepartmentSource === 'CEVIDB') {
        return reply
          .status(400)
          .send({ error: 'Diese Zuordnung kommt aus Cevi.DB und lässt sich hier nicht ändern.' });
      }
      await fastify.prisma.$transaction([
        fastify.prisma.userStufe.deleteMany({
          where: { userId: user.id, source: 'SELF', stufe: { departmentId: tenant.id } },
        }),
        fastify.prisma.user.update({
          where: { id: user.id },
          data: { homeDepartmentId: null, homeDepartmentSource: null, departmentSetupAt: null },
        }),
      ]);
      return { message: 'Zugehörigkeit entfernt' };
    }
  );

  // Mitglieder der aktuellen Abteilung (für OK-Auswahl, Helferliste etc.)
  fastify.get(
    '/api/departments/current/members',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
      }
      // Namen und E-Mails aller Mitglieder: nur für wer hier plant (Abteilungsleitung, Planung, OK)
      if (!(await isDepartmentManager(fastify.prisma, request.tenant.id, request.user.id))) {
        return reply.status(403).send({ error: 'Nur die Abteilungsleitung oder ein Event-OK' });
      }
      reply.header('Cache-Control', 'no-store');

      const members = await fastify.prisma.departmentMember.findMany({
        where: { departmentId: request.tenant.id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ceviName: true,
              email: true,
              passwordHash: true,
              ceviDbId: true,
            },
          },
        },
        orderBy: [
          { user: { lastName: 'asc' } },
        ],
      });

      return members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        ceviName: m.user.ceviName,
        email: m.user.email,
        // Nur Cevi-Name-Profil: kann eingeteilt, aber nicht ins OK aufgenommen werden
        isCeviNameProfile: isCeviNameProfile(m.user),
        displayName: m.user.ceviName
          ? `${m.user.ceviName} (${m.user.firstName} ${m.user.lastName})`
          : `${m.user.firstName} ${m.user.lastName}`,
      }));
    }
  );

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
        const departmentResult = await fastify.prisma.$transaction(async (tx) => {
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

          // Alle bereits angemeldeten Cevi.DB-Personen dieser Ortsgruppe (inkl. der anlegenden Person)
          // bekommen die neue Abteilung als Heimabteilung und werden Helfer*innen
          const people = await tx.user.findMany({
            where: { ceviDbOrtsgruppeId: ortsgruppeId },
            select: { id: true },
          });
          await tx.user.updateMany({
            where: { ceviDbOrtsgruppeId: ortsgruppeId },
            data: { homeDepartmentId: created.id, homeDepartmentSource: 'CEVIDB', departmentSetupAt: new Date() },
          });
          await tx.departmentMember.createMany({
            data: people.map((p) => ({ departmentId: created.id, userId: p.id, role: 'HELPER' })),
            skipDuplicates: true,
          });

          return { department: created, memberIds: people.map((p) => p.id) };
        });

        for (const memberId of departmentResult.memberIds) {
          await autoCreateCeviDbDepartmentStufen(fastify.prisma, departmentResult.department.id, memberId);
        }

        request.log.info(
          { userId: request.user.id, departmentId: departmentResult.department.id, slug, ortsgruppeId },
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

  // Abteilungs-Einstellungen aktualisieren (Logo, Name, Kontakt) - nur Abteilungsleitung
  fastify.patch(
    '/api/departments/current',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const tenant = await requireDeptAdmin(request, reply);
      if (!tenant) return;

      const parse = UpdateDepartmentSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }

      const updated = await fastify.prisma.department.update({
        where: { id: tenant.id },
        data: {
          name: parse.data.name !== undefined ? parse.data.name : undefined,
          logoUrl: parse.data.logoUrl !== undefined ? parse.data.logoUrl : undefined,
          primaryColor: parse.data.primaryColor !== undefined ? parse.data.primaryColor : undefined,
          contactEmail: parse.data.contactEmail !== undefined ? parse.data.contactEmail : undefined,
          membersOnly: parse.data.membersOnly,
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
