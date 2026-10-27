'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DepartmentDto, DepartmentPermission, UserDto } from '@schichtplan/shared';
import { applyAccent } from '@schichtplan/ui';
import { api, errorMessage } from './api';
import { updateFavicon } from './favicon';

interface PortalState {
  department: DepartmentDto | null;
  user: UserDto | null;
  setUser: (user: UserDto | null) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Abteilungsleitung (oder globaler Admin): hat alle Rechte */
  isDeptAdmin: boolean;
  /** Wirksame Rechte in dieser Abteilung (vom Backend berechnet) */
  permissions: ReadonlySet<DepartmentPermission>;
  can: (permission: DepartmentPermission) => boolean;
}

const PortalContext = createContext<PortalState | null>(null);

/**
 * Lädt Abteilung (Mandant via Subdomain) und Session genau einmal pro Seitenaufruf
 * und setzt die Abteilungsfarbe als Akzent für das ganze Design-System.
 */
export function PortalProvider({ children }: { children: ReactNode }) {
  const [department, setDepartment] = useState<DepartmentDto | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [dept, me] = await Promise.all([
        api<DepartmentDto>('/api/departments/current'),
        api<UserDto>('/api/auth/me').catch(() => null),
      ]);
      setDepartment(dept);
      setUser(me);
      setError(null);
      applyAccent(dept.primaryColor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (department) {
      updateFavicon(department.logoUrl);
    }
  }, [department?.logoUrl]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/';
  }, []);

  const isDeptAdmin = Boolean(user && (user.departmentRole === 'ADMIN' || user.isGlobalAdmin));
  const permissions = useMemo(() => new Set(user?.departmentPermissions ?? []), [user]);
  const can = useCallback((permission: DepartmentPermission) => permissions.has(permission), [permissions]);

  return (
    <PortalContext.Provider
      value={{ department, user, setUser, loading, error, refresh, logout, isDeptAdmin, permissions, can }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal() braucht <PortalProvider>');
  return ctx;
}

export const displayName = (user: Pick<UserDto, 'ceviName' | 'firstName'>) => user.ceviName || user.firstName;
