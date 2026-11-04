import { timingSafeEqual } from 'node:crypto';
import { shiftDisplayTitle } from '../services/shiftDto.js';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CheckinSchema,
  SetAttendanceSchema,
  type AttendanceStatus,
  type CheckinResultDto,
} from '@schichtplan/shared';
import { managerFlags } from '../services/eventAccess.js';
import {
  checkinUrl,
  fetchCeviQrCode,
  generateCheckinToken,
  isInCheckinWindow,
  personLabel,
} from '../services/attendance.js';
import { createRateLimiter } from '../services/rateLimit.js';

// Der Code ist nicht erratbar (144 Bit), die Bremse hält nur Skripte und Tippfehler-Schleifen auf.
const checkinIpLimiter = createRateLimiter(10 * 60 * 1000, 60);

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const attendanceRoutes: FastifyPluginAsync = async (fastify) => {
  async function findEvent(tenantId: string, slug: string) {
    return fastify.prisma.event.findUnique({
      where: { departmentId_slug: { departmentId: tenantId, slug } },
      include: { organizers: true },
    });
  }

  async function performerLabel(userId: string): Promise<string> {
    const performer = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, ceviName: true },
    });
    return performer ? `${personLabel(performer)} (OK)` : 'OK';
  }

  // Anwesenheit einer Eintragung setzen (Abteilungsleitung, Planung oder Event-OK)
  fastify.put<{ Params: { slug: string; signupId: string } }>(
    '/api/events/:slug/signups/:signupId/attendance',
    {
      schema: {
        tags: ['Anwesenheit'],
        summary: 'Anwesenheit einer Eintragung setzen',
        description: 'Setzt den Anwesenheitsstatus (z. B. PRESENT, ABSENT_EXCUSED, ABSENT_UNEXCUSED) für eine Schicht-Eintragung durch das OK.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
          signupId: z.string().uuid().describe('ID der Schicht-Eintragung'),
        }),
        body: SetAttendanceSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE) {
        return reply.status(403).send({ error: 'Nur das OK darf die Anwesenheit erfassen' });
      }
      if (event.attendanceMode === 'OFF') {
        return reply.status(400).send({ error: 'Die Anwesenheitsliste ist für diesen Anlass ausgeschaltet' });
      }

      const parse = SetAttendanceSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: parse.error.issues[0].message });
      }
      const { status } = parse.data;

      const signup = await fastify.prisma.shiftSignup.findUnique({
        where: { id: request.params.signupId },
        include: {
          shift: true,
          task: true,
          user: { select: { firstName: true, lastName: true, ceviName: true } },
        },
      });
      if (!signup || signup.shift.eventId !== event.id) {
        return reply.status(404).send({ error: 'Eintragung nicht gefunden' });
      }

      const byName = await performerLabel(request.user.id);
      const updated = await fastify.prisma.shiftSignup.update({
        where: { id: signup.id },
        data: status
          ? { attendance: status, attendanceAt: new Date(), attendanceSource: 'OK', attendanceByName: byName }
          : { attendance: null, attendanceAt: null, attendanceSource: null, attendanceByName: null },
      });

      try {
        await fastify.prisma.shiftSignupLog.create({
          data: {
            eventId: event.id,
            shiftId: signup.shiftId,
            action: 'ATTENDANCE',
            attendance: status,
            helperUserId: signup.userId,
            helperName: personLabel(signup.user, signup.guestName),
            performedByUserId: request.user.id,
            performedByName: byName,
            shiftTitle: shiftDisplayTitle(signup.shift, signup.task),
            shiftStartTime: signup.shift.startTime,
            shiftEndTime: signup.shift.endTime,
            taskTitle: signup.task?.title || null,
          },
        });
      } catch (logErr) {
        request.log.error(logErr, 'Fehler beim Protokollieren der Anwesenheit');
      }

      return {
        id: updated.id,
        attendance: updated.attendance as AttendanceStatus | null,
        attendanceAt: updated.attendanceAt?.toISOString() ?? null,
        attendanceSource: updated.attendanceSource as 'OK' | 'QR' | null,
        attendanceByName: updated.attendanceByName,
      };
    }
  );

  // Selbst-Check-in per QR-Code: hakt die eigenen Schichten ab, die gerade im Check-in-Fenster liegen
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/checkin',
    {
      schema: {
        tags: ['Anwesenheit'],
        summary: 'Selbst-Check-in per QR-Code',
        description: 'Hakt Schichten der angemeldeten Person als anwesend ab, deren Beginn im aktuellen Zeitfenster liegt.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        body: CheckinSchema,
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      if (checkinIpLimiter.hit(`ip:${request.ip}`)) {
        return reply.status(429).send({ error: 'Zu viele Versuche. Bitte warte ein paar Minuten.' });
      }
      const parse = CheckinSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.status(400).send({ error: 'Ungültiger Check-in-Code', code: 'INVALID_CODE' });
      }

      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      if (event.attendanceMode !== 'OK_AND_QR') {
        return reply
          .status(403)
          .send({ error: 'Der Selbst-Check-in ist für diesen Anlass nicht aktiviert', code: 'CHECKIN_DISABLED' });
      }
      if (!event.checkinToken || !sameToken(parse.data.code, event.checkinToken)) {
        return reply.status(403).send({
          error: 'Dieser QR-Code ist nicht (mehr) gültig. Frag beim OK nach dem aktuellen Code.',
          code: 'INVALID_CODE',
        });
      }

      const me = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { firstName: true, lastName: true, ceviName: true },
      });
      const signups = await fastify.prisma.shiftSignup.findMany({
        where: { userId: request.user.id, shift: { eventId: event.id } },
        include: { shift: true, task: true },
        orderBy: { shift: { startTime: 'asc' } },
      });

      const now = new Date();
      const due = signups.filter((s) => isInCheckinWindow(s.shift.startTime, s.shift.endTime, now));
      const toMark = due.filter((s) => s.attendance !== 'PRESENT');
      const myName = personLabel(me);

      if (toMark.length > 0) {
        await fastify.prisma.shiftSignup.updateMany({
          where: { id: { in: toMark.map((s) => s.id) } },
          data: { attendance: 'PRESENT', attendanceAt: now, attendanceSource: 'QR', attendanceByName: myName },
        });
        try {
          await fastify.prisma.shiftSignupLog.createMany({
            data: toMark.map((s) => ({
              eventId: event.id,
              shiftId: s.shiftId,
              action: 'ATTENDANCE',
              attendance: 'PRESENT',
              helperUserId: request.user.id,
              helperName: myName,
              // performedByName leer = selbstständig (per QR-Code)
              performedByUserId: request.user.id,
              performedByName: null,
              shiftTitle: shiftDisplayTitle(s.shift, s.task),
              shiftStartTime: s.shift.startTime,
              shiftEndTime: s.shift.endTime,
              taskTitle: s.task?.title || null,
            })),
          });
        } catch (logErr) {
          request.log.error(logErr, 'Fehler beim Protokollieren des Check-ins');
        }
      }

      const next = due.length === 0 ? signups.find((s) => s.shift.startTime > now) : undefined;
      const result: CheckinResultDto = {
        eventTitle: event.title,
        checkedIn: due.map((s) => ({
          signupId: s.id,
          shiftTitle: s.shift.title,
          taskTitle: s.task?.title || null,
          startTime: s.shift.startTime.toISOString(),
          endTime: s.shift.endTime.toISOString(),
          alreadyPresent: s.attendance === 'PRESENT',
        })),
        nextShift: next
          ? {
              shiftTitle: next.shift.title,
              startTime: next.shift.startTime.toISOString(),
              endTime: next.shift.endTime.toISOString(),
            }
          : null,
      };
      return result;
    }
  );

  // Neuen Check-in-Code erzeugen (alte QR-Codes werden ungültig). Wie die Anlass-Einstellungen:
  // nur Abteilungsleitung und OK-Leitung.
  fastify.post<{ Params: { slug: string } }>(
    '/api/events/:slug/checkin-token',
    {
      schema: {
        tags: ['Anwesenheit'],
        summary: 'Neuen Check-in-Code erzeugen',
        description: 'Erzeugt einen neuen Geheimcode für den QR-Code-Check-in. Bestehende QR-Codes verlieren ihre Gültigkeit.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.SETTINGS) {
        return reply
          .status(403)
          .send({ error: 'Nur die Abteilungsleitung oder die OK-Leitung dürfen den QR-Code erneuern' });
      }
      if (event.attendanceMode !== 'OK_AND_QR') {
        return reply.status(400).send({ error: 'Der Selbst-Check-in ist für diesen Anlass nicht aktiviert' });
      }
      const updated = await fastify.prisma.event.update({
        where: { id: event.id },
        data: { checkinToken: generateCheckinToken() },
      });
      return { checkinToken: updated.checkinToken };
    }
  );

  // QR-Code für den Selbst-Check-in im Cevi-Stil (SVG zum Anzeigen, A4-PDF zum Ausdrucken)
  fastify.get<{ Params: { slug: string }; Querystring: { format?: string } }>(
    '/api/events/:slug/checkin-qr',
    {
      schema: {
        tags: ['Anwesenheit'],
        summary: 'QR-Code für den Selbst-Check-in abrufen',
        description: 'Liefert den Check-in-QR-Code im SVG- oder PDF-Format für das OK zum Aushängen am Anlass.',
        security: [{ bearerAuth: [] }],
        params: z.object({
          slug: z.string().describe('Slug des Anlasses'),
        }),
        querystring: z.object({
          format: z.enum(['svg', 'pdf']).optional().describe('Ausgabeformat (svg oder pdf, Standard svg)'),
        }),
      },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      if (!request.tenant) {
        return reply.status(400).send({ error: 'Keine Abteilung im Kontext' });
      }
      const event = await findEvent(request.tenant.id, request.params.slug);
      if (!event) {
        return reply.status(404).send({ error: 'Event nicht gefunden' });
      }
      const flags = await managerFlags(fastify.prisma, event, request.user);
      if (!flags.can.ATTENDANCE) {
        return reply.status(403).send({ error: 'Nur das OK sieht den Check-in-QR-Code' });
      }
      if (event.attendanceMode !== 'OK_AND_QR' || !event.checkinToken) {
        return reply.status(400).send({ error: 'Der Selbst-Check-in ist für diesen Anlass nicht aktiviert' });
      }

      const format = request.query.format === 'pdf' ? 'pdf' : 'svg';
      let file: Buffer;
      try {
        file = await fetchCeviQrCode(format, {
          text: checkinUrl(request.tenant.slug, event.slug, event.checkinToken),
          title: event.title,
          subtitle: 'Anwesenheit: QR-Code scannen und einchecken',
          color: request.tenant.primaryColor,
          secondaryColor: request.tenant.secondaryColor,
          qrStyle: (request.tenant.qrStyle as 'CORNERS' | 'GRADIENT' | 'SOLID') || 'CORNERS',
          logoUrl: event.logoUrl || request.tenant.logoUrl,
          departmentName: request.tenant.name,
          prisma: fastify.prisma,
        });
      } catch (err) {
        request.log.error(err, 'QR-Code konnte nicht erzeugt werden');
        return reply.status(502).send({ error: 'Der QR-Code konnte gerade nicht erzeugt werden' });
      }

      // Enthält den geheimen Code: nicht zwischenspeichern
      reply.header('Cache-Control', 'no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      if (format === 'pdf') {
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="check-in-${event.slug}.pdf"`);
      } else {
        reply.header('Content-Type', 'image/svg+xml');
        reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
      return reply.send(file);
    }
  );
};

export default attendanceRoutes;
