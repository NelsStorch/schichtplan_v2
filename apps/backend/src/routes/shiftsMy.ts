
import { FastifyPluginAsync } from 'fastify';
import {
  businessDayKey,
  toZurichInput,
  type MyHoursSummaryDto,
  type OrganizationType,
  type ResponsiblePersonDto,
} from '@schichtplan/shared';
import { toResponsiblePersonDto } from '../services/shiftDto.js';

const shiftsMyRoutes: FastifyPluginAsync = async (fastify) => {
  // Kompakte Helfer-Stunden-Zusammenfassung abfragen (für «Dein Konto» Hero-Card)
  fastify.get(
    '/api/shifts/my/summary',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Helfer-Stunden-Zusammenfassung abrufen',
        description: 'Liefert geleistete und anstehende Helferstunden der angemeldeten Person.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request): Promise<MyHoursSummaryDto> => {
      const [signups, shiftResp] = await Promise.all([
        fastify.prisma.shiftSignup.findMany({
          where: { userId: request.user.id },
          select: {
            shift: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                eventId: true,
                event: {
                  select: {
                    id: true,
                    departmentId: true,
                  },
                },
              },
            },
          },
        }),
        fastify.prisma.shiftResponsible.findMany({
          where: { userId: request.user.id },
          select: {
            shift: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                eventId: true,
                event: {
                  select: {
                    id: true,
                    departmentId: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      const now = Date.now();
      const shiftsMap = new Map<
        string,
        {
          startTime: Date;
          endTime: Date;
          eventId: string;
          departmentId: string | null;
          isResponsible: boolean;
        }
      >();

      for (const su of signups) {
        if (!su.shift) continue;
        shiftsMap.set(su.shift.id, {
          startTime: su.shift.startTime,
          endTime: su.shift.endTime,
          eventId: su.shift.eventId,
          departmentId: su.shift.event?.departmentId ?? null,
          isResponsible: false,
        });
      }

      for (const sr of shiftResp) {
        if (!sr.shift) continue;
        const existing = shiftsMap.get(sr.shift.id);
        if (existing) {
          existing.isResponsible = true;
        } else {
          shiftsMap.set(sr.shift.id, {
            startTime: sr.shift.startTime,
            endTime: sr.shift.endTime,
            eventId: sr.shift.eventId,
            departmentId: sr.shift.event?.departmentId ?? null,
            isResponsible: true,
          });
        }
      }

      let completedMinutes = 0;
      let upcomingMinutes = 0;
      let leadCount = 0;
      const eventIds = new Set<string>();
      const departmentIds = new Set<string>();

      for (const shift of shiftsMap.values()) {
        if (shift.isResponsible) leadCount++;
        eventIds.add(shift.eventId);
        if (shift.departmentId) departmentIds.add(shift.departmentId);

        const startMs = shift.startTime.getTime();
        const endMs = shift.endTime.getTime();
        const durMin = Math.max(0, Math.round((endMs - startMs) / 60_000));

        if (endMs <= now) {
          completedMinutes += durMin;
        } else {
          upcomingMinutes += durMin;
        }
      }

      const totalMinutes = completedMinutes + upcomingMinutes;
      const completedHours = Math.round((completedMinutes / 60) * 10) / 10;
      const upcomingHours = Math.round((upcomingMinutes / 60) * 10) / 10;
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

      return {
        totalHours,
        completedHours,
        upcomingHours,
        shiftCount: shiftsMap.size,
        leadCount,
        eventCount: eventIds.size,
        departmentCount: departmentIds.size,
      };
    }
  );

  // Meine Schichten abfragen (inkl. Schichten, bei denen man Schichtleitung oder Tagesleitung ist)
  fastify.get(
    '/api/shifts/my',
    {
      schema: {
        tags: ['Schichten'],
        summary: 'Meine Schichten abrufen',
        description: 'Liefert alle eingetragenen Schichten und Leitungsaufgaben der angemeldeten Person abteilungsübergreifend.',
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const [signups, shiftResp, dayResp] = await Promise.all([
        fastify.prisma.shiftSignup.findMany({
          where: { userId: request.user.id },
          include: {
            task: { select: { id: true, title: true } },
            shift: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    startDate: true,
                    cancelDeadlineDays: true,
                    allowReplacement: true,
                    replacementCutoffHours: true,
                    cateringTokensEnabled: true,
                    department: { select: { name: true, slug: true, organization: true } },
                  },
                },
              },
            },
          },
        }),
        fastify.prisma.shiftResponsible.findMany({
          where: { userId: request.user.id },
          include: {
            shift: {
              include: {
                event: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    startDate: true,
                    cancelDeadlineDays: true,
                    cateringTokensEnabled: true,
                    department: { select: { name: true, slug: true, organization: true } },
                  },
                },
              },
            },
          },
        }),
        fastify.prisma.eventDayResponsible.findMany({
          where: { userId: request.user.id },
          include: {
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                startDate: true,
                cancelDeadlineDays: true,
                cateringTokensEnabled: true,
                department: { select: { name: true, slug: true, organization: true } },
                shifts: true,
              },
            },
          },
        }),
      ]);

      interface MyShiftItem {
        signupId: string;
        shiftId: string;
        taskId: string | null;
        taskTitle: string | null;
        title: string | null;
        category: string | null;
        description: string | null;
        startTime: string;
        endTime: string;
        eventId: string;
        eventTitle: string;
        eventSlug: string;
        eventStartDate: string;
        cancelDeadlineDays: number | null;
        cateringTokensEnabled?: boolean;
        /** «Ersatz gesucht»: erlaubt, Frist und eigener Stand (nur bei eigener Eintragung) */
        allowReplacement?: boolean;
        replacementCutoffHours?: number;
        replacementWantedAt?: string | null;
        replacementNote?: string | null;
        departmentName: string;
        departmentSlug: string;
        departmentOrganization?: OrganizationType;
        createdAt: string;
        isSignup: boolean;
        isResponsible: boolean;
        responsibleRole: string | null;
        responsibles?: ResponsiblePersonDto[];
        contactUser?: ResponsiblePersonDto | null;
        coHelpers?: string[];
        filledSlots?: number;
        requiredSlots?: number;
        dayCutoffTime?: string;
      }

      const map = new Map<string, MyShiftItem>();

      for (const su of signups) {
        map.set(su.shift.id, {
          signupId: su.id,
          shiftId: su.shift.id,
          taskId: su.task?.id || null,
          taskTitle: su.task?.title || null,
          title: su.shift.title,
          category: su.shift.category,
          description: su.shift.description,
          startTime: su.shift.startTime.toISOString(),
          endTime: su.shift.endTime.toISOString(),
          eventId: su.shift.event.id,
          eventTitle: su.shift.event.title,
          eventSlug: su.shift.event.slug,
          eventStartDate: su.shift.event.startDate.toISOString(),
          cancelDeadlineDays: su.shift.event.cancelDeadlineDays,
          cateringTokensEnabled: su.shift.event.cateringTokensEnabled,
          allowReplacement: su.shift.event.allowReplacement,
          replacementCutoffHours: su.shift.event.replacementCutoffHours,
          replacementWantedAt: su.replacementWantedAt?.toISOString() ?? null,
          replacementNote: su.replacementNote,
          departmentName: su.shift.event.department.name,
          departmentSlug: su.shift.event.department.slug,
          departmentOrganization: su.shift.event.department.organization,
          createdAt: su.createdAt.toISOString(),
          isSignup: true,
          isResponsible: false,
          responsibleRole: null,
        });
      }

      for (const sr of shiftResp) {
        const existing = map.get(sr.shift.id);
        if (existing) {
          existing.isResponsible = true;
          existing.responsibleRole = 'Schichtleitung';
        } else {
          map.set(sr.shift.id, {
            signupId: `resp-${sr.shift.id}`,
            shiftId: sr.shift.id,
            taskId: null,
            taskTitle: null,
            title: sr.shift.title,
            category: sr.shift.category,
            description: sr.shift.description,
            startTime: sr.shift.startTime.toISOString(),
            endTime: sr.shift.endTime.toISOString(),
            eventId: sr.shift.event.id,
            eventTitle: sr.shift.event.title,
            eventSlug: sr.shift.event.slug,
            eventStartDate: sr.shift.event.startDate.toISOString(),
            cancelDeadlineDays: sr.shift.event.cancelDeadlineDays,
            cateringTokensEnabled: sr.shift.event.cateringTokensEnabled,
            departmentName: sr.shift.event.department.name,
            departmentSlug: sr.shift.event.department.slug,
            departmentOrganization: sr.shift.event.department.organization,
            createdAt: sr.createdAt.toISOString(),
            isSignup: false,
            isResponsible: true,
            responsibleRole: 'Schichtleitung',
          });
        }
      }

      for (const dr of dayResp) {
        for (const s of dr.event.shifts) {
          const shiftDate = toZurichInput(s.startTime).slice(0, 10);
          if (shiftDate === dr.dayDate) {
            const existing = map.get(s.id);
            if (existing) {
              existing.isResponsible = true;
              existing.responsibleRole = existing.responsibleRole
                ? `${existing.responsibleRole} & Tagesleitung`
                : 'Tagesleitung';
            } else {
              map.set(s.id, {
                signupId: `dayresp-${s.id}`,
                shiftId: s.id,
                taskId: null,
                taskTitle: null,
                title: s.title,
                category: s.category,
                description: s.description,
                startTime: s.startTime.toISOString(),
                endTime: s.endTime.toISOString(),
                eventId: dr.event.id,
                eventTitle: dr.event.title,
                eventSlug: dr.event.slug,
                eventStartDate: dr.event.startDate.toISOString(),
                cancelDeadlineDays: dr.event.cancelDeadlineDays,
                cateringTokensEnabled: dr.event.cateringTokensEnabled,
                departmentName: dr.event.department.name,
                departmentSlug: dr.event.department.slug,
                departmentOrganization: dr.event.department.organization,
                createdAt: dr.createdAt.toISOString(),
                isSignup: false,
                isResponsible: true,
                responsibleRole: 'Tagesleitung',
              });
            }
          }
        }
      }

      if (map.size > 0) {
        const shiftIds = [...map.keys()];
        const detailedShifts = await fastify.prisma.shift.findMany({
          where: { id: { in: shiftIds } },
          include: {
            responsibles: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            signups: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true, nickname: true },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
            event: {
              select: {
                id: true,
                responsibleMode: true,
                dayCutoffTime: true,
                contactVisibility: true,
                contactUser: {
                  select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
                },
                dayResponsibles: {
                  include: {
                    user: {
                      select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true },
                    },
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        });

        for (const ds of detailedShifts) {
          const item = map.get(ds.id);
          if (!item) continue;
          const visibility = ds.event.contactVisibility || 'BOTH';
          const cutoff = ds.event.dayCutoffTime || '04:00';
          const bDay = businessDayKey(ds.startTime.toISOString(), cutoff);
          const shiftDate = toZurichInput(ds.startTime).slice(0, 10);

          const shiftRespDtos = ds.responsibles.map((sr) => toResponsiblePersonDto(sr, visibility));
          const dayRespDtos = ds.event.dayResponsibles
            .filter((dr) => dr.dayDate === bDay || dr.dayDate === shiftDate)
            .map((dr) => toResponsiblePersonDto(dr, visibility));

          item.responsibles =
            ds.event.responsibleMode === 'BY_DAY'
              ? dayRespDtos.length > 0
                ? dayRespDtos
                : shiftRespDtos
              : shiftRespDtos.length > 0
                ? shiftRespDtos
                : dayRespDtos;

          item.contactUser = ds.event.contactUser
            ? toResponsiblePersonDto({ user: ds.event.contactUser }, visibility)
            : null;

          item.coHelpers = ds.signups
            .filter((su) => su.userId !== request.user.id)
            .map((su) => (su.user ? su.user.nickname || su.user.firstName : su.guestName || 'Gast'))
            .filter(Boolean);

          item.filledSlots = ds.signups.length;
          item.requiredSlots = ds.requiredSlots;
          item.dayCutoffTime = cutoff;
        }
      }

      return Array.from(map.values()).sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    }
  );
};

export default shiftsMyRoutes;
