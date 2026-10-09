import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { LoginSchema, RegisterHelperSchema } from '@schichtplan/shared';

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Login
  fastify.post('/api/auth/login', async (request, reply) => {
    const parse = LoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { email, password } = parse.data;
    const user = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: { department: true },
        },
      },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.status(401).send({ error: 'E-Mail oder Passwort falsch' });
    }

    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      isGlobalAdmin: user.isGlobalAdmin,
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        isGlobalAdmin: user.isGlobalAdmin,
      },
    };
  });

  // Register Helper (für aktuelle Abteilung)
  fastify.post('/api/auth/register-helper', async (request, reply) => {
    const parse = RegisterHelperSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.issues[0].message });
    }

    const { email, password, firstName, lastName, ceviName, phone } = parse.data;
    const existing = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Diese E-Mail ist bereits registriert' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await fastify.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        ceviName: ceviName || null,
        phone: phone || null,
      },
    });

    // Falls auf einer Abteilungs-Subdomain, verknüpfe User automatisch als HELPER
    if (request.tenant) {
      await fastify.prisma.departmentMember.create({
        data: {
          departmentId: request.tenant.id,
          userId: user.id,
          role: 'HELPER',
        },
      });
    }

    const token = fastify.jwt.sign({
      id: user.id,
      email: user.email,
      isGlobalAdmin: false,
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        isGlobalAdmin: false,
      },
    };
  });

  // Get current user profile
  fastify.get(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.id },
        include: {
          memberships: {
            where: request.tenant ? { departmentId: request.tenant.id } : undefined,
            include: { department: true },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'Benutzer nicht gefunden' });
      }

      const currentMembership = request.tenant
        ? user.memberships.find((m) => m.departmentId === request.tenant!.id)
        : null;

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ceviName: user.ceviName,
        phone: user.phone,
        isGlobalAdmin: user.isGlobalAdmin,
        departmentRole: currentMembership ? currentMembership.role : null,
      };
    }
  );

  // Logout
  fastify.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });
};

export default authRoutes;
