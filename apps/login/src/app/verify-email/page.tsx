'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  Button,
  Callout,
  Field,
  Input,
} from '@schichtplan/ui';
import { getLandingUrl } from '@schichtplan/shared/redirect';
import { cleanReturnTo, withReturnTo } from '@/lib/destination';
import { AuthShell } from '@/components/AuthShell';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const errorParam = searchParams.get('error');
  const returnTo = cleanReturnTo(searchParams.get('return_to'));

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    errorParam === 'missing_token' ? 'Kein Bestätigungstoken angegeben.' : null
  );

  // Formular zum erneuten Anfordern eines Links im Fehlerfall
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const [landingHref, setLandingHref] = useState('/');
  useEffect(() => setLandingHref(getLandingUrl()), []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));

        if (!isMounted) return;

        if (res.ok) {
          setSuccess(data.message || 'Deine E-Mail-Adresse wurde erfolgreich bestätigt.');
        } else {
          setError(data.error || 'Der Bestätigungslink ist ungültig oder abgelaufen.');
        }
      } catch {
        if (isMounted) {
          setError('Verbindung zum Server fehlgeschlagen. Bitte versuche es später nochmals.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) return;

    setResending(true);
    setResendMessage(null);

    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Fehler beim Senden des Bestätigungslinks.');
      }

      setResendMessage({
        tone: 'success',
        text: data.message || 'Neuer Bestätigungslink wurde gesendet.',
      });
    } catch (err: any) {
      setResendMessage({
        tone: 'danger',
        text: err.message || 'Fehler beim Senden des Bestätigungslinks.',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell returnTo={returnTo} landingHref={landingHref} showBackLink={true}>
      <div className="animate-fade-up">
        {loading && (
          <div className="text-center">
            <Loader2 className="mx-auto size-10 animate-spin text-accent-ink" />
            <h1 className="mt-4 font-display text-[1.5rem] font-semibold tracking-tight text-fg">
              E-Mail-Adresse wird bestätigt …
            </h1>
            <p className="mt-2 text-sm text-fg-muted">Einen kleinen Moment bitte.</p>
          </div>
        )}

        {!loading && success && (
          <div className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-8" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              E-Mail bestätigt!
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{success}</p>
            <Button size="lg" className="mt-8 w-full" onClick={() => (window.location.href = withReturnTo('/', returnTo))}>
              Zur Anmeldung
            </Button>
          </div>
        )}

        {!loading && error && (
          <div>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              Bestätigung fehlgeschlagen
            </h1>
            <div className="mt-3">
              <Callout tone="danger">{error}</Callout>
            </div>

            <div className="mt-8 rounded-card border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold text-fg">Neuen Link anfordern</h2>
              <p className="mt-1 text-xs text-fg-muted">
                Gib deine registrierte E-Mail-Adresse ein, um einen neuen Bestätigungslink zu erhalten.
              </p>

              {resendMessage && (
                <div className="mt-3">
                  <Callout tone={resendMessage.tone}>{resendMessage.text}</Callout>
                </div>
              )}

              <form onSubmit={handleResend} className="mt-4 space-y-3">
                <Field label="E-Mail" required>
                  <Input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="deine.email@beispiel.ch"
                    autoComplete="email"
                    required
                  />
                </Field>
                <Button type="submit" loading={resending} className="w-full">
                  {resending ? 'Wird gesendet …' : 'Bestätigungslink senden'}
                </Button>
              </form>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/"
                className="text-sm font-medium text-accent-ink underline-offset-4 hover:underline"
              >
                Zurück zur Anmeldung
              </Link>
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-accent-ink" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
