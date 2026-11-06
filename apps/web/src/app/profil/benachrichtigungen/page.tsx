'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, ShieldCheck } from 'lucide-react';
import { getLoginUrl } from '@schichtplan/shared';
import { NotificationSettings } from '@schichtplan/ui';
import { AppShell } from '@/components/AppShell';
import { usePortal } from '@/lib/portal';

export default function NotificationsPage() {
  const { user, setUser, loading } = usePortal();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl(window.location.href);
    }
  }, [loading, user]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 py-4">
        {/* Breadcrumb / Zurück */}
        <div className="flex items-center justify-between">
          <Link
            href="/profil"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted hover:text-fg transition"
          >
            <ArrowLeft className="size-3.5" /> Zurück zum Profil
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <ShieldCheck className="size-3.5 text-success-ink" /> Deine Daten bleiben geschützt
          </div>
        </div>

        {/* Kopfbereich */}
        <div className="rounded-card border border-line bg-surface p-5 sm:p-6 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent-ink">
              <Bell className="size-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-fg">
                Benachrichtigungen &amp; Mitteilungen
              </h1>
              <p className="text-xs text-fg-muted">
                Wähle aus, für welche Ereignisse du E-Mails oder Browser-Push-Mitteilungen erhalten möchtest.
              </p>
            </div>
          </div>
        </div>

        {/* Einstellungs-Komponente */}
        {user && (
          <div className="rounded-card border border-line bg-surface p-5 sm:p-6 shadow-sm">
            <NotificationSettings user={user} onUserChange={(u) => setUser(u)} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
