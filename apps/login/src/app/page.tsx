'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  UserCheck,
  KeyRound,
  Calendar,
  Phone,
  User,
} from 'lucide-react';
import { CeviLogo } from '@/components/CeviLogo';

function LoginContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('return_to') || '/';

  const [activeTab, setActiveTab] = useState<'ceviname' | 'cevidb' | 'password'>('ceviname');

  // Cevi-Name Quick Login State
  const [quickCeviName, setQuickCeviName] = useState('');
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickBirthDate, setQuickBirthDate] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [showQuickDetails, setShowQuickDetails] = useState(false);

  // Email/Password State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regCeviName, setRegCeviName] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Quick Cevi-Name Submit
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

      const data = await res.json();
      if (!res.ok) {
        if (data.requiresPassword) {
          setActiveTab('password');
        }
        throw new Error(data.error || 'Anmeldung fehlgeschlagen');
      }

      setSuccess(`Willkommen, ${data.user.ceviName || data.user.firstName}! Weiterleitung...`);
      setTimeout(() => {
        window.location.href = data.redirectUrl || returnTo;
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  // Email / Password Submit
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Aktion fehlgeschlagen');
      }

      setSuccess(
        authMode === 'login'
          ? `Angemeldet! Weiterleitung...`
          : 'Konto erstellt! Weiterleitung...'
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 py-8">
      {/* Back button */}
      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <a
          href={returnTo}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Zurück zum Schichtplan
        </a>
        <span className="text-xs text-slate-600">login.cevi-schichtplan.ch</span>
      </div>

      <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 backdrop-blur-md">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <CeviLogo className="w-16 h-16 mb-3" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Cevi Schichtplan</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Zentrales Single Sign-On für alle Cevi-Abteilungen & Events
          </p>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800/80 mb-6 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('ceviname');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl font-medium transition flex items-center justify-center gap-1.5 ${
              activeTab === 'ceviname'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Cevi-Name</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('cevidb');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl font-medium transition flex items-center justify-center gap-1.5 ${
              activeTab === 'cevidb'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Cevi.DB</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('password');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl font-medium transition flex items-center justify-center gap-1.5 ${
              activeTab === 'password'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Passwort</span>
          </button>
        </div>

        {/* Error / Success Notifications */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* TAB 1: Cevi-Name Schnell-Login (Passwortlos für Chilbi / Helfer) */}
        {activeTab === 'ceviname' && (
          <form onSubmit={handleQuickSubmit} className="space-y-4">
            <div className="p-3 bg-rose-950/20 border border-rose-900/30 rounded-xl text-xs text-rose-200/90 leading-relaxed">
              <strong>Passwortlose Schnell-Anmeldung:</strong> Ideal für Chilbi-Helfer, Eltern und
              Ehemalige. Dein Profil wird sicher gespeichert.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Cevi-Name oder Vorname *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={quickCeviName}
                  onChange={(e) => setQuickCeviName(e.target.value)}
                  placeholder="Dein Cevi-Name"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition"
                />
              </div>
            </div>

            {/* Geburtsdatum für Altersrichtlinien */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Geburtsdatum
                </label>
                <span className="text-[11px] text-slate-500">Für Schichten mit Altersgrenze (z. B. Bar ab 18)</span>
              </div>
              <input
                type="date"
                value={quickBirthDate}
                onChange={(e) => setQuickBirthDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition"
              />
            </div>

            {/* Optional details toggle */}
            {!showQuickDetails ? (
              <button
                type="button"
                onClick={() => setShowQuickDetails(true)}
                className="text-xs text-slate-400 hover:text-slate-200 transition underline underline-offset-2"
              >
                + Vor-/Nachname & Handynummer angeben (optional)
              </button>
            ) : (
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Vorname</label>
                    <input
                      type="text"
                      value={quickFirstName}
                      onChange={(e) => setQuickFirstName(e.target.value)}
                      placeholder="Vorname"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nachname</label>
                    <input
                      type="text"
                      value={quickLastName}
                      onChange={(e) => setQuickLastName(e.target.value)}
                      placeholder="Nachname"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    Handynummer (für Schicht-Notfälle)
                  </label>
                  <input
                    type="tel"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    placeholder="+41 79 000 00 00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !quickCeviName.trim()}
              className="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition shadow-lg shadow-rose-950/50 text-sm flex items-center justify-center gap-2 mt-4"
            >
              <UserCheck className="w-4 h-4" />
              <span>{loading ? 'Wird angemeldet...' : 'Weiter zum Schichtplan'}</span>
            </button>
          </form>
        )}

        {/* TAB 2: Cevi.DB (Hitobito) */}
        {activeTab === 'cevidb' && (
          <div className="space-y-5 py-2">
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-2xl text-xs text-emerald-200/90 leading-relaxed space-y-2">
              <div className="font-semibold text-emerald-300 text-sm flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Offizieller Cevi-Leiter Login
              </div>
              <p>
                Mit deinem bestehenden Cevi.DB Konto (Hitobito) anmelden. Deine Abteilung, dein
                Cevi-Name und dein Geburtsdatum werden automatisch synchronisiert.
              </p>
            </div>

            <a
              href={cevidbAuthUrl}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 px-4 rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-950/50 group"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white group-hover:scale-125 transition-transform"></span>
              <span>1-Klick Login mit Cevi.DB</span>
            </a>

            <div className="text-center text-xs text-slate-500">
              Du wirst zur Authentifizierung an <code className="text-slate-400">db.cevi.ch</code>{' '}
              weitergeleitet.
            </div>
          </div>
        )}

        {/* TAB 3: E-Mail & Passwort */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs mb-3">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition ${
                  authMode === 'login' ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
              >
                Anmelden
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition ${
                  authMode === 'register' ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
              >
                Registrieren
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="beispiel@cevi.ch"
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Passwort</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition"
              />
            </div>

            {authMode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Vorname *
                    </label>
                    <input
                      type="text"
                      required
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="Vorname"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nachname *
                    </label>
                    <input
                      type="text"
                      required
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="Nachname"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Cevi-Name (optional)
                  </label>
                  <input
                    type="text"
                    value={regCeviName}
                    onChange={(e) => setRegCeviName(e.target.value)}
                    placeholder="Dein Cevi-Name"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Telefonnummer (optional)
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="+41 79 000 00 00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 mt-4"
            >
              <span>
                {loading
                  ? 'Bitte warten...'
                  : authMode === 'login'
                  ? 'Mit Passwort anmelden'
                  : 'Konto erstellen'}
              </span>
            </button>
          </form>
        )}
      </div>

      <div className="mt-8 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} Cevi Schichtplan &middot; Sicher & DSGVO-konform
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
          Laden...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
