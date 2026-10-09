'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { CeviLogo } from '@/components/CeviLogo';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ceviName, setCeviName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register-helper';
      const payload =
        mode === 'login'
          ? { email, password }
          : { email, password, firstName, lastName, ceviName: ceviName || undefined, phone: phone || undefined };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Aktion fehlgeschlagen');
      }

      setSuccess(mode === 'login' ? 'Erfolgreich angemeldet!' : 'Konto erfolgreich erstellt!');
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-100 selection:bg-rose-600 selection:text-white">
      {/* Back button */}
      <div className="w-full max-w-md mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Zurück zum Schichtplan
        </Link>
      </div>

      {/* Main Centered Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 backdrop-blur-md">
        {/* Logo & Headline centered */}
        <div className="flex flex-col items-center text-center mb-6">
          <CeviLogo className="w-16 h-16 mb-3" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Cevi Schichtplan</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Melde dich an, um Schichten zu wählen oder einzusehen.
          </p>
        </div>

        {/* OAuth Buttons */}
        <div className="space-y-2.5 mb-6">
          {/* Cevi.DB Login */}
          <a
            href="/api/auth/cevidb/login"
            className="w-full flex items-center justify-center gap-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 py-3 px-4 rounded-xl text-sm font-medium text-white transition shadow-sm group"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 group-hover:scale-110 transition-transform"></span>
            <span>Mit <strong className="text-emerald-400">Cevi.DB</strong> anmelden</span>
          </a>

          {/* Google Login */}
          <a
            href="/api/auth/google/login"
            className="w-full flex items-center justify-center gap-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 py-3 px-4 rounded-xl text-sm font-medium text-white transition shadow-sm"
          >
            {/* Google Icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Mit <strong>Google</strong> anmelden</span>
          </a>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-6">
          <div className="border-t border-slate-800 w-full"></div>
          <span className="bg-slate-900 px-3 text-xs text-slate-500 uppercase tracking-wider">
            oder mit E-Mail
          </span>
          <div className="border-t border-slate-800 w-full"></div>
        </div>

        {/* Tabs: Anmelden vs Registrieren */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`py-1.5 text-xs font-semibold rounded-lg transition ${
              mode === 'login' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Anmelden
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`py-1.5 text-xs font-semibold rounded-lg transition ${
              mode === 'register' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Konto erstellen
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Vorname</label>
                  <input
                    type="text"
                    required
                    placeholder="z. B. Nels"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nachname</label>
                  <input
                    type="text"
                    required
                    placeholder="z. B. Storch"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Cevi-Name</label>
                <input
                  type="text"
                  placeholder="z. B. Inferno"
                  value={ceviName}
                  onChange={(e) => setCeviName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">E-Mail-Adresse</label>
            <input
              type="email"
              required
              placeholder="inferno@cevi-illnau.ch"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Passwort</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-rose-950/60 disabled:opacity-50"
          >
            {loading ? 'Bitte warten...' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
          </button>
        </form>

        {/* Demo-Hilfe für Cevi Illnau */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            💡 <strong>Muster-Login (Cevi Illnau):</strong><br />
            E-Mail: <code className="text-slate-400">inferno@cevi-illnau.ch</code> • Cevi-Name: <strong>Inferno</strong><br />
            Passwort: <code className="text-slate-400">Password123!</code>
          </p>
        </div>
      </div>
    </div>
  );
}
