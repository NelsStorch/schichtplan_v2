'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getLoginUrl, type UserDto } from '@schichtplan/shared';
import { Callout, ProfileView, ThemeToggle, useOrganization } from '@schichtplan/ui';
import { BrandLogo } from '@/components/BrandLogo';

/** Profilseite auf der Startseite (cevi-schichtplan.ch/profil), gleicher Inhalt wie in den Abteilungs-Apps */
export default function ProfilePage() {
  const org = useOrganization();
  const [user, setUser] = useState<UserDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.status === 401) {
        window.location.href = getLoginUrl(window.location.href);
        return;
      }
      if (!res.ok) throw new Error();
      setUser((await res.json()) as UserDto);
    })().catch(() => setError('Profil konnte nicht geladen werden.'));
  }, []);

  return (
    <div className="min-h-[100dvh] bg-canvas text-fg">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-campfire opacity-80" />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-fg-muted transition hover:text-fg">
          <ArrowLeft className="size-4" /> <BrandLogo logoUrl={org.logoUrl} alt={org.name} className="size-7" /> {org.name}
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
        {user ? (
          <ProfileView user={user} onUserChange={setUser} />
        ) : error ? (
          <Callout tone="danger">{error}</Callout>
        ) : (
          <div className="h-40 animate-pulse rounded-card bg-surface-2" aria-busy />
        )}
      </main>
    </div>
  );
}
