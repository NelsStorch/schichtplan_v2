'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link2 } from 'lucide-react';
import { Button, Callout, CeviLogo, Field, Input, ThemeToggle } from '@schichtplan/ui';
import { cleanReturnTo, withReturnTo } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';

/**
 * Nach dem Cevi.DB-Login: Es gibt schon ein Konto mit Passwort und derselben E-Mail.
 * Mit dem Passwort wird es mit Cevi.DB verknüpft (ein Konto für beides). Ohne Passwort kein Login,
 * weil es zwei Konten mit derselben E-Mail nicht geben darf.
 */
function LinkAccount() {
  const searchParams = useSearchParams();
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string | null; name: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setReturnTo(cleanReturnTo(searchParams.get('return_to')));
    fetch('/api/auth/cevidb/link', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setInfo(await res.json());
      })
      .catch(() => setMissing(true));
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/cevidb/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Das hat nicht geklappt.');
      setDone(true);
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
      setSaving(false);
    }
  };

  const cancel = async () => {
    await fetch('/api/auth/cevidb/link', { method: 'DELETE' }).catch(() => undefined);
    window.location.href = withReturnTo('/', returnTo);
  };

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <CeviLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Cevi Schichtplan</span>
        </span>
        <ThemeToggle />
      </header>

      <main id="inhalt" className="relative mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pb-16">
        {missing ? (
          <div className="animate-fade-up space-y-5">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              Verknüpfung abgelaufen
            </h1>
            <p className="text-[15px] leading-relaxed text-fg-muted">
              Melde dich bitte nochmals mit Cevi.DB an. Danach fragen wir wieder nach deinem Passwort.
            </p>
            <Button size="lg" className="w-full" onClick={() => (window.location.href = withReturnTo('/', returnTo))}>
              Zur Anmeldung
            </Button>
          </div>
        ) : !info ? (
          <div className="space-y-3" aria-busy>
            <div className="h-10 w-3/4 animate-pulse rounded-field bg-surface-2" />
            <div className="h-32 animate-pulse rounded-card bg-surface-2" />
          </div>
        ) : (
          <form onSubmit={submit} className="animate-fade-up">
            <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
              <Link2 className="size-6" />
            </span>
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              Du hast schon ein Konto
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              Zu <span className="font-medium text-fg">{info.email}</span> gibt es ein Konto mit Passwort. Gib das
              Passwort ein, dann verbinden wir es mit Cevi.DB. Deine Schichten und Rollen bleiben, und du meldest
              dich danach auf beide Arten an.
            </p>

            <div className="mt-8 space-y-5">
              {error && <Callout tone="danger">{error}</Callout>}
              <Field label="Passwort" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={saving} disabled={!password || done}>
                Verknüpfen und anmelden
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={cancel} disabled={saving}>
                Abbrechen
              </Button>
              <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
                Passwort vergessen?{' '}
                <a
                  href={withReturnTo(
                    `/passwort-vergessen${info.email ? `?email=${encodeURIComponent(info.email)}` : ''}`,
                    returnTo
                  )}
                  className="font-medium text-accent-ink underline-offset-4 hover:underline"
                >
                  Neues Passwort setzen
                </a>
                , danach nochmals mit Cevi.DB anmelden. Zwei Konten mit derselben E-Mail gibt es nicht.
              </p>
            </div>
          </form>
        )}
      </main>

      <AuthFooter />
    </div>
  );
}

export default function LinkAccountPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <LinkAccount />
    </Suspense>
  );
}
