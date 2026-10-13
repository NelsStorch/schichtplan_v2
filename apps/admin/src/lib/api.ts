export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** fetch-Wrapper: wirft ApiError mit der Fehlermeldung des Backends. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || data?.message || 'Etwas ist schiefgelaufen', res.status);
  }
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Etwas ist schiefgelaufen';

/** Zentrales SSO-Login (login.<domain>) mit Rücksprung auf die aktuelle Seite. */
export function loginUrl(returnTo?: string) {
  const target = encodeURIComponent(returnTo || window.location.href);
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1') {
    return `http://localhost:3002/?return_to=${target}`;
  }
  const rootDomain = hostname.split('.').slice(-2).join('.');
  return `${protocol}//login.${rootDomain}/?return_to=${target}`;
}

/** Link auf eine Abteilungs-Subdomain (z. B. illnau.cevi-schichtplan.ch). */
export function departmentUrl(slug: string, path = '/') {
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1') {
    return `${protocol}//${slug}.localhost:3000${path}`;
  }
  const rootDomain = hostname.split('.').slice(-2).join('.');
  return `${protocol}//${slug}.${rootDomain}${path}`;
}
