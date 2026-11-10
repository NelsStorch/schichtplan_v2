'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { ORGANIZATIONS, type OrganizationConfig, type OrganizationSlug } from '@schichtplan/shared';

/**
 * Verband der aktuellen Domain (cevi, pfadi, jubla, verein). Das Server-Layout ermittelt ihn aus dem Host
 * und reicht ihn hier hinein: So rendert schon der Server das richtige Logo und den richtigen Namen,
 * statt erst nach der Hydration vom Cevi-Standard umzuschalten.
 */
const OrganizationContext = createContext<OrganizationSlug | null>(null);

export function OrganizationProvider({ slug, children }: { slug: OrganizationSlug; children: ReactNode }) {
  return <OrganizationContext.Provider value={slug}>{children}</OrganizationContext.Provider>;
}

/** Slug aus dem Provider, null ohne Provider (dann bleibt es beim bisherigen Verhalten) */
export function useOrganizationSlug(): OrganizationSlug | null {
  return useContext(OrganizationContext);
}

/** Konfiguration des Verbands dieser Domain (ohne Provider: Cevi) */
export function useOrganization(): OrganizationConfig {
  const slug = useContext(OrganizationContext);
  return ORGANIZATIONS[slug ?? 'cevi'];
}
