'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Users,
  ArrowRight,
  Award,
  LogOut,
  PlusCircle,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Lock,
} from 'lucide-react';
import type { DepartmentDto, EventDto, UserDto, SignupMode } from '@schichtplan/shared';
import { CeviLogo } from '@/components/CeviLogo';

export default function DepartmentHomePage() {
  const [department, setDepartment] = useState<DepartmentDto | null>(null);
  const [events, setEvents] = useState<EventDto[]>([]);
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Event Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    slug: '',
    description: '',
    startDate: '',
    endDate: '',
    signupMode: 'OPEN' as SignupMode,
    requireEmailForGuests: false,
    requirePhoneForGuests: false,
  });
  const [eventStatus, setEventStatus] = useState<{ loading: boolean; error?: string }>({
    loading: false,
  });

  const getLoginUrl = () => {
    if (typeof window === 'undefined') return '/login';
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return `http://localhost:3002/?return_to=${encodeURIComponent(window.location.href)}`;
    }
    const parts = hostname.split('.');
    const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    return `${protocol}//login.${rootDomain}/?return_to=${encodeURIComponent(window.location.href)}`;
  };

  const loadData = async () => {
    try {
      const deptRes = await fetch('/api/departments/current');
      if (!deptRes.ok) {
        throw new Error('Abteilung konnte nicht geladen werden');
      }
      const deptData = await deptRes.json();
      setDepartment(deptData);

      const eventsRes = await fetch('/api/events');
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData);
      }

      // Check current user session
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData);
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.reload();
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventStatus({ loading: true });

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventForm,
          startDate: new Date(eventForm.startDate).toISOString(),
          endDate: new Date(eventForm.endDate).toISOString(),
          allowPublicSignup: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Event konnte nicht erstellt werden');

      setShowEventModal(false);
      setEventForm({
        title: '',
        slug: '',
        description: '',
        startDate: '',
        endDate: '',
        signupMode: 'OPEN',
        requireEmailForGuests: false,
        requirePhoneForGuests: false,
      });
      await loadData();
    } catch (err: any) {
      setEventStatus({ loading: false, error: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto bg-slate-950 text-slate-100">
        <div className="bg-rose-950/60 border border-rose-800/60 text-rose-300 p-4 rounded-xl mb-4 font-medium">
          {error || 'Abteilung nicht gefunden'}
        </div>
        <p className="text-slate-400 mb-6 text-sm">
          Bitte überprüfe die Subdomain oder wähle eine Abteilung auf der Hauptseite aus.
        </p>
        <a
          href="https://cevi-schichtplan.ch"
          className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-slate-800 transition"
        >
          Zur Cevi-Hauptseite <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  const isPlannerOrAdmin =
    user &&
    (user.departmentRole === 'ADMIN' ||
      user.departmentRole === 'PLANNER' ||
      user.isGlobalAdmin);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-rose-600 selection:text-white">
      {/* Header (Dark) */}
      <header className="bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CeviLogo className="w-9 h-9" rounded="rounded-xl" />
            <div>
              <h1 className="font-bold text-white leading-tight flex items-center gap-2">
                {department.name}
              </h1>
              <p className="text-xs text-slate-400">Schichtplan-Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <Link
                  href="/meine-schichten"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl transition"
                >
                  <Award className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Meine Schichten</span>
                </Link>

                {isPlannerOrAdmin && (
                  <button
                    onClick={() => setShowEventModal(true)}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-xl transition shadow-sm"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Neues Event</span>
                  </button>
                )}

                <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                  <span className="text-xs text-slate-300 font-semibold hidden md:inline">
                    {user.ceviName ? user.ceviName : user.firstName}
                  </span>
                  <button
                    onClick={handleLogout}
                    title="Abmelden"
                    className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-900 transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <a
                  href={getLoginUrl()}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white px-3.5 py-1.5 rounded-xl transition shadow-sm"
                >
                  Anmelden
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content (Dark) */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Veranstaltungen & Pläne
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Wähle einen Anlass aus, um Schichten zu sehen und dich einzutragen.
            </p>
          </div>

          {user && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3.5 py-2 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>
                Angemeldet als{' '}
                <strong>
                  {user.ceviName ? `${user.firstName} / ${user.ceviName}` : user.firstName}
                </strong>
              </span>
            </div>
          )}
        </div>

        {events.length === 0 ? (
          <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-300">Aktuell keine aktiven Events</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto mb-4">
              Für diese Abteilung sind momentan keine öffentlichen Schichtpläne freigeschaltet.
            </p>
            {isPlannerOrAdmin && (
              <button
                onClick={() => setShowEventModal(true)}
                className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium px-4 py-2 rounded-xl transition"
              >
                <PlusCircle className="w-4 h-4" /> Erstes Event erstellen
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((evt) => (
              <Link
                key={evt.id}
                href={`/events/${evt.slug}`}
                className="group bg-slate-900/80 rounded-2xl border border-slate-800 p-6 hover:border-slate-700 hover:bg-slate-900 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-lg text-white group-hover:text-rose-400 transition">
                      {evt.title}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-medium shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(evt.startDate).toLocaleDateString('de-CH', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Signup Mode Badge */}
                  <div className="mb-3">
                    {evt.signupMode === 'NAME_ONLY' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded-md">
                        <Sparkles className="w-3 h-3 text-amber-400" /> Nur Cevi-Name (Kein Passwort)
                      </span>
                    )}
                    {evt.signupMode === 'OPEN' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                        <Users className="w-3 h-3 text-emerald-400" /> Offen (Mit Account oder Cevi-Name)
                      </span>
                    )}
                    {evt.signupMode === 'LOGIN_REQUIRED' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-950/60 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded-md">
                        <Lock className="w-3 h-3 text-blue-400" /> Login erforderlich
                      </span>
                    )}
                    {evt.signupMode === 'CEVIDB_ONLY' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-purple-950/60 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded-md">
                        <ShieldCheck className="w-3 h-3 text-purple-400" /> Nur Cevi.DB Accounts
                      </span>
                    )}
                  </div>

                  {evt.description && (
                    <p className="text-slate-400 text-sm mt-2 line-clamp-2 leading-relaxed">
                      {evt.description}
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-sm">
                  <span className="text-slate-400 text-xs flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-500" />
                    {evt.shiftCount || 0} Schichten
                  </span>
                  <span className="font-medium text-rose-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 text-xs sm:text-sm">
                    Schichten ansehen <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Modal: Neues Event erstellen */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white">Neues Event anlegen</h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {eventStatus.error && (
              <div className="p-3 mb-4 rounded-lg bg-rose-950/60 text-rose-300 text-xs border border-rose-800/60 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /> {eventStatus.error}
              </div>
            )}

            <form onSubmit={handleCreateEvent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Titel des Anlasses
                </label>
                <input
                  type="text"
                  required
                  placeholder="z. B. Chilbi 2026"
                  value={eventForm.title}
                  onChange={(e) => {
                    const title = e.target.value;
                    const autoSlug = title
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, '-')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '');
                    setEventForm({ ...eventForm, title, slug: autoSlug });
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Slug (URL-Pfad)
                </label>
                <input
                  type="text"
                  required
                  placeholder="chilbi-2026"
                  value={eventForm.slug}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, slug: e.target.value.toLowerCase() })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Anmelde-Modus / Signup-Policy */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Anmelde-Modus für Helfer
                </label>
                <select
                  value={eventForm.signupMode}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, signupMode: e.target.value as SignupMode })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="NAME_ONLY">
                    ⚡ Nur Cevi-Name (Kein Passwort nötig – ideal für Chilbi)
                  </option>
                  <option value="OPEN">
                    🟢 Offen (Wahlweise mit Login oder unkompliziert mit Cevi-Name)
                  </option>
                  <option value="LOGIN_REQUIRED">
                    🔵 Login erforderlich (Cevi.DB, E-Mail oder Cevi-Name Profil)
                  </option>
                  <option value="CEVIDB_ONLY">
                    🛡️ Nur Cevi.DB (Verifizierte Cevi-Leitende)
                  </option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Steuert, ob Helfer sich ohne Passwort in 2 Sekunden eintragen dürfen.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Beschreibung
                </label>
                <textarea
                  rows={2}
                  placeholder="Worum geht es bei diesem Anlass?"
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Startdatum
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.startDate}
                    onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Enddatum
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={eventStatus.loading}
                  className="px-5 py-2 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition"
                >
                  {eventStatus.loading ? 'Erstelle...' : 'Event speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer (Dark) */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>
            &copy; {new Date().getFullYear()} {department.name} &middot; Cevi Schichtplan
          </p>
          <div className="flex gap-4">
            <a href="https://cevi-schichtplan.ch" className="hover:text-slate-300 transition">
              Plattform-Übersicht
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
