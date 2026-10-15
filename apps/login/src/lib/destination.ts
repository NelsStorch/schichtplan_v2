import { getDefaultDestination, safeReturnTo } from '@schichtplan/shared/redirect';

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
  return returnTo ? `${path}?return_to=${encodeURIComponent(returnTo)}` : path;
}
