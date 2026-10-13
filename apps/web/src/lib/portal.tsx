'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DepartmentDto, UserDto } from '@schichtplan/shared';
import { applyAccent } from '@schichtplan/ui';
import { api, errorMessage } from './api';
import { updateFavicon } from './favicon';

interface PortalState {
  department: DepartmentDto | null;
  user: UserDto | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Abteilungsleitung (oder globaler Admin) */
  isDeptAdmin: boolean;
  /** Abteilungsleitung oder Schichtplaner:in */
  isPlanner: boolean;
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

  const role = user?.departmentRole;
  const isDeptAdmin = Boolean(user && (role === 'ADMIN' || user.isGlobalAdmin));
  const isPlanner = Boolean(isDeptAdmin || role === 'PLANNER');

  return (
    <PortalContext.Provider
      value={{ department, user, loading, error, refresh, logout, isDeptAdmin, isPlanner }}
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
