/**
 * Hilfen für API-Tests gegen eine echte Test-Datenbank (TEST_DATABASE_URL, z. B. ein Wegwerf-Postgres
 * mit `npx prisma migrate deploy`). Alle Tabellen werden vor jedem Test geleert.
 */
import type { FastifyInstance, InjectOptions } from 'fastify';
import { DEPARTMENT_PERMISSION_PRESETS, type OrganizationType } from '@schichtplan/shared';
import { buildApp } from '../src/app.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DATABASE_URL);

export async function createTestApp(): Promise<FastifyInstance> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
  delete process.env.SMTP_PASSWORD; // keine echten Mails
  const app = await buildApp();
  app.log.level = 'silent';
  await app.ready();
  return app;
}

/** Alle Tabellen leeren (ausser Prismas Migrationstabelle) */
export async function resetDb(app: FastifyInstance) {
  const tables = await app.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await app.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createDepartment(app: FastifyInstance, data: { slug?: string; name?: string; membersOnly?: boolean } = {}) {
  const slug = data.slug ?? `abt${unique()}`;
  return app.prisma.department.create({
    data: { slug, name: data.name ?? `Cevi ${slug}`, membersOnly: data.membersOnly ?? false },
  });
}

export async function createUser(
  app: FastifyInstance,
  data: Partial<{
    email: string | null;
    passwordHash: string | null;
    provider: OrganizationType;
    providerId: string | null;
    ceviDbId: number | null;
    nickname: string | null;
    ceviName: string | null;
    phone: string | null;
    firstName: string;
    lastName: string;
    birthDate: Date | null;
    isGlobalAdmin: boolean;
    emailVerified: boolean;
    homeDepartmentId: string | null;
    homeDepartmentSource: string | null;
  }> = {}
) {
  const providerId =
    data.providerId !== undefined
      ? data.providerId
      : data.ceviDbId !== undefined && data.ceviDbId !== null
      ? String(data.ceviDbId)
      : null;
  const provider = data.provider ?? 'CEVI';
  const nickname = data.nickname !== undefined ? data.nickname : data.ceviName ?? null;

  return app.prisma.user.create({
    data: {
      email: data.email === undefined ? `u${unique()}@example.com` : data.email,
      passwordHash: data.passwordHash ?? null,
      provider,
      providerId,
      nickname,
      phone: data.phone ?? null,
      firstName: data.firstName ?? 'Test',
      lastName: data.lastName ?? 'Person',
      birthDate: data.birthDate ?? null,
      isGlobalAdmin: data.isGlobalAdmin ?? false,
      emailVerified: data.emailVerified ?? true,
      homeDepartmentId: data.homeDepartmentId ?? null,
      homeDepartmentSource:
        data.homeDepartmentSource !== undefined
          ? data.homeDepartmentSource
          : data.homeDepartmentId
            ? (providerId ? 'CEVIDB' : 'SELF')
            : null,
    },
  });
}

/** Bisherige Rolle «Planung» = Vorlage «Anlass-Koordination» */
export const COORDINATION = [...DEPARTMENT_PERMISSION_PRESETS.EVENT_COORDINATION.permissions];

export async function addMember(
  app: FastifyInstance,
  departmentId: string,
  userId: string,
  role: 'ADMIN' | 'HELPER',
  permissions: string[] = []
) {
  return app.prisma.departmentMember.create({ data: { departmentId, userId, role, permissions } });
}

export async function createEvent(
  app: FastifyInstance,
  departmentId: string,
  data: Partial<{
    slug: string;
    accessType: string;
    organizerId: string;
    allowPublicSignup: boolean;
    contactVisibility: string;
  }> = {}
) {
  return app.prisma.event.create({
    data: {
      departmentId,
      title: 'Chilbi',
      slug: data.slug ?? `ev${unique()}`,
      startDate: new Date('2030-06-01T08:00:00Z'),
      endDate: new Date('2030-06-02T20:00:00Z'),
      accessType: data.accessType ?? 'PUBLIC',
      allowPublicSignup: data.allowPublicSignup ?? true,
      contactVisibility: data.contactVisibility ?? 'BOTH',
      organizers: data.organizerId
        ? { create: [{ userId: data.organizerId, role: 'OK_LEAD', roleTitle: 'Event-Leitung' }] }
        : undefined,
    },
  });
}

export async function createShift(
  app: FastifyInstance,
  eventId: string,
  data: Partial<{ minAge: number | null; requiredSlots: number; title: string; startTime: Date; endTime: Date }> = {}
) {
  const requiredSlots = data.requiredSlots ?? 3;
  return app.prisma.shift.create({
    data: {
      eventId,
      title: data.title ?? 'Bar',
      startTime: data.startTime ?? new Date('2030-06-01T18:00:00Z'),
      endTime: data.endTime ?? new Date('2030-06-01T22:00:00Z'),
      requiredSlots,
      minAge: data.minAge ?? null,
      tasks: { create: [{ title: data.title ?? 'Bar', requiredSlots, minAge: null }] },
    },
    include: { tasks: true },
  });
}

/** Cookie-Header für eine angemeldete Person */
export function authCookie(app: FastifyInstance, user: { id: string; email: string | null; isGlobalAdmin?: boolean }) {
  const token = app.jwt.sign({ id: user.id, email: user.email ?? `${user.id}@x`, isGlobalAdmin: user.isGlobalAdmin ?? false });
  return `token=${token}`;
}

/** Anfrage an die API im Kontext einer Abteilung (x-tenant-slug) */
export function inject(
  app: FastifyInstance,
  opts: InjectOptions & { tenant?: string; cookie?: string }
) {
  const { tenant, cookie, headers, ...rest } = opts;
  return app.inject({
    ...rest,
    headers: {
      ...(headers ?? {}),
      ...(tenant ? { 'x-tenant-slug': tenant } : {}),
      ...(cookie ? { cookie } : {}),
    },
  });
}
