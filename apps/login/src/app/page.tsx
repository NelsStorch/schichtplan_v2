'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ChevronRight, Database, KeyRound, UserRound } from 'lucide-react';
import {
  Button,
  Callout,
  CeviLogo,
  Field,
  Input,
  ThemeToggle,
  buttonClasses,
  cn,
} from '@schichtplan/ui';
import { safeReturnTo } from '@schichtplan/shared/redirect';

type View = 'start' | 'ceviname' | 'password';

// Fehlercodes, mit denen das Backend nach einem gescheiterten Cevi.DB-Login hierher zurückleitet
const loginErrors: Record<string, string> = {
  cevidb_unavailable:
    'Die Anmeldung mit Cevi.DB ist im Moment nicht verfügbar. Melde dich bitte mit Cevi-Name oder E-Mail an.',
  cevidb_denied: 'Die Anmeldung bei Cevi.DB wurde abgebrochen.',
  cevidb_failed: 'Die Anmeldung mit Cevi.DB hat nicht geklappt. Bitte versuche es nochmals.',
};

/** Weiterleitungsziel nur auf der eigenen Domain zulassen (login.<domain> → <domain> und Subdomains). */
function cleanReturnTo(raw: string | null): string {
  if (typeof window === 'undefined') return '/';
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  return safeReturnTo(raw, host.replace(/^login\./, ''), { allowLocalhost: isLocal });
}

