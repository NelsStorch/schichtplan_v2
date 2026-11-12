'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Button, Callout, BrandLogo, Field, Input, ThemeToggle, useOrganization } from '@schichtplan/ui';
import { afterLogin, cleanReturnTo, withReturnTo } from '@/lib/destination';
import { AuthFooter } from '@/components/AuthFooter';

/**
 * Zweiter Schritt der Anmeldung: Passwort (oder Cevi.DB) ist bestätigt, jetzt fehlt noch der Code aus
 * der Authenticator-App. Erst danach setzt der Server das Login-Cookie.
 */
function TwoFactor() {
  const searchParams = useSearchParams();
  const org = useOrganization();
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [viaProvider, setViaProvider] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setReturnTo(cleanReturnTo(searchParams.get('return_to')));
    fetch('/api/auth/2fa/challenge', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setViaProvider(Boolean(data.viaProvider));
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, [searchParams]);

  const submit = async (e?: FormEvent, value: string = code) => {
    e?.preventDefault();
    if (saving || done) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'CHALLENGE_EXPIRED') setState('missing');
        throw new Error(data.error || 'Das hat nicht geklappt.');
      }
      setDone(true);
      const target = data.redirectUrl || afterLogin(data.user, returnTo, org.dbType);
      if (typeof data.recoveryCodesLeft === 'number' && data.recoveryCodesLeft <= 3) {
        // Kurz stehen lassen, damit der Hinweis gelesen werden kann
        setNotice(
          `Du hast noch ${data.recoveryCodesLeft} Wiederherstellungscode${data.recoveryCodesLeft === 1 ? '' : 's'}. Erstelle im Profil neue Codes.`
        );
        setTimeout(() => (window.location.href = target), 4000);
        return;
      }
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
      setCode('');
      setSaving(false);
    }
  };

  const onCodeChange = (value: string) => {
    setError(null);
    if (useRecovery) {
      setCode(value);
      return;
    }
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // Sechs Ziffern komplett: gleich absenden (wie bei den meisten Diensten)
    if (digits.length === 6 && !saving && !done) void submit(undefined, digits);
  };

  const cancel = async () => {
    await fetch('/api/auth/2fa/challenge', { method: 'DELETE' }).catch(() => undefined);
    window.location.href = withReturnTo('/', returnTo);
  };

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">{org.name}</span>
        </span>
        <ThemeToggle />
      </header>

      <main id="inhalt" className="relative mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pb-16">
        {state === 'missing' ? (
          <div className="animate-fade-up space-y-5">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              Anmeldung abgelaufen
            </h1>
            <p className="text-[15px] leading-relaxed text-fg-muted">
              Der Code muss innert 10 Minuten nach dem Passwort eingegeben werden. Melde dich bitte nochmals an.
            </p>
            <Button size="lg" className="w-full" onClick={() => (window.location.href = withReturnTo('/', returnTo))}>
              Zur Anmeldung
            </Button>
          </div>
        ) : state === 'loading' ? (
          <div className="space-y-3" aria-busy>
            <div className="h-10 w-3/4 animate-pulse rounded-field bg-surface-2" />
            <div className="h-32 animate-pulse rounded-card bg-surface-2" />
          </div>
        ) : (
          <form onSubmit={submit} className="animate-fade-up">
            <span className="mb-5 flex size-12 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
              <ShieldCheck className="size-6" />
            </span>
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              {useRecovery ? 'Wiederherstellungscode' : 'Code aus der App'}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
              {useRecovery
                ? 'Gib einen deiner Wiederherstellungscodes ein. Jeder Code funktioniert nur einmal.'
                : `${viaProvider ? `Die Anmeldung bei ${org.authProviderShort} hat geklappt. ` : ''}Öffne deine Authenticator-App und gib den 6-stelligen Code für ${org.name} ein.`}
            </p>

            <div className="mt-8 space-y-5">
              {error && <Callout tone="danger">{error}</Callout>}
              {notice && <Callout tone="warning">{notice}</Callout>}
              <Field label={useRecovery ? 'Wiederherstellungscode' : '6-stelliger Code'} required>
                <Input
                  key={useRecovery ? 'recovery' : 'totp'}
                  autoFocus
                  value={code}
                  onChange={(e) => onCodeChange(e.target.value)}
                  inputMode={useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={useRecovery ? 'xxxxx-xxxxx' : '123456'}
                  maxLength={useRecovery ? 20 : 6}
                  className={useRecovery ? 'font-mono' : 'font-mono text-center text-lg tracking-[0.4em]'}
                  required
                />
              </Field>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={saving}
                disabled={done || (useRecovery ? code.trim().length < 10 : code.length !== 6)}
              >
                Anmelden
              </Button>
              <button
                type="button"
                onClick={() => {
                  setUseRecovery((v) => !v);
                  setCode('');
                  setError(null);
                }}
                className="w-full text-center text-[13px] font-medium text-accent-ink underline-offset-4 hover:underline"
              >
                {useRecovery ? 'Doch mit dem Code aus der App' : 'Kein Zugriff auf die App? Wiederherstellungscode verwenden'}
              </button>
              <Button type="button" variant="ghost" className="w-full" onClick={cancel} disabled={saving}>
                Abbrechen
              </Button>
              <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
                Handy und Wiederherstellungscodes verloren? Melde dich bei den Betreibern des Schichtplans. Sie können
                die Zwei-Faktor-Anmeldung nach einer Prüfung zurücksetzen.
              </p>
            </div>
          </form>
        )}
      </main>

      <AuthFooter />
    </div>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <TwoFactor />
    </Suspense>
  );
}
