'use client';

import { useEffect } from 'react';
import { getLoginUrl } from '@schichtplan/shared';
import { ProfileView } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { usePortal } from '@/lib/portal';

/**
 * Profil direkt auf der Abteilungs-Subdomain (<abteilung>.cevi-schichtplan.ch/profil). Gleicher Inhalt
 * wie auf der Startseite (gemeinsame ProfileView), damit Push auch in der installierten App eingerichtet werden kann.
 */
export default function DepartmentProfilePage() {
  const { user, setUser, loading, department, logout } = usePortal();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl(window.location.href);
    }
  }, [loading, user]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6">
        {!user ? (
          <div className="h-40 animate-pulse rounded-card bg-surface-2" aria-busy />
        ) : (
          <ProfileView
            user={user}
            onUserChange={setUser}
            currentDepartmentSlug={department?.slug}
            onLogout={logout}
          />
        )}
      </div>
    </AppShell>
  );
}
