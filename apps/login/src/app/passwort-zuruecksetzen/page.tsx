'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Button, Callout, Field } from '@schichtplan/ui';
import { AuthShell } from '@/components/AuthShell';
import { PasswordInput } from '@/components/PasswordInput';

/** Link aus der E-Mail «Passwort zurücksetzen»: neues Passwort zweimal eingeben. */
function ResetPassword() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = searchParams.get('token');
    setToken(value);
    setInvalidLink(!value);
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Die beiden Passwörter sind nicht gleich.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'INVALID_TOKEN') setInvalidLink(true);
        throw new Error(data.error || 'Das hat nicht geklappt.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="animate-fade-up">
          <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            Passwort geändert
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Melde dich jetzt mit deiner E-Mail und dem neuen Passwort an. Auf anderen Geräten bist du abgemeldet.
          </p>
          <Button size="lg" className="mt-8 w-full" onClick={() => (window.location.href = '/')}>
            Zur Anmeldung
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (invalidLink) {
    return (
      <AuthShell>
        <div className="animate-fade-up space-y-5">
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            Link abgelaufen
          </h1>
          <p className="text-[15px] leading-relaxed text-fg-muted">
            Dieser Link ist ungültig, schon gebraucht oder älter als 2 Stunden. Fordere einfach einen neuen an.
          </p>
          <Button size="lg" className="w-full" onClick={() => (window.location.href = '/passwort-vergessen')}>
            Neuen Link anfordern
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit} className="animate-fade-up">
        <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
          <KeyRound className="size-6" />
        </span>
        <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
          Neues Passwort
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
          Wähle ein Passwort mit mindestens 8 Zeichen, das du nirgends sonst brauchst.
        </p>

        <div className="mt-8 space-y-5">
          {error && <Callout tone="danger">{error}</Callout>}
          <Field label="Neues Passwort" required hint="Mindestens 8 Zeichen.">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              autoFocus
              required
            />
          </Field>
          <Field label="Nochmals" required>
            <PasswordInput
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={saving} disabled={!password || !repeat}>
            {saving ? 'Wird gespeichert …' : 'Passwort speichern'}
          </Button>
          <p className="text-center text-sm">
            <Link href="/" className="font-medium text-accent-ink underline-offset-4 hover:underline">
              Zurück zur Anmeldung
            </Link>
          </p>
        </div>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <ResetPassword />
    </Suspense>
  );
}
