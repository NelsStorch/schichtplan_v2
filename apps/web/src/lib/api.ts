import { useEffect, useState } from 'react';
import { getDepartmentSetupUrl, getLoginUrl } from '@schichtplan/shared';
import { recordLastSyncTime } from './offline';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Ganze Fehlerantwort des Backends (z. B. code, missingFields) */
    public data: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/** fetch-Wrapper: wirft ApiError mit der Fehlermeldung des Backends. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || data?.message || 'Etwas ist schiefgelaufen', res.status, data ?? {});
  }
  // Wenn online und nicht aus dem SW-Cache: Synchronisationszeitpunkt aktualisieren
  if (
    typeof window !== 'undefined' &&
    (!init?.method || init.method.toUpperCase() === 'GET') &&
    navigator.onLine &&
    !res.headers.get('x-from-cache')
  ) {
    recordLastSyncTime();
  }
  return data as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Etwas ist schiefgelaufen';

/**
 * Login-URL für gerenderte Links: zuerst "/login" (identisch auf Server und Client),
 * nach dem Mount die echte SSO-URL mit Rücksprung auf die aktuelle Seite.
 */
export function useLoginHref() {
  const [href, setHref] = useState('/login');
  useEffect(() => setHref(loginUrl()), []);
  return href;
}

/** Zentrales SSO-Login (login.<domain>) mit Rücksprung auf die aktuelle Seite. */
export function loginUrl(returnTo?: string) {
  return getLoginUrl(returnTo);
}

/** Login-Portal: Abteilung und Stufen angeben, danach zurück auf die aktuelle Seite */
export function departmentSetupUrl(returnTo?: string) {
  return getDepartmentSetupUrl(returnTo);
}

/**
 * Abteilungs-Auswahl-URL für gerenderte Links: zuerst "/abteilung" (identisch auf Server und Client),
 * nach dem Mount die echte SSO-URL mit Rücksprung auf die aktuelle Seite.
 */
export function useDepartmentSetupHref() {
  const [href, setHref] = useState('/abteilung');
  useEffect(() => setHref(departmentSetupUrl()), []);
  return href;
}
