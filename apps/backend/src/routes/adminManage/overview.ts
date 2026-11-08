import { FastifyPluginAsync } from 'fastify';
import {
  type AdminDashboardDto,
} from '@schichtplan/shared';
import { sendServerAlert } from '../../services/serverAlert.js';
import { toListItem, userSelect } from '../admin.js';
import { eventSelect, toEventItems, } from './shared.js';

/** Admin-Sitzung, Test-Alarm und Startseite (nur globale Admins, siehe guard) */
const adminOverviewRoutes: FastifyPluginAsync = async (fastify) => {
  const guard = { preHandler: [fastify.requireGlobalAdmin] };

  // Admin-Sitzung: Anmeldeart und Ablauf (das Portal fragt das beim Start ab)
  fastify.get(
    '/api/admin/session',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Admin-Sitzungsstatus prüfen',
        description: 'Gibt Gültigkeit, Anmeldeart und Ablaufzeitpunkt der aktuellen Admin-Sitzung zurück.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => ({
    loginMethod: request.adminSession?.loginMethod ?? null,
    issuedAt: request.adminSession?.issuedAt.toISOString() ?? null,
    expiresAt: request.adminSession?.expiresAt.toISOString() ?? null,
  }));

  // Server-Alert-Webhook manuell testen (Server-Leitung)
  fastify.post(
    '/api/admin/alert-test',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Server-Alert-Webhook testen',
        description: 'Löst eine Test-Benachrichtigung an den konfigurierten Notfall-Webhook aus.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request) => {
    const result = await sendServerAlert(
      {
        category: 'TEST',
        level: 'INFO',
        title: 'Server-Leitung Webhook-Test',
        message: 'Dies ist eine Test-Benachrichtigung aus dem Admin-Portal des Cevi Schichtplans.',
        context: {
          adminUserId: request.user.id,
          triggeredAt: new Date().toISOString(),
        },
      },
      { force: true }
    );
    return { ok: true, result };
  });

  // ---------------------------------------------------------------------------
  // Startseite
  // ---------------------------------------------------------------------------

  fastify.get(
    '/api/admin/dashboard',
    {
      ...guard,
      schema: {
        tags: ['Administration'],
        summary: 'Admin-Dashboard-Zahlen abrufen',
        description: 'Zentrale Kennzahlen zu Abteilungen, Anlässen, Schichten und Konten für das Admin-Dashboard.',
        security: [{ bearerAuth: [] }],
      },
    },
    async () => {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const [upcomingRows, recentUsers, allDepts, signups7d] = await Promise.all([
      fastify.prisma.event.findMany({
        where: { endDate: { gte: now } },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        take: 6,
        select: eventSelect,
      }),
      fastify.prisma.user.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 6, select: userSelect }),
      fastify.prisma.department.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          members: {
            where: { role: 'ADMIN' },
            select: { id: true },
            take: 1,
          },
          events: {
            select: { endDate: true },
            orderBy: { endDate: 'desc' },
            take: 1,
          },
        },
      }),
      fastify.prisma.shiftSignup.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);

    const withoutLeader = allDepts
      .filter((d) => d.members.length === 0)
      .map((d) => ({ id: d.id, name: d.name, slug: d.slug }));

    const inactiveDepartments = allDepts
      .filter((d) => {
        const lastEvent = d.events[0];
        if (!lastEvent) {
          return d.createdAt < thirtyDaysAgo;
        }
        return lastEvent.endDate < sixMonthsAgo;
      })
      .map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        lastEventDate: d.events[0]?.endDate.toISOString() ?? null,
      }));

    const dashboard: AdminDashboardDto = {
      upcomingEvents: await toEventItems(fastify.prisma, upcomingRows),
      recentUsers: recentUsers.map((u) => toListItem(u)),
      departmentsWithoutLeader: withoutLeader,
      inactiveDepartments,
      signups7d,
    };
    return dashboard;
  });
};

export default adminOverviewRoutes;
