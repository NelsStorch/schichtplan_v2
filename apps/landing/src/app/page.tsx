'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Shield, Smartphone, Globe, ArrowRight, PlusCircle, Search } from 'lucide-react';
import type { RegisterDepartmentInput } from '@schichtplan/shared';

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
        // In Produktion leiten wir auf die Subdomain weiter
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
    <div className="min-h-screen flex flex-col">
      {/* Top Navbar */}
      <nav className="border-b border-slate-100 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center font-bold text-white shadow-sm">
              C
            </div>
            <span className="font-bold text-slate-900 tracking-tight text-lg">Cevi Schichtplan</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRegisterModal(true)}
              className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition"
            >
              <PlusCircle className="w-4 h-4" /> Abteilung anlegen
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-16 md:py-24 border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 mb-6">
            Vereinsorganisation modernisiert
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Schichtplanung für den Cevi, <br className="hidden sm:block" />
            <span className="text-rose-600">einfach & stressfrei.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
            Keine doppelten Excel-Listen oder unübersichtliche Chats mehr. Jede Abteilung erhält ihre eigene Subdomain,
            kann beliebig viele Events verwalten und Helfer tragen sich sekundenschnell ein.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setShowRegisterModal(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-medium px-6 py-3 rounded-xl shadow-md transition"
            >
              Kostenlos für deine Abteilung starten <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#abteilungen"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium px-6 py-3 rounded-xl transition"
            >
              Abteilung finden
            </a>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-4">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-2">Eigene Subdomain</h3>
              <p className="text-slate-600 text-sm">
                Deine Abteilung bekommt eine feste Adresse wie <code>uster.cevi-schichtplan.ch</code>. Einmal merken,
                immer aktuell.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-2">Multi-Event Unterstützung</h3>
              <p className="text-slate-600 text-sm">
                Verwalte Chilbi, PfiLa, Sommerlager und Cevi-Tag parallel. Nie wieder Code oder Datenbanken duplizieren.
              </p>
            </div>

            <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50/50">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-2">Mobil-optimiert & PWA</h3>
              <p className="text-slate-600 text-sm">
                Perfekt abgestimmt auf Smartphones. Helfer sehen ihre Schichten sofort und erhalten Erinnerungen direkt
                auf ihr Gerät.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Abteilung suchen */}
      <section id="abteilungen" className="py-16 bg-slate-50 border-t border-slate-200 flex-1">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Abteilung finden</h2>
            <p className="text-slate-600 text-sm mt-1">
              Finde den Schichtplan deiner Cevi-Abteilung und trage dich für anstehende Einsätze ein.
            </p>
          </div>

          <div className="relative mb-6">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Name oder Ort suchen (z. B. Uster, Winterthur)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-slate-500 text-sm">
                Keine Abteilungen gefunden. Lege die erste an!
              </div>
            ) : (
              filtered.map((dept) => (
                <a
                  key={dept.id}
                  href={`https://${dept.slug}.cevi-schichtplan.ch`}
                  className="bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm"
                      style={{ backgroundColor: dept.primaryColor || '#e11d48' }}
                    >
                      {dept.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-sm">{dept.name}</h4>
                      <span className="text-xs text-slate-500">{dept.slug}.cevi-schichtplan.ch</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </a>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Modal: Abteilung registrieren */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-xl text-slate-900">Neue Abteilung registrieren</h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1"
              >
                ✕
              </button>
            </div>

            {registerStatus.error && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 text-rose-800 text-sm border border-rose-200">
                {registerStatus.error}
              </div>
            )}

            {registerStatus.success && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-50 text-emerald-800 text-sm border border-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {registerStatus.success}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Name der Cevi-Abteilung</label>
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Gewünschte Subdomain</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="uster"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-l-lg text-sm"
                  />
                  <span className="bg-slate-100 border border-l-0 border-slate-200 px-3 py-2 text-xs text-slate-500 rounded-r-lg">
                    .cevi-schichtplan.ch
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 mb-2">Hauptverantwortliche Person (Admin)</h4>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="text"
                    required
                    placeholder="Vorname"
                    value={formData.adminFirstName}
                    onChange={(e) => setFormData({ ...formData, adminFirstName: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Nachname"
                    value={formData.adminLastName}
                    onChange={(e) => setFormData({ ...formData, adminLastName: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Cevi-Name (optional, z. B. Falk)"
                  value={formData.adminCeviName}
                  onChange={(e) => setFormData({ ...formData, adminCeviName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2"
                />
                <input
                  type="email"
                  required
                  placeholder="E-Mail-Adresse"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-2"
                />
                <input
                  type="password"
                  required
                  placeholder="Sicheres Passwort (mind. 8 Zeichen)"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={registerStatus.loading}
                  className="px-5 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {registerStatus.loading ? 'Wird erstellt...' : 'Abteilung anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} Cevi Schichtplan • Ehrenamtliches Open-Source-Projekt</p>
          <div className="flex gap-4">
            <a href="https://github.com" className="hover:text-slate-700">GitHub</a>
            <a href="#" className="hover:text-slate-700">Datenschutz</a>
            <a href="#" className="hover:text-slate-700">Impressum</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
