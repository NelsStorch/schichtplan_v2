'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Mail } from 'lucide-react';
import { Button, Callout, Field, Input } from '@schichtplan/ui';
import { getOrganization, type OrganizationConfig } from '@schichtplan/shared';
import { AuthShell } from '@/components/AuthShell';
import { cleanReturnTo, withReturnTo } from '@/lib/destination';

/** «Passwort vergessen»: E-Mail eingeben, der Link kommt per Mail (gleiche Antwort, ob es das Konto gibt oder nicht). */
function ForgotPassword() {
  const searchParams = useSearchParams();
  const [org, setOrg] = useState<OrganizationConfig>(() => getOrganization('cevi-schichtplan.ch'));
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrg(getOrganization(window.location.host));
    }
  }, []);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReturnTo(cleanReturnTo(searchParams.get('return_to')));
    setEmail(searchParams.get('email') ?? '');
  }, [searchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Das hat nicht geklappt.');
      setSent(data.message || 'Wir haben dir einen Link geschickt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="animate-fade-up">
          <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
            <Mail className="size-6" />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            Schau in dein Postfach
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{sent}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">Der Link ist 2 Stunden gültig.</p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-8 w-full"
            onClick={() => (window.location.href = withReturnTo('/', returnTo))}
          >
            Zur Anmeldung
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="animate-fade-up">
          <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
            <KeyRound className="size-6" />
          </span>
          <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
            Passwort vergessen?
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
            Gib die E-Mail deines Kontos ein. Wir schicken dir einen Link, mit dem du ein neues Passwort setzt.
          </p>

          <div className="mt-8 space-y-5">
            {error && <Callout tone="danger">{error}</Callout>}
            <Field label="E-Mail" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={sending} disabled={!email.trim()}>
              Link schicken
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => (window.location.href = withReturnTo('/', returnTo))}
            >
              Zurück zur Anmeldung
            </Button>
            <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
              {org.slug !== 'verein'
                ? `Mit ${org.authProviderShort} oder ${org.nicknameTerm} brauchst du kein Passwort: Melde dich einfach wieder so an.`
                : `Mit ${org.nicknameTerm} brauchst du kein Passwort: Melde dich einfach wieder so an.`}
            </p>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <ForgotPassword />
    </Suspense>
  );
}
