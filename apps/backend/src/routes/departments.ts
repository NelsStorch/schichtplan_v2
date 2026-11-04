import { z } from 'zod';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, PrismaClient } from '../db.js';
import {
  CreateDepartmentFromCeviDbSchema,
  DEPARTMENT_PERMISSIONS,
  normalizePermissions,
  StufeInputSchema,
  UpdateDepartmentPersonSchema,
  UpdateDepartmentSchema,
  type DepartmentCreationEligibilityDto,
  type DepartmentDirectoryItemDto,
  type DepartmentPersonDto,
  type DepartmentDto,
  type DepartmentPermission,
  type DepartmentStufeDto,
} from '@schichtplan/shared';
import { autoCreateAllCeviDbDepartmentStufen, autoCreateCeviDbDepartmentStufen, backfillCeviDbStufen, ceviDbGroupPeople, departmentOrtsgruppeId, NO_HOME_CONFIRMATION } from '../services/homeDepartment.js';
import { personLabel } from '../services/profile.js';
import { UNRELATED_PERSON_ERROR, isDepartmentInsider, isDepartmentManager } from '../services/departmentVisibility.js';
import { canGrantPermissions, departmentAccess, type DepartmentAccess } from '../services/permissions.js';
import { recordDepartmentAction, toDepartmentAuditDto } from '../services/departmentAudit.js';
import { usableEmail } from './eventMessages.js';
import { CEVINAME_ROLE_ERROR, isCeviNameProfile } from '../services/ceviNameLogin.js';
import { computeDepartmentStats } from '../services/departmentStats.js';

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

/** Kontaktperson: Abteilungsleitung oder jemand mit «Personen und Rechte verwalten» */
export const contactCandidateWhere = (departmentId: string) => ({
  departmentId,
  OR: [{ role: 'ADMIN' }, { permissions: { has: 'PEOPLE_MANAGE' } }],
});

/** Name der Kontaktperson für alle, die E-Mail nur für Angemeldete (Schutz vor Scrapern) */
async function loadContactPerson(
  prisma: PrismaClient,
  contactUserId: string | null,
  loggedIn: boolean
): Promise<DepartmentDto['contactPerson']> {
  if (!contactUserId) return null;
  const user = await prisma.user.findUnique({
    where: { id: contactUserId },
    select: { ceviName: true, firstName: true, lastName: true, email: true, emailVerified: true },
  });
  if (!user) return null;
  return { displayName: personLabel(user), email: loggedIn ? usableEmail(user) : null };
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const NOT_ELIGIBLE_MESSAGES = {
  NOT_CEVIDB: 'Um eine Abteilung anzulegen, melde dich bitte mit Cevi.DB an.',
  NOT_LEADER:
    'Einen neuen Schichtplan für eine Abteilung kann nur die Abteilungsleitung anlegen. Bitte wende dich an deine Abteilungsleitung: Sie kann den Schichtplan für eure Abteilung anlegen und dir danach unter «Personen» das Recht «Anlässe erstellen» geben – oder sie erstellt den Anlass direkt für dich.',
  NO_ORTSGRUPPE: 'In Cevi.DB ist für dich keine Ortsgruppe hinterlegt.',
  EXISTS: 'Für deine Abteilung gibt es bereits einen Schichtplan.',
  UNVERIFIED: 'Wir konnten deine Gruppe in Cevi.DB gerade nicht prüfen. Melde dich bitte nochmals mit Cevi.DB an.',
} as const;

/**
 * Darf die Person für ihre Gruppe eine Abteilung anlegen? Es zählt die Gruppe der Leitungsrolle, nicht das selbst
 * änderbare Feld `ortsgruppe_id`. Die Abteilung hängt an der Ortsgruppe, bei mehreren Jungscharen an der Jungschar.
 */
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

  // Die ceviDb*-Spalten schreibt nur der Cevi.DB-Login
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ceviDbId: true,
      ceviDbDepartmentLeader: true,
      ceviDbLeaderGroupIds: true,
      ceviDbLeaderGroupName: true,
    },
  });
  if (!user || user.ceviDbId === null) return denied('NOT_CEVIDB');

  const leaderGroupName = user.ceviDbLeaderGroupName;
  if (!user.ceviDbDepartmentLeader) return denied('NOT_LEADER');

  const leaderGroups = await prisma.ceviDbGroup.findMany({ where: { id: { in: user.ceviDbLeaderGroupIds } } });
  if (leaderGroups.length === 0 || leaderGroups.length < user.ceviDbLeaderGroupIds.length) {
    return denied('UNVERIFIED', { leaderGroupName });
  }

  let firstExisting: DepartmentCreationEligibilityDto | null = null;
  for (const group of leaderGroups) {
    if (group.ortsgruppeId === null) continue;
    const ortsgruppe = await prisma.ceviDbGroup.findUnique({ where: { id: group.ortsgruppeId } });
    if (!ortsgruppe || ortsgruppe.jungscharCount === null) return denied('UNVERIFIED', { leaderGroupName });

    const perJungschar = ortsgruppe.jungscharCount > 1 && group.jungscharId !== null;
    const groupId = perJungschar ? group.jungscharId! : ortsgruppe.id;
    // Vorschlag für den Namen: «JS Effretikon» wird zu «Effretikon» (dazu kommt «Cevi»)
    const name = perJungschar ? group.name.replace(/^JS\s+/i, '') : ortsgruppe.name;

    const existing = await prisma.department.findUnique({
      where: { ceviDbGroupId: groupId },
      select: { name: true, slug: true },
    });
    if (!existing) {
      return { eligible: true, reason: null, ortsgruppeId: groupId, ortsgruppeName: name, leaderGroupName, existingDepartment: null };
    }
    firstExisting ??= denied('EXISTS', { ortsgruppeId: groupId, ortsgruppeName: name, leaderGroupName, existingDepartment: existing });
  }

  return firstExisting ?? denied('NO_ORTSGRUPPE', { leaderGroupName });
}

