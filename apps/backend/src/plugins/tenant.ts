import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Department } from '@prisma/client';
import { RESERVED_SUBDOMAINS } from '@schichtplan/shared';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Department | null;
  }
}

export function extractSubdomain(hostHeader?: string): string | null {
  if (!hostHeader) return null;

  // Remove port if present
  const host = hostHeader.split(':')[0].toLowerCase();

  // If localhost or IP address without subdomain
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return null;
  }

  // Split by dot
  const parts = host.split('.');
  if (parts.length >= 3) {
    const subdomain = parts[0];
    if (RESERVED_SUBDOMAINS.includes(subdomain as any)) {
      return null;
    }
    return subdomain;
  }

  return null;
}

const tenantPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('tenant', null);

  fastify.addHook('preHandler', async (request) => {
    // 1. Check explicit header first (helpful for local dev or API clients)
    const headerSlug = request.headers['x-tenant-slug'];
    let slug: string | null = null;

    if (typeof headerSlug === 'string' && headerSlug.trim().length > 0) {
      slug = headerSlug.trim().toLowerCase();
    } else {
      // 2. Extract from Host header
      slug = extractSubdomain(request.headers.host);
    }

    if (slug) {
      const department = await fastify.prisma.department.findUnique({
        where: { slug },
      });
      request.tenant = department;
    } else {
      request.tenant = null;
    }
  });
};

export default fp(tenantPlugin);
