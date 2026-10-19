import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Eingeloggt und in der Datenbank als globaler Admin geführt (nicht nur laut Token). */
    requireGlobalAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      email: string;
      isGlobalAdmin: boolean;
    };
  }
}

/**
 * Name des Login-Cookies. Dev braucht einen eigenen Namen: das Prod-Cookie gilt für
 * `.cevi-schichtplan.ch` und wird auch an `*.dev.cevi-schichtplan.ch` gesendet. Mit gleichem Namen
 * las das Dev-Backend das (ältere) Prod-Cookie, lehnte es ab (andere JWT_SECRET) und schickte
 * zurück aufs Login: Endlosschleife.
 */
export const AUTH_COOKIE_NAME = process.env.COOKIE_NAME || 'token';

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.JWT_SECRET || 'super-secret-development-key-min-32-chars';

  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret,
    cookie: {
      cookieName: AUTH_COOKIE_NAME,
      signed: false,
    },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Nicht autorisiert' });
    }
  });

  // Der Token wird bis zu 30 Tage getragen: die Admin-Rolle gilt nur, solange sie in der DB steht
  fastify.decorate('requireGlobalAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Nicht autorisiert' });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { isGlobalAdmin: true },
    });
    if (!user?.isGlobalAdmin) {
      return reply.status(403).send({ error: 'Kein Zugriff' });
    }
  });

  fastify.decorate('optionalAuthenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      // Optional: no error returned if token is absent or invalid
    }
  });
};

export default fp(jwtPlugin);
