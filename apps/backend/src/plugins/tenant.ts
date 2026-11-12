import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Department, OrganizationType } from '../db.js';
import { getOrganizationTypeFromHost, RESERVED_SUBDOMAINS } from '@schichtplan/shared';
import { departmentCache } from '../services/departmentCache.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Department | null;
    organization: OrganizationType;
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
  if (parts.length >= 3 || (host.endsWith('.localhost') && parts.length >= 2)) {
    const subdomain = parts[0];
    if (RESERVED_SUBDOMAINS.includes(subdomain as any)) {
      return null;
    }
    return subdomain;
  }

  return null;
}

/** Darf der Header `x-tenant-slug` die Abteilung bestimmen? Ausserhalb von Produktion immer, sonst nur intern. */
export function tenantHeaderAllowed(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return !headers['x-forwarded-for'] && !headers['x-forwarded-host'];
}

const tenantPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('tenant', null);
  fastify.decorateRequest('organization', 'CEVI');

  fastify.addHook('preHandler', async (request) => {
    const allowHeader = tenantHeaderAllowed(request.headers);
    const headerOrg = request.headers['x-tenant-org'];
    const organization: OrganizationType =
      typeof headerOrg === 'string' && headerOrg.trim().length > 0 && allowHeader
        ? getOrganizationTypeFromHost(headerOrg)
        : getOrganizationTypeFromHost(request.headers.host);
    request.organization = organization;

    // 1. Abteilung per Header: lokal (Next-Proxy, Tests) und für interne Aufrufe der Frontends
    //    (z. B. Link-Vorschau). Von aussen gilt in Produktion nur der Host: Traefik setzt immer
    //    X-Forwarded-For, eine Anfrage über den Proxy kann sich die Abteilung so nicht aussuchen.
    const headerSlug = request.headers['x-tenant-slug'];
    let slug: string | null = null;

    if (typeof headerSlug === 'string' && headerSlug.trim().length > 0 && allowHeader) {
      slug = headerSlug.trim().toLowerCase();
    } else {
      // 2. Extract from Host header
      slug = extractSubdomain(request.headers.host);
    }

    if (slug) {
      const department = await departmentCache.getDepartment(fastify.prisma, organization, slug);
      request.tenant = department;
    } else {
      request.tenant = null;
    }
  });
};

export default fp(tenantPlugin);
