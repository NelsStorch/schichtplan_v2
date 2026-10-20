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

/** Gültigkeit des Tokens, passend zum Cookie (30 Tage) */
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const DEV_JWT_SECRET = 'super-secret-development-key-min-32-chars';

/** In Produktion muss ein eigenes, langes Secret gesetzt sein; sonst liesse sich jedes Token fälschen. */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === DEV_JWT_SECRET) {
      throw new Error('JWT_SECRET fehlt, ist kürzer als 32 Zeichen oder ist das Entwicklungs-Secret');
    }
    return secret;
  }
  return secret || DEV_JWT_SECRET;
}

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = resolveJwtSecret();

  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret,
    sign: { expiresIn: AUTH_TOKEN_TTL_SECONDS },
    cookie: {
      cookieName: AUTH_COOKIE_NAME,
      signed: false,
    },
  });

  /**
   * Token prüfen und die Person frisch aus der DB laden: Ein Token gilt bis zu 30 Tage. Gelöschte
   * Konten sollen sofort draussen sein, und `isGlobalAdmin` gilt nur, solange es in der DB steht.
   */
  async function verifyAndLoad(request: FastifyRequest): Promise<boolean> {
    try {
      await request.jwtVerify();
    } catch {
      return false;
    }
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, email: true, isGlobalAdmin: true, passwordChangedAt: true },
    });
    if (!user) return false;
    // Nach einem neuen Passwort gelten ältere Tokens nicht mehr (iat ist in Sekunden)
    const issuedAt = (request.user as { iat?: number }).iat;
    if (user.passwordChangedAt && issuedAt !== undefined && (issuedAt + 1) * 1000 <= user.passwordChangedAt.getTime()) {
      return false;
    }
    request.user = {
      id: user.id,
      email: user.email || request.user.email,
      isGlobalAdmin: user.isGlobalAdmin,
    };
    return true;
  }

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await verifyAndLoad(request))) {
      return reply.status(401).send({ error: 'Nicht autorisiert' });
    }
  });

  fastify.decorate('requireGlobalAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await verifyAndLoad(request))) {
      return reply.status(401).send({ error: 'Nicht autorisiert' });
    }
    if (!request.user.isGlobalAdmin) {
      return reply.status(403).send({ error: 'Kein Zugriff' });
    }
  });

  fastify.decorate('optionalAuthenticate', async (request: FastifyRequest) => {
    // Ohne gültiges Token (oder mit Token eines gelöschten Kontos) gilt die Anfrage als anonym
    if (!(await verifyAndLoad(request))) {
      (request as { user?: unknown }).user = undefined;
    }
  });
};

export default fp(jwtPlugin);
