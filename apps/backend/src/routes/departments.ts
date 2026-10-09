import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { RegisterDepartmentSchema } from '@schichtplan/shared';

const departmentRoutes: FastifyPluginAsync = async (fastify) => {
  // Current department (auf Subdomain)
  fastify.get('/api/departments/current', async (request, reply) => {
    if (!request.tenant) {
      return reply.status(404).send({ error: 'Keine Abteilung für diese Subdomain gefunden' });
    }

    return {
      id: request.tenant.id,
      name: request.tenant.name,
      slug: request.tenant.slug,
      logoUrl: request.tenant.logoUrl,
      primaryColor: request.tenant.primaryColor,
      contactEmail: request.tenant.contactEmail,
      createdAt: request.tenant.createdAt.toISOString(),
    };
  });

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

  // Neue Abteilung registrieren (von Hauptseite aus)
  fastify.post('/api/departments', async (request, reply) => {
    const parse = RegisterDepartmentSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const {
      departmentName,
      slug,
      adminFirstName,
      adminLastName,
      adminCeviName,
      adminEmail,
      adminPassword,
      adminPhone,
    } = parse.data;

    const normalizedSlug = slug.toLowerCase();

    // Prüfen, ob Slug bereits existiert
    const existingDept = await fastify.prisma.department.findUnique({
      where: { slug: normalizedSlug },
    });

    if (existingDept) {
      return reply.status(409).send({ error: 'Diese Subdomain ist bereits vergeben' });
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    // Transaktion: Abteilung + Admin-User + Zuordnung anlegen
    const result = await fastify.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email: adminEmail.toLowerCase() },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: adminEmail.toLowerCase(),
            passwordHash,
            firstName: adminFirstName,
            lastName: adminLastName,
            ceviName: adminCeviName || null,
            phone: adminPhone || null,
          },
        });
      }

      const department = await tx.department.create({
        data: {
          name: departmentName,
          slug: normalizedSlug,
          contactEmail: adminEmail.toLowerCase(),
        },
      });

      await tx.departmentMember.create({
        data: {
          departmentId: department.id,
          userId: user.id,
          role: 'ADMIN',
        },
      });

      return { department, user };
    });

    const token = fastify.jwt.sign({
      id: result.user.id,
      email: result.user.email,
      isGlobalAdmin: result.user.isGlobalAdmin,
    });

    return {
      department: {
        id: result.department.id,
        name: result.department.name,
        slug: result.department.slug,
      },
      token,
      message: 'Abteilung erfolgreich erstellt!',
    };
  });
};

export default departmentRoutes;
