import { FastifyPluginAsync } from 'fastify';
import { Prisma, } from '../../db.js';
import { z } from 'zod';
import {
  ConfirmDeleteSchema,
  AdminCreateDepartmentSchema,
  AdminSetMemberRoleSchema,
  AdminUpdateDepartmentSchema,
  type AdminDepartmentDetailDto,
  normalizePermissions,
  getVocabulary,
} from '@schichtplan/shared';
import { autoCreateAllCeviDbDepartmentStufen, NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { CEVINAME_ROLE_ERROR, isCeviNameProfile } from '../../services/nicknameLogin.js';
import { personLabel } from '../../services/profile.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { recordDepartmentAction, toDepartmentAuditDto } from '../../services/departmentAudit.js';
import { contactCandidateWhere } from '../departments.js';
import { loginMethods, } from '../admin.js';
import { departmentCache } from '../../services/departmentCache.js';
import { isUniqueViolation, uniqueConflictMessage, eventSelect, toEventItems, departmentSelect, toDepartmentItems, attachCeviDbGroup } from './shared.js';

/** Abteilungen und Rollen darin (nur globale Admins, siehe guard) */
const adminDepartmentRoutes: FastifyPluginAsync = async (fastify) => {
  const guard = { preHandler: [fastify.requireGlobalAdmin] };

  // ---------------------------------------------------------------------------
  // Abteilungen
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/departments',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Alle Abteilungen verwalten (Admin)',
        description: 'Liefert alle registrierten Abteilungen mit Leitungs- und Statusinformationen.',
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
    const rows = await fastify.prisma.department.findMany({ orderBy: { name: 'asc' }, select: departmentSelect });
    return { items: await toDepartmentItems(fastify.prisma, rows) };
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/admin/departments/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilungsdetails abrufen (Admin)',
        description: 'Detaillierte Übersicht über Mitglieder, Stufen, Anlässe und Cevi.DB-Gruppe einer Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
        }),
      },
    },
    async (request, reply) => {
    // Vom Routen-Schema als UUID geprüft
    const departmentId = request.params.id;

    const row = await fastify.prisma.department.findUnique({ where: { id: departmentId }, select: departmentSelect });
    if (!row) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });

    const personSelect = {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      isGlobalAdmin: true,
      providerId: true,
      passwordHash: true,
      homeDepartmentId: true,
      homeDepartmentSource: true,
    } satisfies Prisma.UserSelect;

    await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, departmentId);

    const [[item], members, homeUsers, stufen, eventRows, auditRows] = await Promise.all([
      toDepartmentItems(fastify.prisma, [row]),
      fastify.prisma.departmentMember.findMany({
        where: { departmentId },
        select: { role: true, permissions: true, leaderSource: true, user: { select: personSelect } },
      }),
      fastify.prisma.user.findMany({ where: { homeDepartmentId: departmentId }, select: personSelect }),
      fastify.prisma.departmentStufe.findMany({
        where: { departmentId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, hitobitoGroupId: true, _count: { select: { members: true } } },
      }),
      fastify.prisma.event.findMany({
        where: { departmentId },
        orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
        select: eventSelect,
      }),
      fastify.prisma.departmentAuditLog.findMany({
        where: { departmentId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
    ]);

    // Rollen und Heimabteilung zu einer Liste zusammenführen
    type PersonRow = (typeof homeUsers)[number];
    type Membership = { role: string; permissions: string[]; leaderSource: string | null };
    const people = new Map<string, { user: PersonRow; membership: Membership | null }>();
    for (const u of homeUsers) people.set(u.id, { user: u, membership: null });
    for (const m of members) people.set(m.user.id, { user: m.user, membership: m });

    // Abteilungsleitung zuerst, dann wer Rechte hat, dann alle anderen
    const rank = (m: Membership | null) => (m?.role === 'ADMIN' ? 0 : m && m.permissions.length > 0 ? 1 : 2);
    const detail: AdminDepartmentDetailDto = {
      ...item,
      people: [...people.values()]
        .sort(
          (a, b) =>
            rank(a.membership) - rank(b.membership) ||
            `${a.user.lastName} ${a.user.firstName}`.localeCompare(`${b.user.lastName} ${b.user.firstName}`, 'de')
        )
        .map(({ user, membership }) => ({
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          nickname: user.nickname,
          ceviName: user.nickname,
          email: user.email,
          isGlobalAdmin: user.isGlobalAdmin,
          loginMethods: loginMethods(user),
          role: membership?.role ?? null,
          permissions: membership && membership.role !== 'ADMIN' ? normalizePermissions(membership.permissions) : [],
          leaderSource: membership?.role === 'ADMIN' ? (membership.leaderSource ?? 'MANUAL') : null,
          isHome: user.homeDepartmentId === departmentId,
          homeSource: user.homeDepartmentId === departmentId ? user.homeDepartmentSource : null,
        })),
      stufen: stufen.map((s) => ({
        id: s.id,
        name: s.name,
        hitobitoGroupId: s.hitobitoGroupId,
        ceviDbGroupId: s.hitobitoGroupId,
        memberCount: s._count.members,
      })),
      events: await toEventItems(fastify.prisma, eventRows),
      audit: auditRows.map(toDepartmentAuditDto),
    };

    request.log.info({ adminId: request.user.id, departmentId }, 'Admin: Abteilung abgerufen');
    return detail;
  });

  fastify.post(
    '/api/admin/departments',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilung manuell erstellen (Admin)',
        description: 'Erstellt eine neue Abteilung ohne Cevi.DB-Prüfung und weist optional eine erste Abteilungsleitung zu.',
        security: [{ bearerAuth: [] }],
        body: AdminCreateDepartmentSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof AdminCreateDepartmentSchema>;
    const { name, slug, membersOnly, leaderUserId } = input;
    const hitobitoGroupId = input.ceviDbGroupId ?? input.hitobitoGroupId;
    const organization = input.organization ?? 'CEVI';
    if (organization === 'OTHER' && hitobitoGroupId) {
      return reply.status(400).send({ error: 'Ein Verein hat keine Hitobito-Gruppe.' });
    }

    if (hitobitoGroupId) {
      const existingWithGroup = await fastify.prisma.department.findUnique({
        where: { organization_hitobitoGroupId: { organization, hitobitoGroupId } },
        select: { id: true, name: true, slug: true },
      });
      if (existingWithGroup) {
        const vocab = getVocabulary(organization);
        return reply.status(409).send({
          error: `Für diese ${vocab.authProvider}-Gruppe existiert bereits die ${vocab.department} «${existingWithGroup.name}» (${existingWithGroup.slug}).`,
        });
      }
    }

    if (leaderUserId) {
      const leader = await fastify.prisma.user.findUnique({
        where: { id: leaderUserId },
        select: { passwordHash: true, providerId: true },
      });
      if (!leader) return reply.status(400).send({ error: 'Die gewählte Abteilungsleitung gibt es nicht.' });
      if (isCeviNameProfile(leader)) return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
    }

    let created: { id: string; name: string; slug: string };
    try {
      created = await fastify.prisma.department.create({
        data: {
          name,
          slug,
          organization,
          hitobitoGroupId: hitobitoGroupId ?? null,
          // Erste Abteilungsleitung ist auch die Kontaktperson
          contactUserId: leaderUserId ?? null,
          membersOnly,
          members: leaderUserId
            ? { create: [{ userId: leaderUserId, role: 'ADMIN', leaderSource: 'MANUAL' }] }
            : undefined,
        },
        select: { id: true, name: true, slug: true },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: uniqueConflictMessage(err as Prisma.PrismaClientKnownRequestError) });
      }
      throw err;
    }

    const attached = hitobitoGroupId ? await attachCeviDbGroup(fastify.prisma, created.id, hitobitoGroupId, organization) : 0;
    departmentCache.invalidate(organization, slug);

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_CREATE',
      targetType: 'DEPARTMENT',
      targetId: created.id,
      targetLabel: `${created.name} (${created.slug})`,
      details: { hitobitoGroupId: hitobitoGroupId ?? null, leaderUserId: leaderUserId ?? null, attached },
    });
    return reply.status(201).send({ department: created, attached });
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/departments/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilung bearbeiten (Admin)',
        description: 'Aktualisiert Stammdaten, Subdomain, Cevi.DB-Gruppe oder Sichtbarkeit einer Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
        }),
        body: AdminUpdateDepartmentSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof AdminUpdateDepartmentSchema>;
    const data = input;
    let targetHitobitoGroupId: number | null | undefined =
      data.ceviDbGroupId !== undefined ? data.ceviDbGroupId : data.hitobitoGroupId;

    const existing = await fastify.prisma.department.findUnique({
      where: { id: request.params.id },
      select: { id: true, name: true, slug: true, organization: true, hitobitoGroupId: true, membersOnly: true },
    }).catch(() => null);
    if (!existing) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });

    // Verband nach der Änderung: Gruppen-IDs gelten nur innerhalb ihrer Hitobito-Instanz
    const targetOrganization = data.organization ?? existing.organization;
    const organizationChanged = targetOrganization !== existing.organization;
    if (targetOrganization === 'OTHER') {
      if (targetHitobitoGroupId) {
        return reply.status(400).send({ error: 'Ein Verein hat keine Hitobito-Gruppe.' });
      }
      if (existing.hitobitoGroupId !== null) targetHitobitoGroupId = null;
    } else if (organizationChanged && targetHitobitoGroupId === undefined) {
      // Die alte Gruppe gehört zum bisherigen Verband und passt nicht mehr
      targetHitobitoGroupId = null;
    }

    if (data.contactUserId) {
      const candidate = await fastify.prisma.departmentMember.findFirst({
        where: { ...contactCandidateWhere(existing.id), userId: data.contactUserId },
        select: { id: true },
      });
      if (!candidate) {
        return reply.status(400).send({
          error: 'Kontaktperson kann nur die Abteilungsleitung oder jemand mit «Personen und Rechte verwalten» sein.',
        });
      }
    }

    // Vor dem Speichern prüfen (danach fände sich die Abteilung selbst) und nur bei anderen Abteilungen
    if (targetHitobitoGroupId && (organizationChanged || targetHitobitoGroupId !== existing.hitobitoGroupId)) {
      const existingWithGroup = await fastify.prisma.department.findUnique({
        where: {
          organization_hitobitoGroupId: {
            organization: targetOrganization,
            hitobitoGroupId: targetHitobitoGroupId,
          },
        },
        select: { id: true, name: true, slug: true },
      });
      if (existingWithGroup && existingWithGroup.id !== existing.id) {
        const vocab = getVocabulary(targetOrganization);
        return reply.status(409).send({
          error: `Für diese ${vocab.authProvider}-Gruppe existiert bereits die ${vocab.department} «${existingWithGroup.name}» (${existingWithGroup.slug}).`,
        });
      }
    }

    try {
      await fastify.prisma.$transaction(async (tx) => {
      await tx.department.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          slug: data.slug,
          logoUrl: data.logoUrl !== undefined ? data.logoUrl || null : undefined,
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor !== undefined ? data.secondaryColor : undefined,
          qrStyle: data.qrStyle !== undefined ? data.qrStyle : undefined,
          qrCustomColors: data.qrCustomColors !== undefined ? data.qrCustomColors : undefined,
          qrColorPrimary: data.qrColorPrimary !== undefined ? data.qrColorPrimary : undefined,
          qrColorSecondary: data.qrColorSecondary !== undefined ? data.qrColorSecondary : undefined,
          contactUserId: data.contactUserId,
          organization: organizationChanged ? targetOrganization : undefined,
          membersOnly: data.membersOnly,
          hitobitoGroupId: targetHitobitoGroupId,
        },
      });
      if (organizationChanged) {
        // Verknüpfungen zum bisherigen Hitobito lösen: Stufen-Gruppen, automatische Leitungen und Heimabteilungen.
        // Leitungen bleiben erhalten (jetzt MANUAL), damit die Abteilung nicht ohne Leitung dasteht.
        await tx.departmentStufe.updateMany({
          where: { departmentId: existing.id },
          data: { hitobitoGroupId: null },
        });
        await tx.departmentMember.updateMany({
          where: { departmentId: existing.id, leaderSource: 'CEVIDB' },
          data: { leaderSource: 'MANUAL' },
        });
        await tx.user.updateMany({
          where: { homeDepartmentId: existing.id, homeDepartmentSource: 'CEVIDB' },
          data: { homeDepartmentSource: 'SELF' },
        });
      }
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: uniqueConflictMessage(err as Prisma.PrismaClientKnownRequestError) });
      }
      throw err;
    }

    const newGroup = targetHitobitoGroupId;
    const attached =
      newGroup && (organizationChanged || newGroup !== existing.hitobitoGroupId)
        ? await attachCeviDbGroup(fastify.prisma, existing.id, newGroup, targetOrganization)
        : 0;

    departmentCache.invalidate(existing.organization, existing.slug);
    if (organizationChanged || (data.slug && data.slug !== existing.slug)) {
      departmentCache.invalidate(targetOrganization, data.slug ?? existing.slug);
    }

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_UPDATE',
      targetType: 'DEPARTMENT',
      targetId: existing.id,
      targetLabel: `${data.name ?? existing.name} (${data.slug ?? existing.slug})`,
      details: {
        changes: data,
        before: {
          name: existing.name,
          slug: existing.slug,
          organization: existing.organization,
          hitobitoGroupId: existing.hitobitoGroupId,
          membersOnly: existing.membersOnly,
        },
        attached,
      },
    });
    return { success: true, attached };
  });

  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/departments/:id',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilung löschen (Admin)',
        description: 'Löscht eine Abteilung samt aller Anlässe, Schichten und Zuweisungen unwiderruflich (Bestätigung des Slugs erforderlich).',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
        }),
        body: ConfirmDeleteSchema,
      },
    },
    async (request, reply) => {
    const input = request.body as z.output<typeof ConfirmDeleteSchema>;

    const department = await fastify.prisma.department.findUnique({
      where: { id: request.params.id },
      select: { id: true, slug: true, name: true, organization: true, _count: { select: { events: true, members: true } } },
    }).catch(() => null);
    if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
    if (input.confirm !== department.slug) {
      return reply.status(400).send({ error: 'Zur Bestätigung die Subdomain der Abteilung genau eintippen.' });
    }

    await fastify.prisma.$transaction([
      // Heimabteilung fällt weg: beim nächsten Login wieder nachfragen
      fastify.prisma.user.updateMany({
        where: { homeDepartmentId: department.id },
        data: { homeDepartmentId: null, homeDepartmentSource: null, ...NO_HOME_CONFIRMATION, departmentSetupAt: null },
      }),
      // Kaskadiert zu Anlässen, Schichten, Eintragungen, Rollen, Stufen, Vorlagen und Arbeiten
      fastify.prisma.department.delete({ where: { id: department.id } }),
    ]);

    departmentCache.invalidate(department.organization, department.slug);

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_DELETE',
      targetType: 'DEPARTMENT',
      targetId: department.id,
      targetLabel: `${department.name} (${department.slug})`,
      details: { events: department._count.events, members: department._count.members },
    });
    return { success: true };
  });

  // Rolle in einer Abteilung setzen (legt die Mitgliedschaft bei Bedarf an)
  fastify.put<{ Params: { id: string; userId: string } }>(
    '/api/admin/departments/:id/members/:userId',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilungsrolle oder Rechte setzen (Admin)',
        description: 'Weist einer Person die Leitungsrolle (ADMIN) oder Helferrechte (HELPER) in einer Abteilung zu.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
          userId: z.string().uuid().describe('ID der Person'),
        }),
        body: AdminSetMemberRoleSchema,
      },
    },
    async (request, reply) => {
      const input = request.body as z.output<typeof AdminSetMemberRoleSchema>;
      const { role } = input;
      const permissions = role === 'ADMIN' ? [] : normalizePermissions(input.permissions ?? []);
      const { id: departmentId, userId } = request.params;

      const [department, user] = await Promise.all([
        fastify.prisma.department
          .findUnique({ where: { id: departmentId }, select: { id: true, name: true } })
          .catch(() => null),
        fastify.prisma.user
          .findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true, providerId: true, firstName: true, lastName: true, nickname: true },
          })
          .catch(() => null),
      ]);
      if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      if ((role === 'ADMIN' || permissions.length > 0) && isCeviNameProfile(user)) {
        return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
      }

      const before = await fastify.prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
        select: { role: true, permissions: true, leaderSource: true },
      });
      if (before?.role === 'ADMIN' && role !== 'ADMIN') {
        const others = await fastify.prisma.departmentMember.count({
          where: { departmentId, role: 'ADMIN', userId: { not: userId } },
        });
        if (others === 0) {
          return reply.status(400).send({ error: 'Das ist die letzte Abteilungsleitung. Zuerst eine andere einsetzen.' });
        }
      }
      // Von Hand gesetzte Abteilungsleitung entzieht der Cevi.DB-Login nicht (MANUAL)
      const leaderSource = role === 'ADMIN' ? (before?.role === 'ADMIN' ? before.leaderSource : 'MANUAL') : null;
      await fastify.prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId, userId } },
        update: { role, permissions, leaderSource },
        create: { departmentId, userId, role, permissions, leaderSource },
      });

      await recordAdminAction(fastify.prisma, request, {
        action: 'MEMBER_ROLE_SET',
        targetType: 'USER',
        targetId: userId,
        targetLabel: personLabel(user),
        details: {
          departmentId,
          departmentName: department.name,
          role,
          permissions,
          before: before?.role ?? null,
          permissionsBefore: before?.permissions ?? [],
        },
      });
      const label = personLabel(user);
      if (role === 'ADMIN' && before?.role !== 'ADMIN') {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId,
          actorId: request.user.id,
          via: 'Admin-Portal',
          action: 'LEADER_GRANT',
          targetUserId: userId,
          targetLabel: label,
          details: { source: 'MANUAL' },
        });
      } else if (role !== 'ADMIN' && before?.role === 'ADMIN') {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId,
          actorId: request.user.id,
          via: 'Admin-Portal',
          action: 'LEADER_REVOKE',
          targetUserId: userId,
          targetLabel: label,
        });
      }
      const permissionsBefore = before?.role === 'ADMIN' ? [] : normalizePermissions(before?.permissions ?? []);
      if (role !== 'ADMIN' && permissions.join() !== permissionsBefore.join()) {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId,
          actorId: request.user.id,
          via: 'Admin-Portal',
          action: 'PERMISSIONS_SET',
          targetUserId: userId,
          targetLabel: label,
          details: { before: permissionsBefore, after: permissions },
        });
      }
      return { success: true };
    }
  );

  // Rolle entfernen (Heimabteilung bleibt, die kommt aus Cevi.DB oder von der Person selbst)
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/api/admin/departments/:id/members/:userId',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Abteilungsrolle entziehen (Admin)',
        description: 'Entzieht einer Person die Rolle und alle Sonderrechte in einer Abteilung.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string().uuid().describe('ID der Abteilung'),
          userId: z.string().uuid().describe('ID der Person'),
        }),
      },
    },
    async (request, reply) => {
      const { id: departmentId, userId } = request.params;
      const membership = await fastify.prisma.departmentMember
        .findUnique({
          where: { departmentId_userId: { departmentId, userId } },
          select: {
            role: true,
            permissions: true,
            department: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, nickname: true } },
          },
        })
        .catch(() => null);
      if (!membership) return reply.status(404).send({ error: 'Diese Person hat hier keine Rolle.' });
      if (membership.role === 'ADMIN') {
        const others = await fastify.prisma.departmentMember.count({
          where: { departmentId, role: 'ADMIN', userId: { not: userId } },
        });
        if (others === 0) {
          return reply.status(400).send({ error: 'Das ist die letzte Abteilungsleitung. Zuerst eine andere einsetzen.' });
        }
      }
      await fastify.prisma.departmentMember.deleteMany({ where: { departmentId, userId } });
      await recordDepartmentAction(fastify.prisma, request.log, {
        departmentId,
        actorId: request.user.id,
        via: 'Admin-Portal',
        action: membership.role === 'ADMIN' ? 'LEADER_REVOKE' : 'PERMISSIONS_SET',
        targetUserId: userId,
        targetLabel: personLabel(membership.user),
        details: membership.role === 'ADMIN' ? { removed: true } : { before: membership.permissions, after: [], removed: true },
      });

      await recordAdminAction(fastify.prisma, request, {
        action: 'MEMBER_ROLE_REMOVE',
        targetType: 'USER',
        targetId: userId,
        targetLabel: personLabel(membership.user),
        details: { departmentId, departmentName: membership.department.name, before: membership.role },
      });
      return { success: true };
    }
  );
};

export default adminDepartmentRoutes;
