'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  Button,
  Callout,
  BrandLogo,
  Field,
  Input,
  buttonClasses,
  cn,
  useOrganization,
} from '@schichtplan/ui';
import { VERBAND_ORGANIZATIONS, getLandingUrl, organizationSiteUrl } from '@schichtplan/shared/redirect';
import {
  type CeviNameLoginErrorCode,
  type DepartmentDirectoryItemDto,
  type StufeRole,
  type UserDto,
  type OrganizationConfig,
} from '@schichtplan/shared';
import { afterLogin, cleanReturnTo, departmentSlugFromReturnTo, withReturnTo } from '@/lib/destination';
import { AuthShell } from '@/components/AuthShell';
import { PasswordInput } from '@/components/PasswordInput';
import { BirthDateInput } from '@/components/BirthDateInput';

type View = 'start' | 'ceviname' | 'ceviname_new' | 'password' | 'verify_sent';

const STUFE_OPTIONS: { value: StufeRole | null; label: string }[] = [
  { value: null, label: 'Nein' },
  { value: 'TEILNEHMER', label: 'Teilnehmer*in' },
  { value: 'LEITUNG', label: 'Leitung' },
];

/** 2010-03-14 → 14.03.2010 */
const fmtBirthDate = (iso: string) => iso.split('-').reverse().join('.');

function getPasswordStrength(pwd: string): {
  score: number; // 0..4
  label: string;
  tone: 'danger' | 'warning' | 'info' | 'success';
} {
  if (!pwd) return { score: 0, label: '', tone: 'danger' };
  let s = 0;
  if (pwd.length >= 8) s++;
  if (pwd.length >= 12) s++;
  if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) s++;
  if (/[^a-zA-Z0-9]/.test(pwd)) s++;

  switch (s) {
    case 0:
    case 1:
      return { score: 1, label: 'Zu kurz (mind. 8 Zeichen)', tone: 'danger' };
    case 2:
      return { score: 2, label: 'Ausreichend', tone: 'warning' };
    case 3:
      return { score: 3, label: 'Gut', tone: 'info' };
    case 4:
      return { score: 4, label: 'Sehr stark', tone: 'success' };
    default:
      return { score: 1, label: 'Zu kurz', tone: 'danger' };
  }
}

