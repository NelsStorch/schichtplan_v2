import { getDefaultDestination, safeReturnTo } from '@schichtplan/shared/redirect';
import { RESERVED_SUBDOMAINS } from '@schichtplan/shared/constants';
import type { OrganizationType } from '@schichtplan/shared';

/**
 * Abteilung, von der die Person kommt (illnau.cevi-schichtplan.ch → «illnau»), sonst null.
 * Der Login mit Cevi-Name gibt es nur in diesem Fall.
 */
export function departmentSlugFromReturnTo(returnTo: string | null): string | null {
  if (!returnTo || typeof window === 'undefined') return null;
  let host: string;
  try {
    host = new URL(returnTo).hostname.toLowerCase();
  } catch {
    return null;
  }
  const own = window.location.hostname.toLowerCase();
  const root = own === 'localhost' || own === '127.0.0.1' ? 'localhost' : own.replace(/^login\./, '');
  if (!host.endsWith(`.${root}`)) return null;
  const sub = host.slice(0, -(root.length + 1));
  if (!sub || sub.includes('.') || (RESERVED_SUBDOMAINS as readonly string[]).includes(sub)) return null;
  return sub;
}

/**
 * Weiterleitungsziel aus ?return_to, nur auf der eigenen Domain (login.<domain> → <domain> und Subdomains).
 * null = kein Ziel angegeben (direkt auf der Login-Seite gelandet).
 */
export function cleanReturnTo(raw: string | null): string | null {
  if (!raw || typeof window === 'undefined') return null;
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const cleaned = safeReturnTo(raw, host.replace(/^login\./, ''), { allowLocalhost: isLocal, fallback: '' });
  // "/" wäre wieder die Login-Seite selbst (früher Endlosschleife)
  return cleaned && cleaned !== '/' ? cleaned : null;
}

/** Ziel ohne return_to: eigene Abteilung, sonst Landingpage. Nie zurück auf die Login-Seite. */
export function finalDestination(
  returnTo: string | null,
  user?: { homeDepartment?: { slug: string; organization?: OrganizationType } | null } | null,
  org?: OrganizationType | string
): string {
  const targetOrg = user?.homeDepartment?.organization ?? org;
  return returnTo ?? getDefaultDestination(user?.homeDepartment?.slug, targetOrg);
}

/** Wer per Einladung kommt oder über einen Abteilungslink einsteigt und noch kein Setup hat, landet auf /abteilung. */
export function afterLogin(
  user?: { needsDepartmentSetup?: boolean; homeDepartment?: { slug: string; organization?: OrganizationType } | null } | null,
  returnTo?: string | null,
  org?: OrganizationType | string,
  inviteToken?: string | null
): string {
  const hasDeptContext = Boolean(user?.homeDepartment) || Boolean(departmentSlugFromReturnTo(returnTo ?? null));
  if (inviteToken || (user?.needsDepartmentSetup && hasDeptContext)) {
    const params = new URLSearchParams();
    if (returnTo) params.set('return_to', returnTo);
    if (inviteToken) params.set('invite', inviteToken);
    const qs = params.toString();
    return qs ? `/abteilung?${qs}` : '/abteilung';
  }
  return finalDestination(returnTo ?? null, user, org);
}

/** Pfad im Login-Portal mit unverändertem Ziel (und optionalem Einladungs-Token) */
export function withReturnTo(path: string, returnTo: string | null, inviteToken?: string | null): string {
  const params = new URLSearchParams();
  if (returnTo) params.set('return_to', returnTo);
  if (inviteToken) params.set('invite', inviteToken);
  const qs = params.toString();
  if (!qs) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}
