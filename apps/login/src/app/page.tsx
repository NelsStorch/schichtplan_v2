'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ChevronRight, Database, KeyRound, UserRound, Mail, CheckCircle2 } from 'lucide-react';
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
import { PRIVACY_URL, getLandingUrl, helpUrl, statusUrl } from '@schichtplan/shared/redirect';
import type { CeviNameLoginErrorCode, DepartmentDirectoryItemDto, StufeRole } from '@schichtplan/shared';
import { afterLogin, cleanReturnTo, departmentSlugFromReturnTo, withReturnTo } from '@/lib/destination';

type View = 'start' | 'ceviname' | 'ceviname_new' | 'password' | 'verify_sent';

const STUFE_OPTIONS: { value: StufeRole | null; label: string }[] = [
  { value: null, label: 'Nein' },
  { value: 'TEILNEHMER', label: 'Teilnehmer*in' },
  { value: 'LEITUNG', label: 'Leitung' },
];

/** 2010-03-14 → 14.03.2010 */
const fmtBirthDate = (iso: string) => iso.split('-').reverse().join('.');

// Fehlercodes, mit denen das Backend nach einem gescheiterten Cevi.DB-Login hierher zurückleitet
const loginErrors: Record<string, string> = {
  cevidb_unavailable:
    'Die Anmeldung mit Cevi.DB ist im Moment nicht verfügbar. Melde dich bitte mit Cevi-Name oder E-Mail an.',
  cevidb_denied: 'Die Anmeldung bei Cevi.DB wurde abgebrochen.',
  cevidb_failed: 'Die Anmeldung mit Cevi.DB hat nicht geklappt. Bitte versuche es nochmals.',
  cevidb_email_taken:
    'Die E-Mail aus deinem Cevi.DB-Profil gehört schon zu einem anderen Cevi.DB-Konto. Melde dich bitte bei den Betreibern des Schichtplans.',
};

/** Hostname des Ziels (z. B. illnau.cevi-schichtplan.ch), damit sichtbar ist, wohin es nach dem Login geht. */
function destinationHost(returnTo: string | null): string | null {
  if (!returnTo) return null;
  try {
    return new URL(returnTo).host || null;
  } catch {
    return null;
  }
}