// Dynamische Fehlermeldungen für Hitobito & Verbands-Logins
function getLoginErrorMessage(code: string, org: OrganizationConfig): string | null {
  switch (code) {
    case 'cevidb_unavailable':
    case 'hitobito_unavailable':
      return `Die Anmeldung mit ${org.authProviderShort} ist im Moment nicht verfügbar. Melde dich bitte mit E-Mail oder ${org.nicknameTerm} an.`;
    case 'cevidb_denied':
    case 'hitobito_denied':
      return `Die Anmeldung bei ${org.authProviderShort} wurde abgebrochen.`;
    case 'cevidb_failed':
    case 'hitobito_failed':
      return `Die Anmeldung mit ${org.authProviderShort} hat nicht geklappt. Bitte versuche es nochmals.`;
    case 'cevidb_email_taken':
    case 'hitobito_email_taken':
      return `Die E-Mail aus deinem ${org.authProviderShort}-Profil gehört schon zu einem anderen Konto. Melde dich bitte bei den Betreibern des Schichtplans.`;
    default:
      return null;
  }
}

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
  // Verband der Domain, vom Server-Layout bereitgestellt (richtig schon beim ersten Rendern)
  const org = useOrganization();

  // Erst im Browser auswerten (braucht window.location): sonst rendert der Server ohne Ziel und
  // der Browser mit Ziel, und React meldet einen Hydration-Fehler
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => setReturnTo(cleanReturnTo(searchParams.get('return_to'))), [searchParams]);
  const destination = destinationHost(returnTo);
  const [landingHref, setLandingHref] = useState('/');
  useEffect(() => setLandingHref(getLandingUrl()), []);
  // Neutrale Vereins-Domain ohne Ziel-Verein: Verweis auf die Verbands-Logins (Cevi.DB, MiData, Jubla-DB).
  // Erst im Browser berechnen (Host und return_to), damit Server und Browser gleich rendern.
  const [verbandLogins, setVerbandLogins] = useState<{ org: OrganizationConfig; href: string }[]>([]);
  useEffect(() => {
    if (org.slug !== 'verein' || departmentSlugFromReturnTo(returnTo)) {
      setVerbandLogins([]);
      return;
    }
    setVerbandLogins(VERBAND_ORGANIZATIONS.map((v) => ({ org: v, href: organizationSiteUrl(v, { subdomain: 'login' }) })));
  }, [org.slug, returnTo]);

  // Bestehende Sitzung (One-Click Weiterleitung)
  const [existingUser, setExistingUser] = useState<UserDto | null>(null);
  const [switchAccount, setSwitchAccount] = useState(false);

  useEffect(() => {
    if (searchParams.get('error')) return;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((me: UserDto | null) => {
        if (me?.id) setExistingUser(me);
      })
      .catch(() => {});
  }, [searchParams]);

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errCode = searchParams.get('error');
    if (errCode) {
      setError(getLoginErrorMessage(errCode, org) ?? 'Ein Fehler ist aufgetreten.');
    }
  }, [searchParams, org]);
  const [success, setSuccess] = useState<string | null>(null);

  // Fokus-Management für Barrierefreiheit bei Fehlern
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  // E-Mail-Verifikation
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // Passwort-Stärke
  const pwdStrength = useMemo(() => getPasswordStrength(password), [password]);

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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignorieren
    }
    setExistingUser(null);
    setSwitchAccount(true);
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
      setSuccess(`Hallo ${data.user.nickname || data.user.ceviName || data.user.firstName}. Du wirst weitergeleitet …`);
      setTimeout(() => {
        window.location.href = afterLogin(data.user, returnTo, org.dbType);
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
        throw new Error(
          data.error ||
            (authMode === 'login'
              ? 'Anmeldung fehlgeschlagen. Bitte versuche es nochmals.'
              : 'Konto konnte nicht erstellt werden. Bitte versuche es nochmals.')
        );
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
        window.location.href = afterLogin(data.user, returnTo, org.dbType);
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const cevidbAuthParams = new URLSearchParams();
  if (returnTo) cevidbAuthParams.set('returnTo', returnTo);
  if (org.slug) cevidbAuthParams.set('org', org.slug);
  const cevidbAuthUrl = `/api/auth/cevidb/login${cevidbAuthParams.toString() ? `?${cevidbAuthParams.toString()}` : ''}`;

  const feedback = (
    <>
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="space-y-2 animate-fade-in outline-none"
        >
          <Callout tone="danger">
            {error}
          </Callout>
          {errorAction === 'cevidb' && org.slug !== 'verein' && (
            <a href={cevidbAuthUrl} className={buttonClasses({ className: 'w-full justify-between' })}>
              Mit {org.authProviderShort} anmelden <ArrowUpRight className="size-4" />
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
              <KeyRound className="size-4" /> Mit E-Mail und Passwort anmelden
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
    <AuthShell returnTo={returnTo} landingHref={landingHref} showBackLink={true}>
      {/* Elegante Card mit Glassmorphism-Effekt */}
      <div className="rounded-card border border-line bg-surface/85 p-6 shadow-soft backdrop-blur-md transition-all duration-300 sm:p-7 animate-scale-in">
        {/* Welcome-Card mit Abteilungs-Identität */}
        {department && view === 'start' && (
          <div className="mb-6 flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2/70 p-3 shadow-xs">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-tile border border-line/60 bg-surface">
              {department.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={department.logoUrl} alt={department.name} className="size-full object-cover" />
              ) : (
                <BrandLogo className="size-5" alt="" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{department.name}</span>
              <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-accent-ink">
                <span className="size-1.5 rounded-full bg-accent" />
                {org.unitTerm}-Portal
              </span>
            </div>
          </div>
        )}

        {/* Bereits angemeldete Sitzung erkennen & One-Click Weiterleitung anbieten */}
        {existingUser && !switchAccount ? (
          <div key="already_logged_in">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-[1.75rem] font-semibold leading-[1.1] tracking-tight text-fg text-balance">
              Bereits angemeldet
            </h1>
            <p className="mt-2.5 text-[14px] leading-relaxed text-fg-muted">
              Du bist angemeldet als{' '}
              <strong className="font-semibold text-fg">
                {existingUser.nickname || existingUser.ceviName || existingUser.firstName}
                {existingUser.lastName ? ` ${existingUser.lastName}` : ''}
              </strong>
              {existingUser.email ? ` (${existingUser.email})` : ''}.
            </p>

            {destination && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3 text-xs text-fg-subtle">
                Ziel:{' '}
                <span className="font-medium text-fg break-all">{destination}</span>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <a
                href={afterLogin(existingUser, returnTo, org.dbType)}
                className={buttonClasses({
                  size: 'lg',
                  className: 'w-full justify-between shadow-soft',
                })}
              >
                {/* Kurz halten: Die volle Adresse steht schon im «Ziel»-Feld darüber.
                    Lange Namen werden abgeschnitten statt über den Knopf hinauszulaufen. */}
                <span className="min-w-0 truncate">
                  {department ? `Weiter zu ${department.name}` : destination ? 'Weiter' : 'Weiter zur Übersicht'}
                </span>
                <ArrowUpRight className="size-4 shrink-0" />
              </a>

              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => setSwitchAccount(true)}
              >
                <UserRound className="size-4" /> Mit anderem Konto anmelden
              </Button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-1.5 pt-2 text-xs text-fg-subtle transition hover:text-danger"
              >
                <LogOut className="size-3.5" />
                Vollständig abmelden
              </button>
            </div>
          </div>
        ) : (
          <>
            {view === 'start' && (
              <div key="start">
                <h1 className="font-display text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
                  Anmelden
                </h1>
                {destination ? (
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
                    Danach geht es weiter zu{' '}
                    <span className="whitespace-nowrap font-medium text-fg">{destination}</span>.
                  </p>
                ) : (
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
                    Ein Login für alle {org.unitTermPlural} und Anlässe.
                  </p>
                )}

                <div className="mt-7 space-y-3">
                  {feedback}

                  {org.slug !== 'verein' ? (
                    <div>
                      <span className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-ink">
                        <ShieldCheck className="size-3.5" />
                        Empfohlen für Leitende & OK
                      </span>
                      <a
                        href={cevidbAuthUrl}
                        onClick={() => setRedirecting(true)}
                        aria-busy={redirecting || undefined}
                        className={buttonClasses({
                          size: 'lg',
                          className: cn(
                            'w-full justify-between shadow-soft transition-all duration-200',
                            redirecting && 'pointer-events-none opacity-80'
                          ),
                        })}
                      >
                        <span className="flex items-center gap-2.5">
                          <ShieldCheck className="size-4.5 opacity-90 text-white" />
                          <span>{redirecting ? `Weiterleitung zu ${org.authProviderShort} …` : `Mit ${org.authProviderShort} anmelden`}</span>
                        </span>
                        {redirecting ? (
                          <span
                            aria-hidden
                            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                          />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </a>
                      <div className="mt-1.5 flex items-center justify-between px-1 text-[12px] text-fg-subtle">
                        <span>Offizieller Verbands-Login</span>
                        <span className="font-mono text-[11px] text-fg-muted">
                          {org.slug === 'pfadi' ? 'db.scout.ch' : org.slug === 'jubla' ? 'db.jubla.ch' : 'db.cevi.ch'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => goTo('password')}
                        className="w-full justify-between shadow-soft"
                      >
                        <span className="flex items-center gap-2.5">
                          <KeyRound className="size-4.5" />
                          <span>Mit E-Mail & Passwort anmelden</span>
                        </span>
                        <ChevronRight className="size-4" />
                      </Button>
                      <div className="mt-1.5 flex items-center justify-between px-1 text-[12px] text-fg-subtle">
                        <span>Konto für Helfer*innen & OK</span>
                        <span>Passwortgeschützt</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="my-6 flex items-center gap-4 text-xs text-fg-subtle">
                  <span className="h-px flex-1 bg-line" />
                  <span>weitere Optionen</span>
                  <span className="h-px flex-1 bg-line" />
                </div>

                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface/70">
                  {/* E-Mail & Passwort / Registrierung */}
                  {org.slug !== 'verein' ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => goTo('password')}
                        className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                          <KeyRound className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-fg">Mit E-Mail & Passwort</span>
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Empfohlen für Helfende
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">
                            Sicheres Konto für Schichten, Profil & Benachrichtigungen
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ) : (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('register');
                          goTo('password');
                        }}
                        className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
                          <KeyRound className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-fg">Neues Vereinskonto erstellen</span>
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              Kostenlos
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">
                            E-Mail-Adresse und persönliches Passwort wählen
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  )}

                  {/* Spitzname / Cevi-Name: Fallback für Personen ohne E-Mail */}
                  {department && (
                    <li>
                      <button
                        type="button"
                        onClick={() => goTo('ceviname')}
                        className="group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-200 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none opacity-85 hover:opacity-100"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-surface-2 text-fg-muted transition-colors group-hover:bg-surface-3 group-hover:text-fg">
                          <UserRound className="size-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-fg">Mit {org.nicknameTerm}</span>
                            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
                              Ohne Passwort (eingeschränkt)
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">
                            Schnellzugang ohne E-Mail-Adresse für {department.name}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-200 group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  )}
                </ul>

                {verbandLogins.length > 0 && (
                  <p className="mt-5 text-xs leading-relaxed text-fg-subtle">
                    Leitest du bei Cevi, Pfadi oder Jubla? Dann melde dich im Login deines Verbands an:{' '}
                    {verbandLogins.map((v, i) => (
                      <span key={v.org.slug}>
                        {i > 0 && ' · '}
                        <a href={v.href} className="font-semibold text-accent-ink hover:underline">
                          {v.org.orgName} <span className="font-normal">({v.org.authProviderShort})</span>
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </div>
            )}

            {view !== 'start' && (
              <button
                type="button"
                onClick={() => goTo('start')}
                className="-ml-2 mb-5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <ArrowLeft className="size-3.5" />
                Alle Anmeldeoptionen
              </button>
            )}

            {view === 'ceviname' && department && (
              <form key="ceviname" onSubmit={handleQuickSubmit}>
                <h1 className="font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg">
                  Mit {org.nicknameTerm} anmelden
                </h1>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
                  Eingeschränkter Zugang für {department.name} ohne Passwort.
                </p>

                <div className="mt-6 space-y-4.5">
                  {feedback}

                  <Field label={`${org.nicknameTerm} oder Vorname`} required>
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
                    hint="Gleich wie beim ersten Mal (Format: TT.MM.JJJJ). So unterscheiden wir Personen mit gleichem Namen."
                  >
                    <BirthDateInput
                      value={quickBirthDate}
                      onChange={setQuickBirthDate}
                      required
                    />
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    disabled={quickCeviName.trim().length < 2 || !quickBirthDate || !!success}
                    className="w-full shadow-soft"
                  >
                    {loading ? 'Wird überprüft …' : 'Weiter'}
                  </Button>
                </div>
              </form>
            )}

            {view === 'ceviname_new' && department && (
              <form key="ceviname_new" onSubmit={handleQuickRegister}>
                <h1 className="font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg text-balance">
                  Neu bei {department.name}?
                </h1>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">
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

                <div className="mt-6 space-y-4.5">
                  {feedback}

                  <Callout tone="warning" title="Wichtiger Sicherheitshinweis: Kein Passwort-Schutz">
                    <p className="mt-1 text-[13px] leading-relaxed text-fg">
                      Dieses Profil hat <strong>kein Passwort</strong>. Jede Person, die deinen {org.nicknameTerm} und dein Geburtsdatum kennt, kann sich in deinen Account einloggen.
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                      Wir empfehlen dir stattdessen die{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('register');
                          goTo('password');
                        }}
                        className="font-medium text-accent-ink underline-offset-4 hover:underline"
                      >
                        Registrierung mit E-Mail und Passwort
                      </button>
                      , damit deine Schichten geschützt sind und du wichtige Benachrichtigungen erhältst.
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
                      <p className="mt-0.5 text-xs text-fg-subtle">Wähle alle, die passen. Keine ist auch in Ordnung.</p>
                      <ul className="mt-2.5 divide-y divide-line rounded-card border border-line bg-surface/70">
                        {department.stufen.map((stufe) => {
                          const role = quickStufen[stufe.id] ?? null;
                          return (
                            <li key={stufe.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
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
                                      'rounded-full px-2.5 py-1 text-xs font-semibold transition',
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

                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    disabled={!!success}
                    className="w-full shadow-soft"
                  >
                    {loading ? 'Profil wird angelegt …' : 'Profil anlegen und weiter'}
                  </Button>
                  <p className="px-1 text-[12px] leading-relaxed text-fg-subtle">
                    Beim nächsten Mal meldest du dich hier wieder mit {org.nicknameTerm} und Geburtsdatum an. Für Aufgaben im OK
                    brauchst du ein Konto mit {org.slug === 'verein' ? 'E-Mail und Passwort' : `${org.authProviderShort} oder mit E-Mail und Passwort`}.
                  </p>
                </div>
              </form>
            )}

            {view === 'password' && (
              <form key="password" onSubmit={handlePasswordSubmit}>
                {/* Segmented Control / Pill-Tabs für schnelles Umschalten */}
                <div className="mb-6 flex rounded-full border border-line/70 bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setError(null);
                    }}
                    className={cn(
                      'flex-1 rounded-full py-1.5 text-xs font-semibold transition-all duration-200',
                      authMode === 'login' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    Anmelden
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setError(null);
                    }}
                    className={cn(
                      'flex-1 rounded-full py-1.5 text-xs font-semibold transition-all duration-200',
                      authMode === 'register' ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    Konto erstellen
                  </button>
                </div>

                <h1 className="font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg">
                  {authMode === 'login' ? 'Mit E-Mail anmelden' : 'Neues Konto erstellen'}
                </h1>
                <p className="mt-1 text-[14px] leading-relaxed text-fg-muted">
                  {authMode === 'login'
                    ? 'Melde dich mit deiner E-Mail und deinem persönlichen Passwort an.'
                    : `Erstelle ein passwortgeschütztes Konto für alle ${org.unitTermPlural}.`}
                </p>

                <div className="mt-6 space-y-4.5">
                  {feedback}

                  {authMode === 'register' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Vorname" required>
                          <Input
                            type="text"
                            value={regFirstName}
                            onChange={(e) => setRegFirstName(e.target.value)}
                            autoComplete="given-name"
                            minLength={2}
                            required
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

                      <Field label={`${org.nicknameTerm} (freiwillig)`} hint={`Dein ${org.nicknameTerm}, falls vorhanden`}>
                        <Input
                          type="text"
                          value={regCeviName}
                          onChange={(e) => setRegCeviName(e.target.value)}
                          autoComplete="nickname"
                        />
                      </Field>
                    </>
                  )}

                  <Field label="E-Mail" required>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoFocus={authMode === 'login'}
                      required
                    />
                  </Field>

                  <div>
                    <Field
                      label="Passwort"
                      required
                      hint={authMode === 'register' ? 'Mindestens 8 Zeichen.' : undefined}
                    >
                      <PasswordInput
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                        minLength={authMode === 'register' ? 8 : undefined}
                        required
                      />
                    </Field>

                    {/* Passwort-Stärke-Balken bei Registrierung */}
                    {authMode === 'register' && password.length > 0 && (
                      <div className="mt-2.5 space-y-1.5" aria-live="polite">
                        <div className="grid grid-cols-4 gap-1.5 h-1.5">
                          {[1, 2, 3, 4].map((step) => {
                            const active = pwdStrength.score >= step;
                            const color =
                              pwdStrength.tone === 'danger'
                                ? 'bg-danger'
                                : pwdStrength.tone === 'warning'
                                ? 'bg-amber-500'
                                : pwdStrength.tone === 'info'
                                ? 'bg-sky-500'
                                : 'bg-emerald-500';
                            return (
                              <div
                                key={step}
                                className={cn(
                                  'rounded-full transition-all duration-300',
                                  active ? color : 'bg-surface-3'
                                )}
                              />
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between text-2xs text-fg-subtle">
                          <span>Passwortstärke</span>
                          <span
                            className={cn(
                              'font-medium transition-colors',
                              pwdStrength.tone === 'danger'
                                ? 'text-danger-ink'
                                : pwdStrength.tone === 'warning'
                                ? 'text-amber-600 dark:text-amber-400'
                                : pwdStrength.tone === 'info'
                                ? 'text-sky-600 dark:text-sky-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            )}
                          >
                            {pwdStrength.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {authMode === 'login' && (
                    <p className="-mt-1.5 text-right text-xs">
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

                  <Button
                    type="submit"
                    size="lg"
                    loading={loading}
                    disabled={!!success}
                    className="w-full shadow-soft"
                  >
                    {loading
                      ? authMode === 'login'
                        ? 'Wird angemeldet …'
                        : 'Konto wird erstellt …'
                      : authMode === 'login'
                      ? 'Anmelden'
                      : 'Konto erstellen'}
                  </Button>
                </div>
              </form>
            )}

            {view === 'verify_sent' && (
              <div key="verify_sent">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Mail className="size-6" />
                </div>
                <h1 className="mt-4 font-display text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-fg">
                  E-Mail bestätigen
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
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
          </>
        )}
      </div>

      {/* Ehrlicher Datenschutzhinweis (ohne Schweizer Server Claim) */}
      <p className="mt-5 text-center text-xs leading-relaxed text-fg-subtle px-2">
        Deine Daten werden vertraulich behandelt, ausschliesslich für die Helferorganisation verwendet und niemals an Dritte weitergegeben.
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-canvas" />}>
      <LoginContent />
    </Suspense>
  );
}
