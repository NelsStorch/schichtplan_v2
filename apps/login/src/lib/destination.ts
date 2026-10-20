import { getDefaultDestination, safeReturnTo } from '@schichtplan/shared/redirect';
import { RESERVED_SUBDOMAINS } from '@schichtplan/shared/constants';

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
  user: { homeDepartment?: { slug: string } | null } | null | undefined
): string {
  return returnTo ?? getDefaultDestination(user?.homeDepartment?.slug);
}

/** Wer seine Abteilung noch nicht angegeben hat, kommt zuerst auf /abteilung (mit dem gleichen Ziel). */
export function afterLogin(
  user: { needsDepartmentSetup?: boolean; homeDepartment?: { slug: string } | null } | null | undefined,
  returnTo: string | null
): string {
  if (user?.needsDepartmentSetup) {
    return returnTo ? `/abteilung?return_to=${encodeURIComponent(returnTo)}` : '/abteilung';
  }
  return finalDestination(returnTo, user);
}

/** Pfad im Login-Portal mit unverändertem Ziel */
export function withReturnTo(path: string, returnTo: string | null): string {
  if (!returnTo) return path;
  return `${path}${path.includes('?') ? '&' : '?'}return_to=${encodeURIComponent(returnTo)}`;
}
