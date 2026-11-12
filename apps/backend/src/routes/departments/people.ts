import { z } from 'zod';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../../db.js';
import {
  getOrganizationByDbType,
  isPlaceholderEmail,
  normalizePermissions,
  UpdateDepartmentPersonSchema,
  type DepartmentPersonDto,
  type DepartmentPermission,
} from '@schichtplan/shared';
import { departmentOrtsgruppeId, NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { personLabel } from '../../services/profile.js';
import { UNRELATED_PERSON_ERROR, isDepartmentManager } from '../../services/departmentVisibility.js';
import { canGrantPermissions, } from '../../services/permissions.js';
import { recordDepartmentAction, toDepartmentAuditDto } from '../../services/departmentAudit.js';
import { CEVINAME_ROLE_ERROR, isCeviNameProfile } from '../../services/nicknameLogin.js';
import { contactCandidateWhere, requireDepartmentPermission, canEditPerson, homeSource, canConfirmHome } from './shared.js';

/** Personen der Abteilung: Rechte, Stufen, Zugehörigkeit, Protokoll, Mitglieder */
class LastLeaderError extends Error {
  constructor() {
    super('Mindestens eine Vereinsleitung muss in der Abteilung verbleiben.');
  }
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Abteilung bis zum Ende der Transaktion sperren: Leitungs-Änderungen laufen so nacheinander */
async function lockDepartment(tx: Tx, departmentId: string) {
  await tx.$queryRaw`SELECT id FROM departments WHERE id = ${departmentId} FOR UPDATE`;
}

/** Nach der Änderung muss noch mindestens eine Leitung da sein, sonst wird alles zurückgerollt */
async function assertLeaderRemains(tx: Tx, departmentId: string) {
  const leaders = await tx.departmentMember.count({ where: { departmentId, role: 'ADMIN' } });
  if (leaders === 0) throw new LastLeaderError();
}

const departmentPeopleRoutes: FastifyPluginAsync = async (fastify) => {
  /** Recht in der Abteilung der Subdomain prüfen (siehe shared.ts) */
  const requirePermission = (request: FastifyRequest, reply: FastifyReply, permission: DepartmentPermission) =>
    requireDepartmentPermission(fastify, request, reply, permission);

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
      const ortsgruppeId = await departmentOrtsgruppeId(fastify.prisma, tenant.hitobitoGroupId, tenant.organization);
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
          nickname: true,
          firstName: true,
          lastName: true,
          departmentLeader: true,
          homeDepartmentId: true,
          homeDepartmentSource: true,
          passwordHash: true,
          providerId: true,
          ortsgruppeId: true,
          homeDepartmentConfirmedAt: true,
          email: true,
          phone: true,
          homeDepartmentConfirmedBy: { select: { nickname: true, firstName: true, lastName: true } },
          memberships: {
            where: { departmentId: tenant.id },
            select: { role: true, permissions: true, leaderSource: true },
          },
          stufen: {
            where: { stufe: { departmentId: tenant.id } },
            select: { stufeId: true, role: true, source: true, stufe: { select: { name: true, sortOrder: true } } },
          },
        },
        orderBy: [{ nickname: 'asc' }, { firstName: 'asc' }],
      });
      return users.map((u): DepartmentPersonDto => {
        const isHome = u.homeDepartmentId === tenant.id;
        const membership = u.memberships[0] ?? null;
        const role = membership ? (membership.role === 'ADMIN' ? 'ADMIN' : 'HELPER') : null;
        const permissions = role === 'ADMIN' ? [] : normalizePermissions(membership?.permissions ?? []);
        return {
          userId: u.id,
          displayName: personLabel(u),
          nickname: u.nickname,
          ceviName: u.nickname,
          firstName: u.firstName,
          lastName: u.lastName,
          isHomeDepartment: isHome,
          source: isHome ? homeSource(u.homeDepartmentSource) : null,
          canConfirmHome: canConfirmHome(access, request.user.id, u, tenant.id, ortsgruppeId),
          email: u.email && !isPlaceholderEmail(u.email) ? u.email : null,
          phone: u.phone,
          confirmedAt: isHome ? (u.homeDepartmentConfirmedAt?.toISOString() ?? null) : null,
          confirmedBy: isHome && u.homeDepartmentConfirmedBy ? personLabel(u.homeDepartmentConfirmedBy) : null,
          departmentRole: role,
          permissions,
          leaderSource:
            role === 'ADMIN' ? (membership?.leaderSource === 'CEVIDB' ? 'CEVIDB' : 'MANUAL') : null,
          canEdit: canEditPerson(access, request.user.id, { userId: u.id, role, permissions }),
          departmentLeader: u.departmentLeader,
          isDepartmentLeader: u.departmentLeader,
          isCeviDbDepartmentLeader: u.departmentLeader,
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
      const input = request.body as z.output<typeof UpdateDepartmentPersonSchema>;
      const { stufen, role: nextRole } = input;
      const userId = request.params.userId;
      const isOther = tenant.organization === 'OTHER';

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          homeDepartmentId: true,
          passwordHash: true,
          providerId: true,
          provider: true,
          nickname: true,
          firstName: true,
          lastName: true,
          memberships: {
            where: { departmentId: tenant.id },
            select: { role: true, permissions: true, leaderSource: true },
          },
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
      const currentRole = membership?.role ?? 'HELPER';
      const currentPermissions = currentRole === 'ADMIN' ? [] : normalizePermissions(membership?.permissions ?? []);
      const target = { userId, role: currentRole, permissions: currentPermissions };
      if (!canEditPerson(access, request.user.id, target)) {
        return reply.status(403).send({
          error:
            userId === request.user.id
              ? 'Deine eigenen Rechte kann nur die Abteilungsleitung ändern.'
              : 'Diese Person hat gleich viele oder mehr Rechte als du. Das kann nur die Abteilungsleitung ändern.',
        });
      }

      if (nextRole !== undefined && nextRole !== currentRole) {
        if (!isOther) {
          return reply.status(400).send({
            error: 'Die Abteilungsleitung hat alle Rechte. Sie ändert sich nur über Cevi.DB oder das Admin-Portal.',
          });
        }
        if (!access.hasFullAccess) {
          return reply.status(403).send({
            error: 'Nur die Vereinsleitung kann Leitungsrollen vergeben oder entziehen.',
          });
        }
        if (nextRole === 'ADMIN' && isCeviNameProfile(user)) {
          return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
        }
        if (currentRole === 'ADMIN' && nextRole === 'HELPER') {
          const otherLeaders = await fastify.prisma.departmentMember.count({
            where: { departmentId: tenant.id, role: 'ADMIN', userId: { not: userId } },
          });
          if (otherLeaders === 0) {
            return reply.status(400).send({
              error: 'Mindestens eine Vereinsleitung muss in der Abteilung verbleiben.',
            });
          }
        }
      }

      const effectiveRole = nextRole ?? currentRole;
      const nextPermissions = input.permissions ? normalizePermissions(input.permissions) : null;
      if (nextPermissions) {
        if (effectiveRole === 'ADMIN') {
          if (!isOther) {
            return reply.status(400).send({
              error: 'Die Abteilungsleitung hat alle Rechte. Sie ändert sich nur über Cevi.DB oder das Admin-Portal.',
            });
          }
        } else {
          if (nextPermissions.length > 0 && isCeviNameProfile(user)) {
            return reply.status(400).send({ error: CEVINAME_ROLE_ERROR });
          }
          if (!canGrantPermissions(access, currentPermissions, nextPermissions)) {
            return reply.status(403).send({ error: 'Du kannst nur weniger Rechte vergeben, als du selbst hast.' });
          }
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

      const roleChanged = nextRole !== undefined && nextRole !== currentRole;
      const permissionsChanged =
        effectiveRole === 'HELPER' &&
        nextPermissions !== null &&
        nextPermissions.join() !== currentPermissions.join();

      const stufenBefore = user.stufen.filter((s) => s.source === 'SELF');
      const demotesLeader = roleChanged && currentRole === 'ADMIN' && effectiveRole !== 'ADMIN';
      try {
      await fastify.prisma.$transaction(async (tx) => {
        // Gleichzeitige Leitungs-Änderungen nacheinander, damit nie alle Leitungen auf einmal wegfallen
        if (demotesLeader) await lockDepartment(tx, tenant.id);
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
        if (roleChanged || nextPermissions) {
          if (effectiveRole === 'ADMIN') {
            await tx.departmentMember.upsert({
              where: { departmentId_userId: { departmentId: tenant.id, userId } },
              update: { role: 'ADMIN', leaderSource: membership?.leaderSource ?? 'MANUAL', permissions: [] },
              create: { departmentId: tenant.id, userId, role: 'ADMIN', leaderSource: 'MANUAL', permissions: [] },
            });
          } else {
            const perms = nextPermissions ?? (currentRole === 'ADMIN' ? [] : currentPermissions);
            await tx.departmentMember.upsert({
              where: { departmentId_userId: { departmentId: tenant.id, userId } },
              update: { role: 'HELPER', leaderSource: null, permissions: perms },
              create: { departmentId: tenant.id, userId, role: 'HELPER', leaderSource: null, permissions: perms },
            });
          }
        }
        if (demotesLeader) await assertLeaderRemains(tx, tenant.id);
      });
      } catch (err) {
        if (err instanceof LastLeaderError) return reply.status(400).send({ error: err.message });
        throw err;
      }

      const label = personLabel(user);
      if (roleChanged) {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId: tenant.id,
          actorId: request.user.id,
          action: effectiveRole === 'ADMIN' ? 'LEADER_GRANT' : 'LEADER_REVOKE',
          targetUserId: userId,
          targetLabel: label,
          ...(effectiveRole === 'ADMIN' ? { details: { source: 'MANUAL' } } : {}),
        });
      }
      if (permissionsChanged) {
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
          providerId: true,
          provider: true,
          ortsgruppeId: true,
          homeDepartmentId: true,
          homeDepartmentSource: true,
          nickname: true,
          firstName: true,
          lastName: true,
        },
      });
      if (!user) return reply.status(404).send({ error: 'Person nicht gefunden' });
      const ortsgruppeId = await departmentOrtsgruppeId(fastify.prisma, tenant.hitobitoGroupId, tenant.organization);
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
        select: { id: true, nickname: true, firstName: true, lastName: true },
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
          nickname: true,
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
        if (tenant.organization === 'OTHER' && access.hasFullAccess) {
          const others = await fastify.prisma.departmentMember.count({
            where: { departmentId: tenant.id, role: 'ADMIN', userId: { not: user.id } },
          });
          if (others === 0) {
            return reply.status(400).send({ error: 'Mindestens eine Vereinsleitung muss in der Abteilung verbleiben.' });
          }
        } else {
          return reply.status(400).send({ error: 'Die Abteilungsleitung lässt sich hier nicht entfernen.' });
        }
      }
      if (user.homeDepartmentSource === 'CEVIDB') {
        const providerName = getOrganizationByDbType(tenant.organization).authProviderShort;
        return reply
          .status(400)
          .send({ error: `Diese Zuordnung kommt aus ${providerName} und lässt sich hier nicht ändern.` });
      }
      const removesLeader = membership?.role === 'ADMIN';
      try {
        await fastify.prisma.$transaction(async (tx) => {
          if (removesLeader) await lockDepartment(tx, tenant.id);
          await tx.userStufe.deleteMany({
            where: { userId: user.id, source: 'SELF', stufe: { departmentId: tenant.id } },
          });
          // Eine entfernte Vereinsleitung verliert auch die Leitung (sonst bliebe der Vollzugriff bestehen)
          await tx.departmentMember.updateMany({
            where: { departmentId: tenant.id, userId: user.id },
            data: removesLeader ? { permissions: [], role: 'HELPER', leaderSource: null } : { permissions: [] },
          });
          await tx.user.update({
            where: { id: user.id },
            data: { homeDepartmentId: null, homeDepartmentSource: null, ...NO_HOME_CONFIRMATION, departmentSetupAt: null },
          });
          if (removesLeader) await assertLeaderRemains(tx, tenant.id);
        });
      } catch (err) {
        if (err instanceof LastLeaderError) return reply.status(400).send({ error: err.message });
        throw err;
      }
      if (removesLeader) {
        await recordDepartmentAction(fastify.prisma, request.log, {
          departmentId: tenant.id,
          actorId: request.user.id,
          action: 'LEADER_REVOKE',
          targetUserId: user.id,
          targetLabel: personLabel(user),
        });
      }
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
        select: { role: true, user: { select: { id: true, nickname: true, firstName: true, lastName: true } } },
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
              nickname: true,
              email: true,
              passwordHash: true,
              providerId: true,
              provider: true,
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
        nickname: m.user.nickname,
        ceviName: m.user.nickname,
        email: m.user.email,
        // Nur Cevi-Name-Profil: kann eingeteilt, aber nicht ins OK aufgenommen werden
        isCeviNameProfile: isCeviNameProfile(m.user),
        displayName: m.user.nickname
          ? `${m.user.nickname} (${m.user.firstName} ${m.user.lastName})`
          : `${m.user.firstName} ${m.user.lastName}`,
      }));
    }
  );
};

export default departmentPeopleRoutes;
