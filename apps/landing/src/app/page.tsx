'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle2, Shield, Smartphone, Globe, ArrowRight, PlusCircle, Search, LogIn, Lock } from 'lucide-react';
import type { RegisterDepartmentInput } from '@schichtplan/shared';
import { CeviLogo } from '@/components/CeviLogo';

export default function LandingPage() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [formData, setFormData] = useState<Partial<RegisterDepartmentInput>>({
    departmentName: '',
    slug: '',
    adminFirstName: '',
    adminLastName: '',
    adminCeviName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [registerStatus, setRegisterStatus] = useState<{ loading: boolean; error?: string; success?: string }>({
    loading: false,
  });

  useEffect(() => {
    async function loadDepts() {
      try {
        const res = await fetch('/api/departments');
        if (res.ok) {
          const data = await res.json();
          setDepartments(data);
        }
      } catch (err) {
        console.error('Fehler beim Laden der Abteilungen', err);
      }
    }
    loadDepts();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterStatus({ loading: true });

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registrierung fehlgeschlagen');
      }

      setRegisterStatus({
        loading: false,
        success: `Abteilung erfolgreich erstellt! Weiterleitung zu ${data.department.slug}...`,
      });

      setTimeout(() => {
        const domain = window.location.hostname.includes('localhost')
          ? `http://${data.department.slug}.localhost:3000`
          : `https://${data.department.slug}.cevi-schichtplan.ch`;
        window.location.href = domain;
      }, 1500);
    } catch (err: any) {
      setRegisterStatus({ loading: false, error: err.message });
    }
  };

  const filtered = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) || d.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-rose-600 selection:text-white">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CeviLogo className="w-9 h-9" rounded="rounded-xl" />
            <span className="font-bold text-white tracking-tight text-lg">Cevi Schichtplan</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl transition"
            >
              <LogIn className="w-3.5 h-3.5 text-slate-400" />
              <span>Anmelden</span>
            </Link>

            <button
              onClick={() => setShowRegisterModal(true)}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl shadow-sm transition"
            >
              <PlusCircle className="w-4 h-4" /> Abteilung anlegen
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section (Dark) */}
      <section className="relative overflow-hidden py-16 md:py-24 border-b border-slate-800/60 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-rose-950/20 via-transparent to-transparent pointer-events-none"></div>

        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60 mb-6">
            Vereinsorganisation modernisiert
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Schichtplanung für den Cevi, <br className="hidden sm:block" />
            <span className="text-rose-500">einfach, modern & dunkel.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Keine Excel-Tabellen oder unübersichtlichen Chats mehr. Jede Abteilung erhält ihre eigene Subdomain,
            kann beliebig viele Events verwalten und Helfer loggen sich direkt via Cevi.DB ein.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/api/auth/cevidb/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-3.5 rounded-xl shadow-lg shadow-emerald-950/50 transition"
            >
              <span className="font-semibold">Login mit Cevi.DB</span> <ArrowRight className="w-4 h-4" />
            </a>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-medium px-6 py-3.5 rounded-xl shadow-lg shadow-rose-950/50 transition"
            >
              Neue Abteilung registrieren
            </button>
            <a
              href="#abteilungen"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 font-medium px-6 py-3.5 rounded-xl transition"
            >
              Abteilung finden
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid (Dark) */}
      <section className="py-16 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800/40 text-rose-400 flex items-center justify-center mb-4">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-lg mb-2">Eigene Subdomain</h3>
              <p className="text-slate-400 text-sm">
                Deine Abteilung bekommt eine feste Adresse wie <code className="text-rose-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">uster.cevi-schichtplan.ch</code>. Einmal merken, immer aktuell.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 flex items-center justify-center mb-4">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-lg mb-2">Multi-Event Unterstützung</h3>
              <p className="text-slate-400 text-sm">
                Verwalte Chilbi, PfiLa, Sommerlager und Cevi-Tag parallel. Nie wieder Code oder Datenbanken duplizieren.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition">
              <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mb-4">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-lg mb-2">Login mit Cevi.DB</h3>
              <p className="text-slate-400 text-sm">
                Kein neues Passwort merken: Helfer und Leiter melden sich direkt mit ihrem bestehenden Cevi.DB Account an. Cevi-Name inklusive!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Abteilung suchen (Dark) */}
      <section id="abteilungen" className="py-16 bg-slate-900/40 border-t border-slate-800/80 flex-1">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white">Abteilung finden</h2>
            <p className="text-slate-400 text-sm mt-1">
              Finde den Schichtplan deiner Cevi-Abteilung und trage dich für anstehende Einsätze ein.
            </p>
          </div>

          <div className="relative mb-6">
            <Search className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Name oder Ort suchen (z. B. Uster, Winterthur)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl shadow-inner text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.length === 0 ? (
              <div className="col-span-2 text-center py-10 text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-slate-800/60">
                Keine Abteilungen gefunden. Lege die erste an!
              </div>
            ) : (
              filtered.map((dept) => (
                <a
                  key={dept.id}
                  href={`https://${dept.slug}.cevi-schichtplan.ch`}
                  className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm"
                      style={{ backgroundColor: dept.primaryColor || '#e11d48' }}
                    >
                      {dept.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-200 group-hover:text-white transition text-sm">{dept.name}</h4>
                      <span className="text-xs text-slate-500">{dept.slug}.cevi-schichtplan.ch</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 group-hover:translate-x-0.5 transition" />
                </a>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Modal: Abteilung registrieren (Dark) */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-xl text-white">Neue Abteilung registrieren</h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                ✕
              </button>
            </div>

            {registerStatus.error && (
              <div className="p-3 mb-4 rounded-lg bg-rose-950/60 text-rose-300 text-sm border border-rose-800/60">
                {registerStatus.error}
              </div>
            )}

            {registerStatus.success && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-950/60 text-emerald-300 text-sm border border-emerald-800/60 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {registerStatus.success}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Name der Cevi-Abteilung</label>
                <input
                  type="text"
                  required
                  placeholder="z. B. Cevi Uster"
                  value={formData.departmentName}
                  onChange={(e) => {
                    const name = e.target.value;
                    const autoSlug = name
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, '-')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '');
                    setFormData({ ...formData, departmentName: name, slug: autoSlug });
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Gewünschte Subdomain</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="uster"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-l-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="bg-slate-800 border border-l-0 border-slate-700 px-3 py-2 text-xs text-slate-400 rounded-r-lg font-mono">
                    .cevi-schichtplan.ch
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 mb-2">Hauptverantwortliche Person (Admin)</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="text"
                    required
                    placeholder="Vorname"
                    value={formData.adminFirstName}
                    onChange={(e) => setFormData({ ...formData, adminFirstName: e.target.value })}
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Nachname"
                    value={formData.adminLastName}
                    onChange={(e) => setFormData({ ...formData, adminLastName: e.target.value })}
                    className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Cevi-Name (optional, z. B. Falk)"
                  value={formData.adminCeviName}
                  onChange={(e) => setFormData({ ...formData, adminCeviName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 mb-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <input
                  type="email"
                  required
                  placeholder="E-Mail-Adresse"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 mb-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <input
                  type="password"
                  required
                  placeholder="Sicheres Passwort (mind. 8 Zeichen)"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={registerStatus.loading}
                  className="px-5 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition"
                >
                  {registerStatus.loading ? 'Wird erstellt...' : 'Abteilung anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer (Dark) */}
      <footer className="bg-slate-950 border-t border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} Cevi Schichtplan • Ehrenamtliches Open-Source-Projekt</p>
          <div className="flex gap-4">
            <a href="https://github.com/NelsStorch/schichtplan_v2" className="hover:text-slate-300 transition">GitHub</a>
            <a href="#" className="hover:text-slate-300 transition">Datenschutz</a>
            <a href="#" className="hover:text-slate-300 transition">Impressum</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
