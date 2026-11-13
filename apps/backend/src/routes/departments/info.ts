import crypto from 'node:crypto';
import { z } from 'zod';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma, } from '../../db.js';
import {
  CreateDepartmentFromCeviDbSchema,
  DEPARTMENT_PERMISSION_PRESETS,
  UpdateDepartmentSchema,
  type DepartmentDirectoryItemDto,
  type DepartmentJoinMode,
  type DepartmentPermission,
  type PasswordlessAccountsDto,
  getOrganizationByDbType,
} from '@schichtplan/shared';
import { autoCreateCeviDbDepartmentStufen, ceviDbGroupPeople, NO_HOME_CONFIRMATION } from '../../services/homeDepartment.js';
import { isDepartmentInsider, } from '../../services/departmentVisibility.js';
import { canGrantPermissions, departmentAccess, } from '../../services/permissions.js';
import {
  createDepartmentInviteToken,
  extractBaseInviteToken,
  verifyDepartmentInviteToken,
  type InvitePreset,
} from '../../services/inviteToken.js';
import { computeDepartmentStats } from '../../services/departmentStats.js';
import { departmentCache } from '../../services/departmentCache.js';
import { getLoginPortalBaseUrl, rootDomain } from '../../services/authSession.js';
import { escapeHtml, sendGenericEmail } from '../../services/email.js';
import { createRateLimiter } from '../../services/rateLimit.js';
import { contactCandidateWhere, loadContactPerson, NOT_ELIGIBLE_MESSAGES, departmentCreationEligibility, requireDepartmentPermission, } from './shared.js';