const departmentRoutes: FastifyPluginAsync = async (fastify) => {
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

  /** Recht in der Abteilung der Subdomain prüfen (Abteilungsleitung und globale Admins haben alle) */
  async function requirePermission(request: FastifyRequest, reply: FastifyReply, permission: DepartmentPermission) {
    if (!request.tenant) {
      reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      return null;
    }
    const access = await departmentAccess(fastify.prisma, request.tenant.id, request.user.id);
    if (!access.permissions.has(permission)) {
      reply.status(403).send({ error: `Dafür braucht es das Recht «${DEPARTMENT_PERMISSIONS[permission].label}».` });
      return null;
    }
    return { tenant: request.tenant, access };
  }

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
    await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, request.tenant.id);
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

  /**
   * Darf `actor` diese Person bearbeiten (Stufen, Rechte, entfernen)? Abteilungsleitung und globale Admins
   * alle; sonst nur mit «Personen und Rechte verwalten» und nur Personen ohne Abteilungsleitung, nicht sich selbst
   * und nur mit weniger Rechten als man selbst.
   */
  function canEditPerson(
    actor: DepartmentAccess,
    actorId: string,
    target: { userId: string; role: string | null; permissions: string[] }
  ) {
    if (!actor.permissions.has('PEOPLE_MANAGE')) return false;
    if (actor.hasFullAccess) return true;
    if (target.userId === actorId || target.role === 'ADMIN') return false;
    return canGrantPermissions(actor, target.permissions);
  }

  const homeSource = (source: string | null): 'CEVIDB' | 'CONFIRMED' | 'SELF' =>
    source === 'CEVIDB' || source === 'CONFIRMED' ? source : 'SELF';

  /**
   * Zugehörigkeit bestätigen: für Cevi.DB-Personen, die die Abteilung selbst gewählt haben, weil ihre Rollen zu keiner
   * Abteilung führen (z. B. nur im Vorstand einer Ortsgruppe mit mehreren Jungscharen). Nur die Abteilungsleitung,
   * nie für sich selbst, und nur innerhalb derselben Ortsgruppe.
   */
  function canConfirmHome(
    actor: DepartmentAccess,
    actorId: string,
    target: {
      id: string;
      ceviDbId: number | null;
      ceviDbOrtsgruppeId: number | null;
      homeDepartmentId: string | null;
      homeDepartmentSource: string | null;
    },
    departmentId: string,
    ortsgruppeId: number | null
  ) {
    return (
      actor.hasFullAccess &&
      target.id !== actorId &&
      target.ceviDbId !== null &&
      target.homeDepartmentId === departmentId &&
      target.homeDepartmentSource === 'SELF' &&
      ortsgruppeId !== null &&
      target.ceviDbOrtsgruppeId === ortsgruppeId
    );
  }

  // Personen der Abteilung: Heimabteilung hier, Abteilungsleitung oder Rechte. Mit ?alle=1 auch Gäste
  // (über die Subdomain angemeldet, ohne Heimabteilung und ohne Rechte), damit man ihnen Rechte geben kann.
  fastify.get<{ Querystring: { alle?: string } }>(
    '/api/departments/current/people',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Personen und Mitglieder der Abteilung abrufen',
        description: 'Liefert Abteilungsmitglieder mit Rollen, Rechten und Stufen (Recht «Personen anzeigen» erforderlich).',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          alle: z.string().optional().describe('1 = auch Gäste ohne Rechte anzeigen'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'PEOPLE_VIEW');
      if (!ctx) return;
      const { tenant, access } = ctx;
      reply.header('Cache-Control', 'no-store');
      const withGuests = request.query.alle === '1';
      const ortsgruppeId = await departmentOrtsgruppeId(fastify.prisma, tenant.ceviDbGroupId);
      const users = await fastify.prisma.user.findMany({
        where: {
          OR: [
            { homeDepartmentId: tenant.id },
            {
              memberships: {
                some: withGuests
                  ? { departmentId: tenant.id }
                  : { departmentId: tenant.id, OR: [{ role: 'ADMIN' }, { NOT: { permissions: { isEmpty: true } } }] },
              },
            },
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
          ceviDbOrtsgruppeId: true,
          homeDepartmentConfirmedAt: true,
          email: true,
          phone: true,
          homeDepartmentConfirmedBy: { select: { ceviName: true, firstName: true, lastName: true } },
          memberships: {
            where: { departmentId: tenant.id },
            select: { role: true, permissions: true, leaderSource: true },
          },
          stufen: {
            where: { stufe: { departmentId: tenant.id } },
            select: { stufeId: true, role: true, source: true, stufe: { select: { name: true, sortOrder: true } } },
          },
        },
        orderBy: [{ ceviName: 'asc' }, { firstName: 'asc' }],
      });
      return users.map((u): DepartmentPersonDto => {
        const isHome = u.homeDepartmentId === tenant.id;
        const membership = u.memberships[0] ?? null;
        const role = membership ? (membership.role === 'ADMIN' ? 'ADMIN' : 'HELPER') : null;
        const permissions = role === 'ADMIN' ? [] : normalizePermissions(membership?.permissions ?? []);
        return {
          userId: u.id,
          displayName: personLabel(u),
          ceviName: u.ceviName,
          firstName: u.firstName,
          lastName: u.lastName,
          isHomeDepartment: isHome,
          source: isHome ? homeSource(u.homeDepartmentSource) : null,
          canConfirmHome: canConfirmHome(access, request.user.id, u, tenant.id, ortsgruppeId),
          email: u.email,
          phone: u.phone,
          confirmedAt: isHome ? (u.homeDepartmentConfirmedAt?.toISOString() ?? null) : null,
          confirmedBy: isHome && u.homeDepartmentConfirmedBy ? personLabel(u.homeDepartmentConfirmedBy) : null,
          departmentRole: role,
          permissions,
          leaderSource:
            role === 'ADMIN' ? (membership?.leaderSource === 'CEVIDB' ? 'CEVIDB' : 'MANUAL') : null,
          canEdit: canEditPerson(access, request.user.id, { userId: u.id, role, permissions }),
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
    }
  );

  // Person bearbeiten: selbst angegebene Stufen ersetzen (Cevi.DB-Stufen bleiben) und Rechte setzen.
  // Die Abteilungsleitung selbst ändert sich hier nie (nur über Cevi.DB oder das Admin-Portal).
  fastify.patch<{ Params: { userId: string } }>(
    '/api/departments/current/people/:userId',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Rollen, Rechte und Stufen einer Person bearbeiten',
        description: 'Aktualisiert die Abteilungsrechte oder Stufenzuweisungen einer Person.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid().describe('ID der Person'),
        }),
        body: UpdateDepartmentPersonSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'PEOPLE_MANAGE');
      if (!ctx) return;
      const { tenant, access } = ctx;
      const parse = UpdateDepartmentPersonSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
      const { stufen } = parse.data;
      const userId = request.params.userId;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          homeDepartmentId: true,
          passwordHash: true,
          ceviDbId: true,
          ceviName: true,
          firstName: true,
          lastName: true,
          memberships: { where: { departmentId: tenant.id }, select: { role: true, permissions: true } },
          stufen: {
            where: { stufe: { departmentId: tenant.id } },
            select: { stufeId: true, role: true, source: true, stufe: { select: { name: true } } },
          },
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      const membership = user.memberships[0] ?? null;
      if (user.homeDepartmentId !== tenant.id && !membership) {
        return reply.status(400).send({ error: UNRELATED_PERSON_ERROR });
      }
      const currentPermissions = membership?.role === 'ADMIN' ? [] : normalizePermissions(membership?.permissions ?? []);
      const target = { userId, role: membership?.role ?? null, permissions: currentPermissions };
      if (!canEditPerson(access, request.user.id, target)) {
        return reply.status(403).send({
          error:
            userId === request.user.id
              ? 'Deine eigenen Rechte kann nur die Abteilungsleitung ändern.'
              : 'Diese Person hat gleich viele oder mehr Rechte als du. Das kann nur die Abteilungsleitung ändern.',
        });
      }

      const nextPermissions = parse.data.permissions ? normalizePermissions(parse.data.permissions) : null;
      if (nextPermissions) {
        if (membership?.role === 'ADMIN') {
          return reply.status(400).send({
            error: 'Die Abteilungsleitung hat alle Rechte. Sie ändert sich nur über Cevi.DB oder das Admin-Portal.',
          });
        }
        if (nextPermissions.length > 0 && isCeviNameProfile(user)) {
          return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
        }
        if (!canGrantPermissions(access, currentPermissions, nextPermissions)) {
          return reply.status(403).send({ error: 'Du kannst nur weniger Rechte vergeben, als du selbst hast.' });
        }
      }

      if (stufen) {
        if (user.homeDepartmentId !== tenant.id) {
          return reply.status(400).send({ error: 'Stufen gibt es nur für Personen, die zu dieser Abteilung gehören.' });
        }
        const ids = [...new Set(stufen.map((s) => s.stufeId))];
        const found = await fastify.prisma.departmentStufe.count({ where: { id: { in: ids }, departmentId: tenant.id } });
        if (found !== ids.length) return reply.status(400).send({ error: 'Eine Stufe gehört nicht zu dieser Abteilung' });
      }

      const stufenBefore = user.stufen.filter((s) => s.source === 'SELF');
      await fastify.prisma.$transaction(async (tx) => {
        if (stufen) {
          const locked = new Set(user.stufen.filter((s) => s.source === 'CEVIDB').map((s) => s.stufeId));
          await tx.userStufe.deleteMany({ where: { userId, source: 'SELF', stufe: { departmentId: tenant.id } } });
          const own = stufen.filter((s) => !locked.has(s.stufeId));
          if (own.length) {
            await tx.userStufe.createMany({
              data: own.map((s) => ({ userId, stufeId: s.stufeId, role: s.role, source: 'SELF' })),
              skipDuplicates: true,
            });
          }
        }
        if (nextPermissions) {
          await tx.departmentMember.upsert({
            where: { departmentId_userId: { departmentId: tenant.id, userId } },
            update: { permissions: nextPermissions },
            create: { departmentId: tenant.id, userId, role: 'HELPER', permissions: nextPermissions },
          });
        }
      });

      const label = personLabel(user);
      if (nextPermissions && nextPermissions.join() !== currentPermissions.join()) {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId: tenant.id,
          actorId: request.user.id,
          action: 'PERMISSIONS_SET',
          targetUserId: userId,
          targetLabel: label,
          details: { before: currentPermissions, after: nextPermissions },
        });
      }
      if (stufen) {
        const names = await fastify.prisma.departmentStufe.findMany({
          where: { id: { in: stufen.map((s) => s.stufeId) } },
          select: { id: true, name: true },
        });
        const nameOf = new Map(names.map((n) => [n.id, n.name]));
        const before = stufenBefore.map((s) => `${s.stufe.name} (${s.role})`).sort();
        const after = stufen
          .filter((s) => !user.stufen.some((u) => u.source === 'CEVIDB' && u.stufeId === s.stufeId))
          .map((s) => `${nameOf.get(s.stufeId) ?? s.stufeId} (${s.role})`)
          .sort();
        if (before.join() !== after.join()) {
          await recordDepartmentAction(fastify.prisma, request.log, {
            departmentId: tenant.id,
            actorId: request.user.id,
            action: 'STUFEN_SET',
            targetUserId: userId,
            targetLabel: label,
            details: { before, after },
          });
        }
      }
      return { message: 'Gespeichert' };
    }
  );

  // Zugehörigkeit bestätigen (siehe canConfirmHome): Die Person zählt danach bei Cevi.DB-Anlässen
  fastify.post<{ Params: { userId: string } }>(
    '/api/departments/current/people/:userId/confirm',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Zugehörigkeit zur Abteilung bestätigen',
        description: 'Bestätigt die Heimabteilungs-Zugehörigkeit eines Cevi.DB-Mitglieds durch die Abteilungsleitung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid().describe('ID der Person'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'PEOPLE_MANAGE');
      if (!ctx) return;
      const { tenant, access } = ctx;
      if (!access.hasFullAccess) {
        return reply.status(403).send({ error: 'Bestätigen kann nur die Abteilungsleitung.' });
      }
      const user = await fastify.prisma.user.findFirst({
        where: { id: request.params.userId, homeDepartmentId: tenant.id },
        select: {
          id: true,
          ceviDbId: true,
          ceviDbOrtsgruppeId: true,
          homeDepartmentId: true,
          homeDepartmentSource: true,
          ceviName: true,
          firstName: true,
          lastName: true,
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      const ortsgruppeId = await departmentOrtsgruppeId(fastify.prisma, tenant.ceviDbGroupId);
      if (!canConfirmHome(access, request.user.id, user, tenant.id, ortsgruppeId)) {
        return reply
          .status(400)
          .send({ error: 'Bestätigen geht nur für andere Personen mit Cevi.DB-Konto aus eurer Ortsgruppe, die die Abteilung selbst gewählt haben.' });
      }
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: {
          homeDepartmentSource: 'CONFIRMED',
          homeDepartmentConfirmedAt: new Date(),
          homeDepartmentConfirmedById: request.user.id,
        },
      });
      await recordDepartmentAction(fastify.prisma, request.log, {
        departmentId: tenant.id,
        actorId: request.user.id,
        action: 'MEMBER_CONFIRM',
        targetUserId: user.id,
        targetLabel: personLabel(user),
      });
      return { message: 'Zugehörigkeit bestätigt' };
    }
  );

  fastify.delete<{ Params: { userId: string } }>(
    '/api/departments/current/people/:userId/confirm',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Bestätigung der Zugehörigkeit aufheben',
        description: 'Hebt die Bestätigung der Heimabteilung wieder auf.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid().describe('ID der Person'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'PEOPLE_MANAGE');
      if (!ctx) return;
      const { tenant, access } = ctx;
      if (!access.hasFullAccess) {
        return reply.status(403).send({ error: 'Bestätigen kann nur die Abteilungsleitung.' });
      }
      const user = await fastify.prisma.user.findFirst({
        where: { id: request.params.userId, homeDepartmentId: tenant.id, homeDepartmentSource: 'CONFIRMED' },
        select: { id: true, ceviName: true, firstName: true, lastName: true },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { homeDepartmentSource: 'SELF', ...NO_HOME_CONFIRMATION },
      });
      await recordDepartmentAction(fastify.prisma, request.log, {
        departmentId: tenant.id,
        actorId: request.user.id,
        action: 'MEMBER_UNCONFIRM',
        targetUserId: user.id,
        targetLabel: personLabel(user),
      });
      return { message: 'Bestätigung aufgehoben' };
    }
  );

  // Selbst angegebene Zugehörigkeit entfernen (Angaben aus Cevi.DB lassen sich hier nicht ändern).
  // Rechte in der Abteilung fallen dabei weg.
  fastify.delete<{ Params: { userId: string } }>(
    '/api/departments/current/people/:userId',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Person aus Abteilung entfernen',
        description: 'Entfernt die selbst angegebene Zugehörigkeit und entzieht alle Abteilungsrechte.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          userId: z.string().uuid().describe('ID der Person'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'PEOPLE_MANAGE');
      if (!ctx) return;
      const { tenant, access } = ctx;
      const user = await fastify.prisma.user.findFirst({
        where: { id: request.params.userId, homeDepartmentId: tenant.id },
        select: {
          id: true,
          homeDepartmentSource: true,
          ceviName: true,
          firstName: true,
          lastName: true,
          memberships: { where: { departmentId: tenant.id }, select: { role: true, permissions: true } },
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      const membership = user.memberships[0] ?? null;
      const permissions = normalizePermissions(membership?.permissions ?? []);
      if (!canEditPerson(access, request.user.id, { userId: user.id, role: membership?.role ?? null, permissions })) {
        return reply.status(403).send({ error: 'Diese Person kann nur die Abteilungsleitung entfernen.' });
      }
      if (membership?.role === 'ADMIN') {
        return reply.status(400).send({ error: 'Die Abteilungsleitung lässt sich hier nicht entfernen.' });
      }
      if (user.homeDepartmentSource === 'CEVIDB') {
        return reply
          .status(400)
          .send({ error: 'Diese Zuordnung kommt aus Cevi.DB und lässt sich hier nicht ändern.' });
      }
      await fastify.prisma.$transaction([
        fastify.prisma.userStufe.deleteMany({
          where: { userId: user.id, source: 'SELF', stufe: { departmentId: tenant.id } },
        }),
        fastify.prisma.departmentMember.updateMany({
          where: { departmentId: tenant.id, userId: user.id },
          data: { permissions: [] },
        }),
        fastify.prisma.user.update({
          where: { id: user.id },
          data: { homeDepartmentId: null, homeDepartmentSource: null, ...NO_HOME_CONFIRMATION, departmentSetupAt: null },
        }),
      ]);
      await recordDepartmentAction(fastify.prisma, request.log, {
        departmentId: tenant.id,
        actorId: request.user.id,
        action: 'MEMBER_REMOVE',
        targetUserId: user.id,
        targetLabel: personLabel(user),
        details: { permissionsBefore: permissions },
      });
      return { message: 'Zugehörigkeit entfernt' };
    }
  );

  // Protokoll der Abteilung (Rechte, Abteilungsleitung, Stufen, Zugehörigkeit)
  fastify.get<{ Querystring: { page?: string } }>(
    '/api/departments/current/audit',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Audit-Log der Abteilung abrufen',
        description: 'Protokoll aller Änderungen an Mitgliedern, Rechten, Leitungsrollen und Stufen.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          page: z.string().optional().describe('Seitennummer für Paginierung'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'PEOPLE_MANAGE');
      if (!ctx) return;
      reply.header('Cache-Control', 'no-store');
      const page = Math.min(Math.max(Number(request.query.page) || 1, 1), 10_000);
      const pageSize = 50;
      const where = { departmentId: ctx.tenant.id };
      const [rows, total] = await Promise.all([
        fastify.prisma.departmentAuditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        fastify.prisma.departmentAuditLog.count({ where }),
      ]);
      return { items: rows.map(toDepartmentAuditDto), total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
    }
  );

  // Wer kann Kontaktperson sein? Abteilungsleitung und «Personen und Rechte verwalten»
  fastify.get(
    '/api/departments/current/contact-candidates',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Kandidaten für die Kontaktperson auflisten',
        description: 'Liefert Personen, die als offizielle Kontaktperson der Abteilung hinterlegt werden können.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'DEPARTMENT_SETTINGS');
      if (!ctx) return;
      reply.header('Cache-Control', 'no-store');
      const members = await fastify.prisma.departmentMember.findMany({
        where: contactCandidateWhere(ctx.tenant.id),
        select: { role: true, user: { select: { id: true, ceviName: true, firstName: true, lastName: true } } },
      });
      return members
        .map((m) => ({ userId: m.user.id, displayName: personLabel(m.user), isLeader: m.role === 'ADMIN' }))
        .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.displayName.localeCompare(b.displayName, 'de'));
    }
  );

  // Mitglieder der aktuellen Abteilung (für OK-Auswahl, Helferliste etc.)
  fastify.get(
    '/api/departments/current/members',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Mitgliederliste für Event-Planung abrufen',
        description: 'Liefert Mitglieder der Abteilung für OK-Auswahl und Schichteinteilung (für Event-Manager).',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
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

      const parse = UpdateDepartmentSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const { contactUserId } = parse.data;
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
          name: parse.data.name !== undefined ? parse.data.name : undefined,
          logoUrl: parse.data.logoUrl !== undefined ? parse.data.logoUrl : undefined,
          primaryColor: parse.data.primaryColor !== undefined ? parse.data.primaryColor : undefined,
          secondaryColor: parse.data.secondaryColor !== undefined ? parse.data.secondaryColor : undefined,
          qrStyle: parse.data.qrStyle !== undefined ? parse.data.qrStyle : undefined,
          qrCustomColors: parse.data.qrCustomColors !== undefined ? parse.data.qrCustomColors : undefined,
          qrColorPrimary: parse.data.qrColorPrimary !== undefined ? parse.data.qrColorPrimary : undefined,
          qrColorSecondary: parse.data.qrColorSecondary !== undefined ? parse.data.qrColorSecondary : undefined,
          contactUserId,
          membersOnly: parse.data.membersOnly,
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

export default departmentRoutes;
