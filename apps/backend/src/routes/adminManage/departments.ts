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
} from '@schichtplan/shared';
import { autoCreateAllCeviDbDepartmentStufen, NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { CEVINAME_ROLE_ERROR, isCeviNameProfile } from '../../services/ceviNameLogin.js';
import { personLabel } from '../../services/profile.js';
import { recordAdminAction } from '../../services/adminAudit.js';
import { recordDepartmentAction, toDepartmentAuditDto } from '../../services/departmentAudit.js';
import { contactCandidateWhere } from '../departments.js';
import { loginMethods, } from '../admin.js';
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
    const parsedId = z.string().uuid().safeParse(request.params.id);
    if (!parsedId.success) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
    const departmentId = parsedId.data;

    const row = await fastify.prisma.department.findUnique({ where: { id: departmentId }, select: departmentSelect });
    if (!row) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });

    const personSelect = {
      id: true,
      firstName: true,
      lastName: true,
      ceviName: true,
      email: true,
      isGlobalAdmin: true,
      ceviDbId: true,
      passwordHash: true,
      homeDepartmentId: true,
      homeDepartmentSource: true,
    } satisfies Prisma.UserSelect;

    await autoCreateAllCeviDbDepartmentStufen(fastify.prisma, departmentId);

    const [[item], members, homeUsers, stufen, eventRows, auditRows, templates] = await Promise.all([
      toDepartmentItems(fastify.prisma, [row]),
      fastify.prisma.departmentMember.findMany({
        where: { departmentId },
        select: { role: true, permissions: true, leaderSource: true, user: { select: personSelect } },
      }),
      fastify.prisma.user.findMany({ where: { homeDepartmentId: departmentId }, select: personSelect }),
      fastify.prisma.departmentStufe.findMany({
        where: { departmentId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, ceviDbGroupId: true, _count: { select: { members: true } } },
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
      fastify.prisma.eventTemplate.findMany({
        where: { departmentId },
        orderBy: { title: 'asc' },
        select: { id: true, title: true, description: true, data: true },
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
          ceviName: user.ceviName,
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
        ceviDbGroupId: s.ceviDbGroupId,
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
    const parse = AdminCreateDepartmentSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const { name, slug, ceviDbGroupId, membersOnly, leaderUserId } = parse.data;

    if (ceviDbGroupId) {
      const existingWithGroup = await fastify.prisma.department.findUnique({
        where: { ceviDbGroupId },
        select: { id: true, name: true, slug: true },
      });
      if (existingWithGroup) {
        return reply.status(409).send({
          error: `Für diese Cevi.DB-Gruppe existiert bereits die Abteilung «${existingWithGroup.name}» (${existingWithGroup.slug}).`,
        });
      }
    }

    if (leaderUserId) {
      const leader = await fastify.prisma.user.findUnique({
        where: { id: leaderUserId },
        select: { passwordHash: true, ceviDbId: true },
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
          ceviDbGroupId: ceviDbGroupId ?? null,
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

    const attached = ceviDbGroupId ? await attachCeviDbGroup(fastify.prisma, created.id, ceviDbGroupId) : 0;

    await recordAdminAction(fastify.prisma, request, {
      action: 'DEPARTMENT_CREATE',
      targetType: 'DEPARTMENT',
      targetId: created.id,
      targetLabel: `${created.name} (${created.slug})`,
      details: { ceviDbGroupId: ceviDbGroupId ?? null, leaderUserId: leaderUserId ?? null, attached },
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
    const parse = AdminUpdateDepartmentSchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
    const data = parse.data;

    const existing = await fastify.prisma.department.findUnique({
      where: { id: request.params.id },
      select: { id: true, name: true, slug: true, ceviDbGroupId: true, membersOnly: true },
    }).catch(() => null);
    if (!existing) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });

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
    if (data.ceviDbGroupId && data.ceviDbGroupId !== existing.ceviDbGroupId) {
      const existingWithGroup = await fastify.prisma.department.findUnique({
        where: { ceviDbGroupId: data.ceviDbGroupId },
        select: { id: true, name: true, slug: true },
      });
      if (existingWithGroup && existingWithGroup.id !== existing.id) {
        return reply.status(409).send({
          error: `Für diese Cevi.DB-Gruppe existiert bereits die Abteilung «${existingWithGroup.name}» (${existingWithGroup.slug}).`,
        });
      }
    }

    try {
      await fastify.prisma.department.update({
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
          membersOnly: data.membersOnly,
          ceviDbGroupId: data.ceviDbGroupId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return reply.status(409).send({ error: uniqueConflictMessage(err as Prisma.PrismaClientKnownRequestError) });
      }
      throw err;
    }

    const newGroup = data.ceviDbGroupId;
    const attached =
      newGroup && newGroup !== existing.ceviDbGroupId ? await attachCeviDbGroup(fastify.prisma, existing.id, newGroup) : 0;

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
          ceviDbGroupId: existing.ceviDbGroupId,
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
    const parse = ConfirmDeleteSchema.safeParse(request.body ?? {});
    if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });

    const department = await fastify.prisma.department.findUnique({
      where: { id: request.params.id },
      select: { id: true, slug: true, name: true, _count: { select: { events: true, members: true } } },
    }).catch(() => null);
    if (!department) return reply.status(404).send({ error: 'Abteilung nicht gefunden' });
    if (parse.data.confirm !== department.slug) {
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
      const parse = AdminSetMemberRoleSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send({ error: parse.error.issues[0].message });
      const { role } = parse.data;
      const permissions = role === 'ADMIN' ? [] : normalizePermissions(parse.data.permissions ?? []);
      const { id: departmentId, userId } = request.params;

      const [department, user] = await Promise.all([
        fastify.prisma.department
          .findUnique({ where: { id: departmentId }, select: { id: true, name: true } })
          .catch(() => null),
        fastify.prisma.user
          .findUnique({
            where: { id: userId },
            select: { id: true, passwordHash: true, ceviDbId: true, firstName: true, lastName: true, ceviName: true },
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
            user: { select: { firstName: true, lastName: true, ceviName: true } },
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