/* Bremse für E-Mail-Einladungen (im Speicher, siehe rateLimit.ts) */
const inviteUserLimiter = createRateLimiter(60 * 60 * 1000, 30);
const inviteDeptLimiter = createRateLimiter(24 * 60 * 60 * 1000, 200);
const inviteRecipientLimiter = createRateLimiter(24 * 60 * 60 * 1000, 1);

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

    let canSeeInviteToken = false;
    if (request.user) {
      const access = await departmentAccess(fastify.prisma, request.tenant.id, request.user.id);
      canSeeInviteToken = access.permissions.has('DEPARTMENT_SETTINGS') || access.permissions.has('PEOPLE_MANAGE');
    }

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
      hitobitoGroupId: request.tenant.hitobitoGroupId,
      ceviDbGroupId: request.tenant.hitobitoGroupId,
      membersOnly: request.tenant.membersOnly,
      allowPasswordless: request.tenant.allowPasswordless,
      joinMode: (request.tenant.joinMode as DepartmentJoinMode) || 'LINK_ONLY',
      ...(canSeeInviteToken ? { inviteToken: request.tenant.inviteToken } : {}),
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
    async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    const departments = await departmentCache.getDirectory(fastify.prisma, request.organization);
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
    async (request) => {
    const departments = await fastify.prisma.department.findMany({
      where: { organization: request.organization },
      select: {
        id: true,
        name: true,
        slug: true,
        organization: true,
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
      return departmentCreationEligibility(fastify.prisma, request.user.id, request.organization);
    }
  );

  // Abteilung anlegen als Abteilungsleitung: ohne Passwort, verknüpft mit der Cevi.DB-Gruppe.
  // Für Vereine (organization = 'OTHER'): ohne Hitobito-Gruppe mit leaderSource = 'MANUAL'.
  const createDepartmentOpts = {
    schema: {
      tags: ['Abteilungen'],
      summary: 'Neue Abteilung über Hitobito/Cevi.DB erstellen',
      description: 'Legt eine neue Abteilung anhand der Leitungsrolle an und weist die Subdomain zu.',
      security: [{ bearerAuth: [] }],
      body: CreateDepartmentFromCeviDbSchema,
    },
    preHandler: [fastify.authenticate],
  };

  const createDepartmentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
      const input = request.body as z.output<typeof CreateDepartmentFromCeviDbSchema>;
      const { departmentName, slug } = input;
      const isOther = request.organization === 'OTHER';

      const eligibility = await departmentCreationEligibility(fastify.prisma, request.user.id, request.organization);
      if (!eligibility.eligible || (!isOther && eligibility.ortsgruppeId === null)) {
        const reason = eligibility.reason ?? 'NOT_LEADER';
        return reply
          .status(reason === 'EXISTS' ? 409 : 403)
          .send({ error: NOT_ELIGIBLE_MESSAGES[reason], reason, existingDepartment: eligibility.existingDepartment });
      }
      // Leitet die Person mehrere Ebenen (z. B. Abteilung und Region), zählt ihre Wahl, aber nur unter ihren eigenen
      const options = eligibility.options ?? [];
      const chosen =
        !isOther && input.hitobitoGroupId !== undefined
          ? options.find((o) => o.hitobitoGroupId === input.hitobitoGroupId)
          : options.find((o) => o.hitobitoGroupId === eligibility.ortsgruppeId);
      if (!isOther && input.hitobitoGroupId !== undefined && !chosen) {
        return reply.status(403).send({ error: NOT_ELIGIBLE_MESSAGES.NOT_LEADER, reason: 'NOT_LEADER', existingDepartment: null });
      }
      if (chosen?.existingDepartment) {
        return reply
          .status(409)
          .send({ error: NOT_ELIGIBLE_MESSAGES.EXISTS, reason: 'EXISTS', existingDepartment: chosen.existingDepartment });
      }
      const ceviDbGroupId = chosen?.hitobitoGroupId ?? eligibility.ortsgruppeId;
      // Eine höhere Ebene (Region, Kantonalverband) wird nicht zur Heimabteilung, wenn die Person schon eine hat
      const isUpperLevel = (chosen?.level ?? 0) > 0;
      const founderUser = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { provider: true, homeDepartmentId: true },
      });
      const provider = isOther ? 'OTHER' : (founderUser?.provider ?? 'CEVI');
      // Vereine: Wer schon eine Heimabteilung hat, behält sie und tritt dem Verein zusätzlich bei
      const becomesHome = isOther ? !founderUser?.homeDepartmentId : !isUpperLevel || !founderUser?.homeDepartmentId;

      try {
        const departmentResult = await fastify.prisma.$transaction(async (tx) => {
          const created = await tx.department.create({
            data: {
              name: departmentName,
              slug,
              organization: provider,
              primaryColor: getOrganizationByDbType(provider).primaryColor,
              contactUserId: request.user.id,
              hitobitoGroupId: isOther ? null : ceviDbGroupId,
            },
          });
          await tx.departmentMember.create({
            data: {
              departmentId: created.id,
              userId: request.user.id,
              role: 'ADMIN',
              leaderSource: isOther ? 'MANUAL' : 'CEVIDB',
              ...(becomesHome ? {} : { joinedAt: new Date(), confirmedAt: new Date() }),
            },
          });
          if (becomesHome) {
            await tx.user.update({
              where: { id: request.user.id },
              data: {
                homeDepartmentId: created.id,
                homeDepartmentSource: isOther ? 'CONFIRMED' : 'CEVIDB',
                ...(isOther
                  ? { homeDepartmentConfirmedAt: new Date(), homeDepartmentConfirmedById: null }
                  : NO_HOME_CONFIRMATION),
                departmentSetupAt: new Date(),
              },
            });
          }

          // Alle bereits angemeldeten Cevi.DB-Personen dieser Gruppe werden Helfer*innen bzw. Abteilungsleitung
          // (nur bei Hitobito-Gruppen, nicht bei Vereinen)
          let memberIds: string[] = [];
          if (!isOther && ceviDbGroupId !== null) {
            const people = await ceviDbGroupPeople(tx, ceviDbGroupId, provider);
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
            memberIds = people.map((p) => p.id);
          }

          return { department: created, memberIds };
        });

        for (const memberId of departmentResult.memberIds) {
          await autoCreateCeviDbDepartmentStufen(fastify.prisma, departmentResult.department.id, memberId);
        }

        departmentCache.invalidate(provider, slug);

        request.log.info(
          { userId: request.user.id, departmentId: departmentResult.department.id, slug, hitobitoGroupId: isOther ? null : ceviDbGroupId },
          isOther ? 'Verein von Vereinsleitung angelegt' : 'Abteilung von Abteilungsleitung (Cevi.DB) angelegt'
        );
        return reply.status(201).send({
          department: {
            id: departmentResult.department.id,
            name: departmentResult.department.name,
            slug: departmentResult.department.slug,
          },
          message: isOther ? 'Verein erfolgreich erstellt!' : 'Abteilung erfolgreich erstellt!',
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
  };

  fastify.post('/api/departments/cevidb', createDepartmentOpts, createDepartmentHandler);
  fastify.post('/api/departments/hitobito', createDepartmentOpts, createDepartmentHandler);

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

      const nextInviteToken =
        input.joinMode === 'INVITE_ONLY' && !tenant.inviteToken
          ? crypto.randomBytes(18).toString('base64url')
          : undefined;

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
          allowPasswordless: input.allowPasswordless,
          joinMode: input.joinMode,
          ...(nextInviteToken !== undefined ? { inviteToken: nextInviteToken } : {}),
        },
      });

      departmentCache.invalidate(tenant.organization, tenant.slug);

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
        membersOnly: updated.membersOnly,
        allowPasswordless: updated.allowPasswordless,
        joinMode: updated.joinMode as DepartmentJoinMode,
        inviteToken: updated.inviteToken,
      };
    }
  );

  // Abteilung zu einem Einladungs-Token (Login-Portal, wenn der Link ohne Abteilungs-Ziel kommt)
  fastify.get(
    '/api/departments/invite-lookup',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Abteilung zu einem Einladungs-Link finden',
        description: 'Liefert die Abteilung (wie im Verzeichnis) zu einem gültigen Einladungs-Token.',
        security: [{ bearerAuth: [] }],
        querystring: z.object({ token: z.string().trim().min(8).max(128) }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const { token } = request.query as { token: string };
      const baseToken = extractBaseInviteToken(token);
      const dept = baseToken
        ? await fastify.prisma.department.findUnique({
            where: { inviteToken: baseToken },
            select: { id: true, organization: true, inviteToken: true },
          })
        : null;
      const verified = dept ? verifyDepartmentInviteToken(dept.id, dept.inviteToken, token) : null;
      const item =
        dept && verified?.valid && dept.organization === request.organization
          ? (await departmentCache.getDirectory(fastify.prisma, request.organization)).find((d) => d.id === dept.id)
          : undefined;
      if (!item) {
        return reply.status(404).send({
          code: 'INVITE_INVALID',
          error: 'Dieser Einladungslink ist ungültig oder wurde inzwischen ersetzt.',
        });
      }
      return item satisfies DepartmentDirectoryItemDto;
    }
  );

  // Konten, die nur passwortlos (Spitzname + Geburtsdatum) hineinkommen: Warnung vor dem Abschalten
  fastify.get(
    '/api/departments/current/passwordless-accounts',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Konten ohne Passwort, E-Mail und Verbands-Login',
        description:
          'Personen der Abteilung, die sich nur mit Spitzname und Geburtsdatum anmelden können und beim Abschalten der passwortlosen Anmeldung ausgesperrt würden.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const ctx = await requirePermission(request, reply, 'DEPARTMENT_SETTINGS');
      if (!ctx) return;
      reply.header('Cache-Control', 'no-store');
      const people = await fastify.prisma.user.findMany({
        where: {
          passwordHash: null,
          providerId: null,
          email: null,
          nickname: { not: null },
          OR: [{ homeDepartmentId: ctx.tenant.id }, { memberships: { some: { departmentId: ctx.tenant.id } } }],
        },
        select: { id: true, nickname: true, firstName: true, lastName: true, lastSeenOn: true },
        orderBy: [{ nickname: 'asc' }, { firstName: 'asc' }],
      });
      return {
        count: people.length,
        people: people.map((p) => ({
          id: p.id,
          nickname: p.nickname,
          firstName: p.firstName,
          lastName: p.lastName,
          lastSeenOn: p.lastSeenOn ? p.lastSeenOn.toISOString().slice(0, 10) : null,
        })),
      } satisfies PasswordlessAccountsDto;
    }
  );

  // Neuen geheimen Einladungs-Link für die Abteilung erzeugen (macht alte ungültig)
  fastify.post(
    '/api/departments/current/invite-token',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Einladungs-Token neu erzeugen',
        description: 'Erzeugt einen neuen geheimen Einladungs-Token für die Abteilung.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
      const access = await departmentAccess(fastify.prisma, request.tenant.id, request.user.id);
      if (!access.permissions.has('DEPARTMENT_SETTINGS') && !access.permissions.has('PEOPLE_MANAGE')) {
        return reply.status(403).send({ error: 'Keine Berechtigung.' });
      }
      const inviteToken = crypto.randomBytes(18).toString('base64url');
      await fastify.prisma.department.update({
        where: { id: request.tenant.id },
        data: { inviteToken },
      });
      departmentCache.invalidate(request.tenant.organization, request.tenant.slug);
      return { inviteToken };
    }
  );

  // Personen per E-Mail (Einzeladresse oder Liste) in die Abteilung / den Verein einladen
  const emailValidator = z.string().email();
  const extractEmails = (raw?: string, list?: string[]): string[] => {
    const chunks = [...(raw ? raw.split(/[,;\n\r]+/) : []), ...(list ?? [])];
    const out: string[] = [];
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const angle = trimmed.match(/<([^<>@\s]+@[^<>@\s]+)>/);
      if (angle) {
        out.push(angle[1].toLowerCase().trim());
      } else {
        for (const token of trimmed.split(/\s+/)) {
          const clean = token.toLowerCase().trim();
          if (clean) out.push(clean);
        }
      }
    }
    return [...new Set(out)];
  };

  fastify.post(
    '/api/departments/current/invite',
    {
      schema: {
        tags: ['Abteilungen'],
        summary: 'Personen per E-Mail einladen',
        description: 'Sendet E-Mail-Einladungen (Einzeladresse oder Liste) mit dem geheimen Einladungs-Link.',
        security: [{ bearerAuth: [] }],
        body: z.object({
          email: z.string().trim().max(4000).optional(),
          emails: z.array(z.string().trim().max(254)).max(50).optional(),
          preset: z
            .enum(['MEMBER', 'EVENT_CREATION', 'EVENT_COORDINATION', 'EVENT_EDITING', 'ADMINISTRATION'])
            .optional()
            .default('MEMBER'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) return reply.status(404).send({ error: 'Keine Abteilung im Kontext' });
      const access = await departmentAccess(fastify.prisma, request.tenant.id, request.user.id);
      if (!access.permissions.has('DEPARTMENT_SETTINGS') && !access.permissions.has('PEOPLE_MANAGE')) {
        return reply.status(403).send({ error: 'Keine Berechtigung.' });
      }
      const { email, emails: rawList, preset = 'MEMBER' } = request.body as {
        email?: string;
        emails?: string[];
        preset?: InvitePreset;
      };
      const recipients = extractEmails(email, rawList);
      if (recipients.length === 0) {
        return reply.status(400).send({ error: 'Bitte mindestens eine gültige E-Mail-Adresse angeben.' });
      }
      if (recipients.length > 50) {
        return reply.status(400).send({ error: 'Bitte höchstens 50 E-Mail-Adressen auf einmal einladen.' });
      }
      for (const addr of recipients) {
        if (!emailValidator.safeParse(addr).success) {
          return reply.status(400).send({ error: `Ungültige E-Mail-Adresse: ${addr}` });
        }
      }

      if (preset !== 'MEMBER') {
        const presetPerms = DEPARTMENT_PERMISSION_PRESETS[preset].permissions;
        if (!canGrantPermissions(access, [], presetPerms)) {
          return reply.status(403).send({
            error: 'Du kannst beim Einladen nur Rechte vergeben, die du selbst verwalten darfst.',
          });
        }
      }

      // Bremse gegen Massenversand: pro Person und pro Abteilung, dazu nie zweimal kurz nacheinander an dieselbe Adresse
      const limitKeyUser = `user:${request.user.id}`;
      const limitKeyDept = `dept:${request.tenant.id}`;
      const toSend: string[] = [];
      let skippedCount = 0;
      for (const addr of recipients) {
        const limitKeyRecipient = `to:${request.tenant.id}:${addr}`;
        if (inviteRecipientLimiter.isBlocked(limitKeyRecipient)) {
          skippedCount++;
        } else {
          toSend.push(addr);
        }
      }

      if (toSend.length === 0) {
        return reply.status(429).send({
          code: 'RATE_LIMITED',
          error:
            recipients.length === 1
              ? 'An diese Adresse wurde heute schon eine Einladung geschickt. Du kannst ihr auch den Einladungs-Link direkt weitergeben.'
              : 'An alle angegebenen Adressen wurde heute bereits eine Einladung geschickt.',
        });
      }
      if (inviteUserLimiter.hit(limitKeyUser) || inviteDeptLimiter.hit(limitKeyDept)) {
        return reply.status(429).send({
          code: 'RATE_LIMITED',
          error: 'Zu viele Einladungen in kurzer Zeit. Bitte versuche es später wieder.',
        });
      }
      for (const addr of toSend) {
        inviteRecipientLimiter.hit(`to:${request.tenant.id}:${addr}`);
      }

      let inviteToken = request.tenant.inviteToken;
      if (!inviteToken) {
        inviteToken = crypto.randomBytes(18).toString('base64url');
        await fastify.prisma.department.update({
          where: { id: request.tenant.id },
          data: { inviteToken },
        });
        departmentCache.invalidate(request.tenant.organization, request.tenant.slug);
      }

      // Bewusst keine Änderung an bestehenden Konten: Aufgenommen wird erst, wer den Link selbst einlöst.
      // Die Antwort verrät auch nicht, ob es zur Adresse schon ein Konto gibt.
      const org = getOrganizationByDbType(request.tenant.organization);
      const portalUrl = `https://${request.tenant.slug}.${rootDomain(request.headers.host)}`;
      const loginUrl = getLoginPortalBaseUrl(process.env, request.headers.host, request.tenant.organization);
      const signedInvite = createDepartmentInviteToken(request.tenant.id, inviteToken, preset);
      const inviteUrl = `${loginUrl}/?return_to=${encodeURIComponent(portalUrl)}&invite=${encodeURIComponent(signedInvite)}`;
      const name = request.tenant.name;
      const presetNote =
        preset !== 'MEMBER'
          ? `<p>Dir wurde dabei direkt die Berechtigung <strong>${escapeHtml(DEPARTMENT_PERMISSION_PRESETS[preset].label)}</strong> zugewiesen.</p>`
          : '';

      let sentCount = 0;
      for (const addr of toSend) {
        const ok = await sendGenericEmail({
          to: addr,
          subject: `Einladung zu ${name} (${org.name})`,
          eyebrow: name,
          title: `Du wurdest zu ${name} eingeladen`,
          messageHtml: `<p>Du wurdest eingeladen, <strong>${escapeHtml(name)}</strong> beizutreten, um dich für Schichten einzutragen.</p>${presetNote}<p>Klicke auf den Button unten, um dich anzumelden oder ein Konto zu erstellen. Danach bestätigst du den Beitritt.</p>`,
          ctaText: `${name} beitreten`,
          ctaUrl: inviteUrl,
          organization: request.tenant.organization,
        });
        if (ok) sentCount++;
      }

      return { ok: true, sent: sentCount > 0, sentCount, skippedCount, total: recipients.length, inviteToken };
    }
  );
};

export default departmentInfoRoutes;
