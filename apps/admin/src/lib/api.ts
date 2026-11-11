import { getDepartmentUrl, getLoginUrl, type OrganizationType } from '@schichtplan/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

/** Das Backend verlangt eine neue Anmeldung (zu alt oder nicht über Cevi.DB) */
export const REAUTH_EVENT = 'admin-reauth';
export const isReauthCode = (code: unknown): code is 'REAUTH_REQUIRED' | 'REAUTH_CEVIDB' =>
  code === 'REAUTH_REQUIRED' || code === 'REAUTH_CEVIDB';

/** fetch-Wrapper: wirft ApiError mit der Fehlermeldung des Backends. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && isReauthCode(data?.code)) {
      window.dispatchEvent(new CustomEvent(REAUTH_EVENT, { detail: { code: data.code, message: data.error } }));
    }
    throw new ApiError(data?.error || data?.message || 'Etwas ist schiefgelaufen', res.status, data?.code);
  }
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Etwas ist schiefgelaufen';

/** Zentrales SSO-Login (login.<domain>) mit Rücksprung auf die aktuelle Seite. */
export function loginUrl(returnTo?: string) {
  return getLoginUrl(returnTo);
}

/** Link auf eine Abteilungs-Subdomain (z. B. illnau.cevi-schichtplan.ch oder wald.pfadi-schichtplan.ch). */
export function departmentUrl(slug: string, path = '/', organization?: OrganizationType | string) {
  return getDepartmentUrl(slug, path, organization);
}

/** JSON an das Backend schicken (POST/PUT/PATCH/DELETE) */
export function send<T = { success: boolean }>(path: string, method: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
