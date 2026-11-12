import { headers } from 'next/headers';
import { getRootDomain } from '@schichtplan/shared';
import { trustedHost } from '@schichtplan/ui/og';

export interface DepartmentPreview {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

/** Abteilungs-Slug aus dem Host (`illnau.cevi-schichtplan.ch` → `illnau`), null auf der Hauptdomain. */
export function slugFromHost(host: string): string | null {
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname === 'localhost') return process.env.DEV_TENANT_SLUG ?? (process.env.NODE_ENV === 'production' ? null : 'demo');
  const root = getRootDomain(hostname);
  if (hostname === root) return null;
  const sub = hostname.slice(0, -(root.length + 1));
  return sub && !sub.includes('.') ? sub : null;
}

/**
 * Öffentliche Eckdaten der Abteilung dieser Subdomain für Link-Vorschauen (Server-seitig, direkt am Backend).
 * Liefert null, wenn es keine Abteilung gibt oder das Backend nicht antwortet: die Vorschau fällt dann auf «Cevi Schichtplan» zurück.
 */
export async function getDepartmentPreview(): Promise<DepartmentPreview | null> {
  const backend = process.env.INTERNAL_API_URL;
  if (!backend) return null;
  const h = await headers();
  // Nur die eigene Domain (oder lokal localhost); sonst gibt es keine Abteilung
  const host = trustedHost(h.get('x-forwarded-host') ?? h.get('host'));
  const slug = slugFromHost(host);
  if (!slug) return null;
  try {
    const res = await fetch(new URL('/api/departments/current', backend), {
      // Verband mitschicken: intern ist der Host «backend», sonst gälte immer Cevi
      headers: { 'x-tenant-slug': slug, 'x-tenant-org': host },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as DepartmentPreview;
    return { name: d.name, slug: d.slug, logoUrl: d.logoUrl ?? null, primaryColor: d.primaryColor ?? null };
  } catch {
    return null;
  }
}