function LoginContent() {
  const searchParams = useSearchParams();
  // Erst im Browser auswerten (braucht window.location): sonst rendert der Server ohne Ziel und
  // der Browser mit Ziel, und React meldet einen Hydration-Fehler
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => setReturnTo(cleanReturnTo(searchParams.get('return_to'))), [searchParams]);
  const destination = destinationHost(returnTo);
  const [landingHref, setLandingHref] = useState('/');
  useEffect(() => setLandingHref(getLandingUrl()), []);

  const [view, setView] = useState<View>('start');
  const [redirecting, setRedirecting] = useState(false);

  // Cevi-Name: nur, wenn die Person von einer Abteilung kommt (Login gilt nur für diese Abteilung)
  const [department, setDepartment] = useState<DepartmentDirectoryItemDto | null>(null);
  const [quickCeviName, setQuickCeviName] = useState('');
  const [quickBirthDate, setQuickBirthDate] = useState('');
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickStufen, setQuickStufen] = useState<Record<string, StufeRole>>({});
  // Hinweis mit passendem Knopf, wenn das Konto einen anderen Login braucht
  const [errorAction, setErrorAction] = useState<'cevidb' | 'password' | null>(null);

  useEffect(() => {
    const slug = departmentSlugFromReturnTo(returnTo);
    if (!slug) return;
    fetch('/api/departments/directory')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: DepartmentDirectoryItemDto[]) => setDepartment(list.find((d) => d.slug === slug) ?? null))
      .catch(() => setDepartment(null));
  }, [returnTo]);

  // E-Mail & Passwort
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regCeviName, setRegCeviName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => loginErrors[searchParams.get('error') ?? ''] ?? null
  );
  const [success, setSuccess] = useState<string | null>(null);

  // E-Mail-Verifikation
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

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
    setErrorAction(null);
    setSuccess(null);
    setResendNotice(null);
  };

  const handleResend = async (targetEmail: string) => {
    if (!targetEmail.trim()) return;
    setResending(true);
    setResendNotice(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Fehler beim Senden.');
      setResendNotice({ tone: 'success', text: data.message || 'Neuer Bestätigungslink gesendet!' });
    } catch (err: any) {
      setResendNotice({ tone: 'danger', text: err.message || 'Fehler beim Senden.' });
    } finally {
      setResending(false);
    }
  };

  /** Cevi-Name-Login und -Registrierung: Antwort auswerten, bei Erfolg weiterleiten */
  const handleCeviNameResponse = async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSuccess(`Hallo ${data.user.ceviName || data.user.firstName}. Du wirst weitergeleitet …`);
      setTimeout(() => {
        window.location.href = afterLogin(data.user, returnTo);
      }, 700);
      return;
    }
    const code = data.code as CeviNameLoginErrorCode | undefined;
    if (code === 'NOT_FOUND') {
      setView('ceviname_new');
      return;
    }
    if (code === 'EXISTS') setView('ceviname');
    setErrorAction(code === 'USE_CEVIDB' ? 'cevidb' : code === 'USE_PASSWORD' ? 'password' : null);
    setError(data.error || 'Das hat nicht geklappt. Bitte versuche es nochmals.');
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) return;
    setError(null);
    setErrorAction(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/ceviname-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentSlug: department.slug,
          ceviName: quickCeviName.trim(),
          birthDate: quickBirthDate,
          returnTo: returnTo ?? undefined,
        }),
      });
      await handleCeviNameResponse(res);
    } catch {
      setError('Keine Verbindung. Bitte versuche es nochmals.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!department) return;
    setError(null);
    setErrorAction(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/ceviname-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentSlug: department.slug,
          ceviName: quickCeviName.trim(),
          birthDate: quickBirthDate,
          firstName: quickFirstName.trim() || undefined,
          lastName: quickLastName.trim() || undefined,
          stufen: Object.entries(quickStufen).map(([stufeId, role]) => ({ stufeId, role })),
          returnTo: returnTo ?? undefined,
        }),
      });
      await handleCeviNameResponse(res);
    } catch {
      setError('Keine Verbindung. Bitte versuche es nochmals.');
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
              lastName: regLastName.trim() || undefined,
              ceviName: regCeviName.trim() || undefined,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.requiresVerification) {
          setUnverifiedEmail(email);
        }
        throw new Error(data.error || (authMode === 'login' ? 'Anmeldung fehlgeschlagen. Bitte versuche es nochmals.' : 'Konto konnte nicht erstellt werden. Bitte versuche es nochmals.'));
      }

      if (data.requiresVerification) {
        setView('verify_sent');
        return;
      }

      setSuccess(
        authMode === 'login'
          ? 'Angemeldet. Du wirst weitergeleitet …'
          : 'Konto erstellt. Du wirst weitergeleitet …'
      );
      setTimeout(() => {
        window.location.href = afterLogin(data.user, returnTo);
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const cevidbAuthUrl = returnTo
    ? `/api/auth/cevidb/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/cevidb/login';

  const feedback = (
    <>
      {error && (
        <div className="space-y-2 animate-fade-in">
          <Callout tone="danger">
            {error}
          </Callout>
          {errorAction === 'cevidb' && (
            <a href={cevidbAuthUrl} className={buttonClasses({ className: 'w-full justify-between' })}>
              Mit Cevi.DB anmelden <ArrowUpRight />
            </a>
          )}
          {errorAction === 'password' && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setAuthMode('login');
                goTo('password');
              }}
            >
              <KeyRound /> Mit E-Mail und Passwort anmelden
            </Button>
          )}
          {unverifiedEmail && (
            <div className="rounded-xl border border-line bg-surface p-3 text-xs flex flex-col gap-2">
              <span className="text-fg-muted">Bestätigungslink nicht erhalten?</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={resending}
                disabled={resending}
                onClick={() => handleResend(unverifiedEmail)}
              >
                Neuen Bestätigungslink anfordern
              </Button>
            </div>
          )}
        </div>
      )}
      {resendNotice && (
        <Callout tone={resendNotice.tone} className="animate-fade-in">
          {resendNotice.text}
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
            </div>

            <div className="my-9 flex items-center gap-4 text-xs text-fg-subtle">
              <span className="h-px flex-1 bg-line" />
              <span>oder</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface/70">
              {/* Ohne Passwort nur, wenn die Person von einer Abteilung kommt: das Profil gehört zu dieser */}
              {department && (
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
                        Ohne Passwort, für Helfer*innen bei {department.name}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                  </button>
                </li>
              )}
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

        {view === 'ceviname' && department && (
          <form key="ceviname" onSubmit={handleQuickSubmit} className="animate-fade-up">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              Mit Cevi-Name anmelden
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              Für {department.name}. Kein Passwort nötig: Cevi-Name und Geburtsdatum sind dein Schlüssel.
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
                  required
                  minLength={2}
                  maxLength={60}
                />
              </Field>

              <Field
                label="Geburtsdatum"
                required
                hint="Gleich wie beim ersten Mal. So unterscheiden wir Personen mit gleichem Namen."
              >
                <Input
                  type="date"
                  value={quickBirthDate}
                  onChange={(e) => setQuickBirthDate(e.target.value)}
                  autoComplete="bday"
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </Field>

              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={quickCeviName.trim().length < 2 || !quickBirthDate || !!success}
                className="w-full"
              >
                Weiter
              </Button>
            </div>
          </form>
        )}

        {view === 'ceviname_new' && department && (
          <form key="ceviname_new" onSubmit={handleQuickRegister} className="animate-fade-up">
            <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
              Neu bei {department.name}?
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              Wir haben kein Profil für «{quickCeviName.trim()}», geboren am {fmtBirthDate(quickBirthDate)}, gefunden.
              Tippfehler?{' '}
              <button
                type="button"
                onClick={() => goTo('ceviname')}
                className="font-medium text-accent-ink underline-offset-4 hover:underline"
              >
                Nochmals eingeben
              </button>
            </p>

            <div className="mt-8 space-y-5">
              {feedback}

              <Callout tone="warning" title="Wichtiger Sicherheitshinweis: Kein Passwort-Schutz">
                <p className="mt-1 text-[13px] leading-relaxed text-fg">
                  Dieses Profil hat <strong>kein Passwort</strong>. Jede Person, die deinen Cevi-Namen und dein Geburtsdatum kennt, kann sich in deinen Account einloggen.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                  Wenn du dein Profil mit einem Passwort schützen möchtest oder Aufgaben im OK übernimmst, nutze stattdessen die Anmeldung mit{' '}
                  <button
                    type="button"
                    onClick={() => goTo('start')}
                    className="font-medium text-accent-ink underline-offset-4 hover:underline"
                  >
                    Cevi.DB oder E-Mail
                  </button>
                  .
                </p>
              </Callout>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Vorname">
                  <Input
                    type="text"
                    value={quickFirstName}
                    onChange={(e) => setQuickFirstName(e.target.value)}
                    autoComplete="given-name"
                    maxLength={80}
                  />
                </Field>
                <Field label="Nachname (freiwillig)" hint="Freiwillig">
                  <Input
                    type="text"
                    value={quickLastName}
                    onChange={(e) => setQuickLastName(e.target.value)}
                    autoComplete="family-name"
                    maxLength={80}
                  />
                </Field>
              </div>

              {department.stufen.length > 0 && (
                <section aria-labelledby="stufen-titel">
                  <h2 id="stufen-titel" className="text-sm font-semibold text-fg">
                    In welchen Stufen bist du dabei?
                  </h2>
                  <p className="mt-1 text-[13px] text-fg-subtle">Wähle alle, die passen. Keine ist auch in Ordnung.</p>
                  <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface/70">
                    {department.stufen.map((stufe) => {
                      const role = quickStufen[stufe.id] ?? null;
                      return (
                        <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <span className="text-sm font-semibold text-fg">{stufe.name}</span>
                          <div
                            role="radiogroup"
                            aria-label={`Rolle in ${stufe.name}`}
                            className="flex rounded-full bg-surface-2 p-0.5"
                          >
                            {STUFE_OPTIONS.map((option) => (
                              <button
                                key={option.label}
                                type="button"
                                role="radio"
                                aria-checked={role === option.value}
                                onClick={() =>
                                  setQuickStufen((prev) => {
                                    const next = { ...prev };
                                    if (option.value) next[stufe.id] = option.value;
                                    else delete next[stufe.id];
                                    return next;
                                  })
                                }
                                className={cn(
                                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                                  role === option.value ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <Button type="submit" size="lg" loading={loading} disabled={!!success} className="w-full">
                Profil anlegen und weiter
              </Button>
              <p className="px-1 text-[13px] leading-relaxed text-fg-subtle">
                Beim nächsten Mal meldest du dich hier wieder mit Cevi-Name und Geburtsdatum an. Für Aufgaben im OK
                brauchst du ein Konto mit Cevi.DB oder mit E-Mail und Passwort.
              </p>
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
                  <Field label="Nachname (freiwillig)" hint="Freiwillig">
                    <Input
                      type="text"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      autoComplete="family-name"
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

              {authMode === 'login' && (
                <p className="-mt-2 text-right text-sm">
                  <a
                    href={withReturnTo(
                      `/passwort-vergessen${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`,
                      returnTo
                    )}
                    className="font-medium text-accent-ink underline-offset-4 hover:underline"
                  >
                    Passwort vergessen?
                  </a>
                </p>
              )}

              {authMode === 'register' && (
                <Field label="Cevi-Name">
                  <Input
                    type="text"
                    value={regCeviName}
                    onChange={(e) => setRegCeviName(e.target.value)}
                    autoComplete="nickname"
                  />
                </Field>
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

        {view === 'verify_sent' && (
          <div key="verify_sent" className="animate-fade-up">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Mail className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg">
              E-Mail bestätigen
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
              Wir haben einen Bestätigungslink an{' '}
              <strong className="font-semibold text-fg">{email}</strong> gesendet.
            </p>
            <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-xs leading-relaxed text-fg-subtle">
              Bitte klicke auf den Link in der E-Mail, um dein Konto zu aktivieren.
              Prüfe bitte auch deinen Spam-Ordner, falls die E-Mail nicht innerhalb weniger Minuten ankommt.
            </div>

            {resendNotice && (
              <div className="mt-4">
                <Callout tone={resendNotice.tone}>{resendNotice.text}</Callout>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                loading={resending}
                disabled={resending}
                onClick={() => handleResend(email)}
                className="w-full"
              >
                Bestätigungs-E-Mail erneut senden
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => {
                  setView('password');
                  setAuthMode('login');
                  setError(null);
                  setResendNotice(null);
                }}
                className="w-full"
              >
                Zurück zum Login
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="relative mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-fg-subtle sm:px-8">
        <span>&copy; {new Date().getFullYear()} Cevi Schichtplan</span>
        <div className="flex items-center gap-5">
          <a href={statusUrl()} className="font-medium text-fg-muted transition hover:text-fg">
            Status
          </a>
          <a href={helpUrl('/start/anmelden/')} className="font-medium text-fg-muted transition hover:text-fg">
            Hilfe zum Anmelden
          </a>
          <a href={PRIVACY_URL} className="font-medium text-fg-muted transition hover:text-fg">
            Datenschutz
          </a>
          <a
            href={returnTo ?? landingHref}
            className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-3.5" />
            Ohne Anmeldung zurück
          </a>
        </div>
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