/** Hostname des Ziels (z. B. illnau.cevi-schichtplan.ch), damit sichtbar ist, wohin es nach dem Login geht. */
function destinationHost(returnTo: string): string | null {
  try {
    return new URL(returnTo).host || null;
  } catch {
    return null;
  }
}

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = cleanReturnTo(searchParams.get('return_to'));
  const destination = destinationHost(returnTo);

  const [view, setView] = useState<View>('start');
  const [redirecting, setRedirecting] = useState(false);

  // Cevi-Name
  const [quickCeviName, setQuickCeviName] = useState('');
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickBirthDate, setQuickBirthDate] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [showQuickDetails, setShowQuickDetails] = useState(false);

  // E-Mail & Passwort
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regCeviName, setRegCeviName] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => loginErrors[searchParams.get('error') ?? ''] ?? null
  );
  const [success, setSuccess] = useState<string | null>(null);

  // Fehlercode aus der Adresse entfernen, damit er nach einem Neuladen nicht erneut erscheint
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('error')) {
      url.searchParams.delete('error');
      window.history.replaceState(null, '', url);
    }
  }, []);

  // Zurück-Navigation aus Cevi.DB stellt die Seite aus dem bfcache wieder her: Ladezustand zurücksetzen
  useEffect(() => {
    const reset = () => setRedirecting(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const goTo = (next: View) => {
    setView(next);
    setError(null);
    setSuccess(null);
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/ceviname-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ceviName: quickCeviName.trim(),
          firstName: quickFirstName.trim() || undefined,
          lastName: quickLastName.trim() || undefined,
          birthDate: quickBirthDate || undefined,
          phone: quickPhone.trim() || undefined,
          returnTo,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.requiresPassword) {
          setView('password');
          setAuthMode('login');
        }
        throw new Error(data.error || 'Anmeldung fehlgeschlagen. Bitte versuche es nochmals.');
      }

      setSuccess(`Hallo ${data.user.ceviName || data.user.firstName}. Du wirst weitergeleitet …`);
      setTimeout(() => {
        window.location.href = data.redirectUrl || returnTo;
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register-helper';
      const payload =
        authMode === 'login'
          ? { email, password }
          : {
              email,
              password,
              firstName: regFirstName,
              lastName: regLastName,
              ceviName: regCeviName || undefined,
              phone: regPhone || undefined,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || (authMode === 'login' ? 'Anmeldung fehlgeschlagen. Bitte versuche es nochmals.' : 'Konto konnte nicht erstellt werden. Bitte versuche es nochmals.'));
      }

      setSuccess(
        authMode === 'login'
          ? 'Angemeldet. Du wirst weitergeleitet …'
          : 'Konto erstellt. Du wirst weitergeleitet …'
      );
      setTimeout(() => {
        window.location.href = returnTo;
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const cevidbAuthUrl = `/api/auth/cevidb/login?returnTo=${encodeURIComponent(returnTo)}`;

  const feedback = (
    <>
      {error && (
        <Callout tone="danger" className="animate-fade-in">
          {error}
        </Callout>
      )}
      {success && (
        <Callout tone="success" className="animate-fade-in">
          {success}
        </Callout>
      )}
    </>
  );

  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      {/* Feiner Schein von oben, sonst ruhige Fläche */}
      <div aria-hidden className="bg-campfire pointer-events-none fixed inset-x-0 top-0 h-[60vh] opacity-70" />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <CeviLogo className="size-8" alt="" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">
            Cevi Schichtplan
          </span>
        </span>
        <ThemeToggle />
      </header>

      <main
        id="inhalt"
        className="relative mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center px-5 pb-16 pt-6 sm:pt-0"
      >
        {view === 'start' && (
          <div key="start" className="animate-fade-up">
            <h1 className="font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-fg text-balance">
              Anmelden
            </h1>
            {destination ? (
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                Danach geht es weiter zu{' '}
                <span className="whitespace-nowrap font-medium text-fg">{destination}</span>.
              </p>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                Ein Login für alle Abteilungen und Anlässe.
              </p>
            )}

            <div className="mt-9 space-y-3">
              {feedback}
              <a
                href={cevidbAuthUrl}
                onClick={() => setRedirecting(true)}
                aria-busy={redirecting || undefined}
                className={buttonClasses({
                  size: 'lg',
                  className: cn('w-full justify-between', redirecting && 'pointer-events-none opacity-80'),
                })}
              >
                <span>{redirecting ? 'Weiterleitung zu Cevi.DB …' : 'Mit Cevi.DB anmelden'}</span>
                {redirecting ? (
                  <span
                    aria-hidden
                    className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                  />
                ) : (
                  <ArrowUpRight />
                )}
              </a>
              <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
                Du meldest dich auf <span className="font-mono text-fg-muted">db.cevi.ch</span> an
                und kommst danach automatisch hierher zurück.
              </p>
              <div className="pt-1 px-1">
                <Link
                  href="/cevidb-daten"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                >
                  <Database className="size-3.5" />
                  <span>Cevi.DB Daten-Inspektor (alle gelieferten Felder anzeigen)</span>
                </Link>
              </div>
            </div>

            <div className="my-9 flex items-center gap-4 text-xs text-fg-subtle">
              <span className="h-px flex-1 bg-line" />
              <span>oder</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface/70">
              <li>
                <button
                  type="button"
                  onClick={() => goTo('ceviname')}
                  className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted transition-colors group-hover:bg-surface-3 group-hover:text-fg">
                    <UserRound className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">Mit Cevi-Name</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-fg-subtle">
                      Ohne Passwort, für Helfer*innen, Eltern und Ehemalige
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goTo('password')}
                  className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted transition-colors group-hover:bg-surface-3 group-hover:text-fg">
                    <KeyRound className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">Mit E-Mail und Passwort</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-fg-subtle">
                      Anmelden oder Konto erstellen
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </li>
            </ul>
          </div>
        )}

        {view !== 'start' && (
          <button
            type="button"
            onClick={() => goTo('start')}
            className="-ml-2 mb-6 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-medium text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-4" />
            Alle Anmeldeoptionen
          </button>
        )}

        {view === 'ceviname' && (
          <form key="ceviname" onSubmit={handleQuickSubmit} className="animate-fade-up">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              Mit Cevi-Name anmelden
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              Kein Passwort nötig.
            </p>

            <div className="mt-8 space-y-5">
              {feedback}

              <Field label="Cevi-Name oder Vorname" required>
                <Input
                  type="text"
                  value={quickCeviName}
                  onChange={(e) => setQuickCeviName(e.target.value)}
                  autoComplete="nickname"
                  autoFocus
                  minLength={2}
                />
              </Field>

              <Field
                label="Geburtsdatum"
                hint="Nur nötig für Schichten mit Altersgrenze, z. B. an der Bar."
              >
                <Input
                  type="date"
                  value={quickBirthDate}
                  onChange={(e) => setQuickBirthDate(e.target.value)}
                  autoComplete="bday"
                />
              </Field>

              {showQuickDetails ? (
                <div className="animate-fade-in space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Vorname">
                      <Input
                        type="text"
                        value={quickFirstName}
                        onChange={(e) => setQuickFirstName(e.target.value)}
                        autoComplete="given-name"
                      />
                    </Field>
                    <Field label="Nachname">
                      <Input
                        type="text"
                        value={quickLastName}
                        onChange={(e) => setQuickLastName(e.target.value)}
                        autoComplete="family-name"
                      />
                    </Field>
                  </div>
                  <Field label="Handynummer" hint="Für Notfälle während deiner Schicht.">
                    <Input
                      type="tel"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value)}
                      autoComplete="tel"
                      placeholder="+41 79 000 00 00"
                    />
                  </Field>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQuickDetails(true)}
                  className="text-[13px] font-medium text-accent-ink underline-offset-4 transition hover:underline"
                >
                  Vor-, Nachname und Handynummer ergänzen
                </button>
              )}

              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!quickCeviName.trim() || !!success}
                className="w-full"
              >
                Weiter
              </Button>
            </div>
          </form>
        )}

        {view === 'password' && (
          <form key="password" onSubmit={handlePasswordSubmit} className="animate-fade-up">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              {authMode === 'login' ? 'Mit E-Mail anmelden' : 'Konto erstellen'}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              {authMode === 'login' ? 'Noch kein Konto? ' : 'Schon ein Konto? '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setError(null);
                }}
                className="font-medium text-accent-ink underline-offset-4 hover:underline"
              >
                {authMode === 'login' ? 'Konto erstellen' : 'Anmelden'}
              </button>
            </p>

            <div className="mt-8 space-y-5">
              {feedback}

              {authMode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vorname" required>
                    <Input
                      type="text"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      autoComplete="given-name"
                      minLength={2}
                    />
                  </Field>
                  <Field label="Nachname" required>
                    <Input
                      type="text"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      autoComplete="family-name"
                      minLength={2}
                    />
                  </Field>
                </div>
              )}

              <Field label="E-Mail" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </Field>

              <Field
                label="Passwort"
                required
                hint={authMode === 'register' ? 'Mindestens 8 Zeichen.' : undefined}
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  minLength={authMode === 'register' ? 8 : undefined}
                />
              </Field>

              {authMode === 'register' && (
                <>
                  <Field label="Cevi-Name">
                    <Input
                      type="text"
                      value={regCeviName}
                      onChange={(e) => setRegCeviName(e.target.value)}
                      autoComplete="nickname"
                    />
                  </Field>
                  <Field label="Handynummer">
                    <Input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      autoComplete="tel"
                      placeholder="+41 79 000 00 00"
                    />
                  </Field>
                </>
              )}

              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!!success}
                className="w-full"
              >
                {authMode === 'login' ? 'Anmelden' : 'Konto erstellen'}
              </Button>
            </div>
          </form>
        )}
      </main>

      <footer className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-fg-subtle sm:px-8">
        <span>&copy; {new Date().getFullYear()} Cevi Schichtplan</span>
        <a
          href={returnTo}
          className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-3.5" />
          Ohne Anmeldung zurück
        </a>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <LoginContent />
    </Suspense>
  );
}
