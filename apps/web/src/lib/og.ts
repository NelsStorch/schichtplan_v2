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
  const d = await fetchPreview<DepartmentPreview>('/api/departments/current');
  return d ? { name: d.name, slug: d.slug, logoUrl: d.logoUrl ?? null, primaryColor: d.primaryColor ?? null } : null;
}

export interface EventPreview {
  title: string;
  slug: string;
  logoUrl: string | null;
  startDate: string;
  endDate: string;
  dayCutoffTime: string;
  /** null: Eintragen nicht mehr möglich */
  openSlots: number | null;
  updatedAt: string;
  bannerUrl: string | null;
  /** Nur mit Schicht-Link (`?schicht=ID`) */
  shift: {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    openSlots: number | null;
  } | null;
}

/**
 * Eckdaten eines Anlasses für die Link-Vorschau. Das Backend liefert nur, was die Anlass-Seite auch ohne Login
 * zeigt; bei Entwürfen und internen Anlässen von Abteilungen «nur für Mitglieder» kommt null (Abteilungs-Vorschau).
 */
export async function getEventPreview(eventSlug: string, shiftId?: string | null): Promise<EventPreview | null> {
  if (!/^[a-z0-9-]{1,200}$/i.test(eventSlug)) return null;
  const query = shiftId && isUuid(shiftId) ? `?schicht=${shiftId}` : '';
  return fetchPreview<EventPreview>(`/api/events/${encodeURIComponent(eventSlug)}/preview${query}`);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Öffentliche Vorschau-Daten der Abteilung dieser Subdomain direkt beim Backend holen (null bei Fehlern) */
async function fetchPreview<T>(apiPath: string): Promise<T | null> {
  const backend = process.env.INTERNAL_API_URL;
  if (!backend) return null;
  const h = await headers();
  // Nur die eigene Domain (oder lokal localhost); sonst gibt es keine Abteilung
  const host = trustedHost(h.get('x-forwarded-host') ?? h.get('host'));
  const slug = slugFromHost(host);
  if (!slug) return null;
  try {
    const res = await fetch(new URL(apiPath, backend), {
      // Verband mitschicken: intern ist der Host «backend», sonst gälte immer Cevi
      headers: { 'x-tenant-slug': slug, 'x-tenant-org': host },
      // Eckdaten ändern sich selten: kurz cachen, damit nicht jeder Seiten-Render, Prefetch und Bot das Backend trifft.
      // Der Cache-Schlüssel enthält die Header, gilt also pro Abteilung und Verband.
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Seitentitel für Link-Vorschauen: «Jubla Greifensee-Nänikon – Schichtplan» statt doppeltem «Jubla» */
export function previewTitle(departmentName: string | null | undefined, brandName: string): string {
  return departmentName ? `${departmentName} – Schichtplan` : brandName;
}

/** «Noch 12 Plätze frei» / «Alle Schichten besetzt» für die Anlass-Vorschau (null: nichts anzeigen) */
export function openSlotsLabel(openSlots: number | null, full = 'Alle Schichten besetzt'): string | null {
  if (openSlots === null) return null;
  if (openSlots === 0) return full;
  return openSlots === 1 ? 'Noch 1 Platz frei' : `Noch ${openSlots} Plätze frei`;
}

/**
 * Name der installierten App: «Schichtplan – Jubla Greifensee-Nänikon». Die meisten haben nur eine Abteilung,
 * darum steht «Schichtplan» vorne (und allein unter dem Icon, dort ist nur Platz für etwa 12 Zeichen).
 */
export function appName(departmentName: string | null | undefined): string {
  const name = departmentName?.trim();
  return name ? `Schichtplan – ${name}` : 'Schichtplan';
}
