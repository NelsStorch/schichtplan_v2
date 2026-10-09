'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Users, CheckCircle2, AlertCircle, PlusCircle, Trash2, Check, Filter } from 'lucide-react';
import type { ShiftDto, UserDto } from '@schichtplan/shared';
import { DEFAULT_SHIFT_CATEGORIES } from '@schichtplan/shared';

interface EventDetails {
  id: string;
  title: string;
  slug: string;
  description?: string;
  startDate: string;
  endDate: string;
  shifts: ShiftDto[];
}

export default function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALLE');
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Shift Modal
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    title: '',
    category: DEFAULT_SHIFT_CATEGORIES[0] as string,
    startTime: '',
    endTime: '',
    requiredSlots: 2,
    description: '',
  });
  const [shiftStatus, setShiftStatus] = useState<{ loading: boolean; error?: string }>({ loading: false });

  const loadEvent = async () => {
    try {
      const res = await fetch(`/api/events/${resolvedParams.slug}`);
      if (!res.ok) throw new Error('Event konnte nicht geladen werden');
      const data = await res.json();
      setEvent(data);

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
    loadEvent();
  }, [resolvedParams.slug]);

  const handleSignup = async (shiftId: string) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }

    try {
      const res = await fetch(`/api/shifts/${shiftId}/signup`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Eintragen fehlgeschlagen');

      setActionMessage({ text: 'Erfolgreich für Schicht eingetragen!', type: 'success' });
      await loadEvent();
    } catch (err: any) {
      setActionMessage({ text: err.message, type: 'error' });
    }
  };

  const handleCancelSignup = async (shiftId: string) => {
    try {
      const res = await fetch(`/api/shifts/${shiftId}/signup`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Austragen fehlgeschlagen');

      setActionMessage({ text: 'Erfolgreich aus Schicht ausgetragen.', type: 'success' });
      await loadEvent();
    } catch (err: any) {
      setActionMessage({ text: err.message, type: 'error' });
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setShiftStatus({ loading: true });

    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          title: shiftForm.title,
          category: shiftForm.category,
          startTime: new Date(shiftForm.startTime).toISOString(),
          endTime: new Date(shiftForm.endTime).toISOString(),
          requiredSlots: Number(shiftForm.requiredSlots),
          description: shiftForm.description || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Schicht konnte nicht erstellt werden');

      setShowShiftModal(false);
      setShiftForm({
        title: '',
        category: DEFAULT_SHIFT_CATEGORIES[0],
        startTime: '',
        endTime: '',
        requiredSlots: 2,
        description: '',
      });
      await loadEvent();
    } catch (err: any) {
      setShiftStatus({ loading: false, error: err.message });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="p-6 text-center max-w-md mx-auto min-h-screen flex flex-col justify-center bg-slate-950 text-slate-100">
        <p className="text-rose-400 mb-4">{error || 'Event nicht gefunden'}</p>
        <Link href="/" className="text-sm font-medium text-slate-300 hover:text-white underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const isPlannerOrAdmin = user && (user.departmentRole === 'ADMIN' || user.departmentRole === 'PLANNER' || user.isGlobalAdmin);

  // Filter Categories
  const categories = Array.from(new Set(event.shifts.map((s) => s.category)));
  const filteredShifts =
    selectedCategory === 'ALLE'
      ? event.shifts
      : event.shifts.filter((s) => s.category === selectedCategory);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-rose-600 selection:text-white">
      {/* Header */}
      <header className="bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Alle Events
          </Link>

          <div className="flex items-center gap-2">
            {isPlannerOrAdmin && (
              <button
                onClick={() => setShowShiftModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-xl transition shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Schicht anlegen</span>
              </button>
            )}
            <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-medium border border-slate-700/60">
              {event.shifts.length} Schichten
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{event.title}</h1>
          {event.description && <p className="text-slate-400 mt-2 text-sm leading-relaxed">{event.description}</p>}
        </div>

        {actionMessage && (
          <div
            className={`p-4 rounded-xl mb-6 text-sm flex items-center gap-2 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            {actionMessage.text}
          </div>
        )}

        {/* Category Filters */}
        {categories.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 mb-6 pb-2 overflow-x-auto">
            <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            <button
              onClick={() => setSelectedCategory('ALLE')}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium transition ${
                selectedCategory === 'ALLE'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Alle ({event.shifts.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition ${
                  selectedCategory === cat
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Shifts List */}
        <div className="space-y-4">
          {filteredShifts.map((shift) => {
            const isFull = (shift.freeSlots ?? 0) <= 0;
            const isUserSignedUp = user && shift.signups?.some((su) => su.userId === user.id);

            const startTimeStr = new Date(shift.startTime).toLocaleTimeString('de-CH', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const endTimeStr = new Date(shift.endTime).toLocaleTimeString('de-CH', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const dateStr = new Date(shift.startTime).toLocaleDateString('de-CH', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
            });

            return (
              <div
                key={shift.id}
                className={`rounded-2xl border p-5 shadow-sm transition ${
                  isUserSignedUp
                    ? 'bg-slate-900/90 border-emerald-800/80 ring-1 ring-emerald-500/30'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded">
                        {shift.category}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">{dateStr}</span>
                      {isUserSignedUp && (
                        <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" /> Eingetragen
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-white text-lg">{shift.title}</h3>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                      <span className="flex items-center gap-1 font-medium text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {startTimeStr} - {endTimeStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        {shift.signups?.length || 0} von {shift.requiredSlots} belegt
                      </span>
                    </div>

                    {shift.description && (
                      <p className="text-slate-400 text-xs mt-2 leading-relaxed">{shift.description}</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    {isUserSignedUp ? (
                      <button
                        onClick={() => handleCancelSignup(shift.id)}
                        className="px-3.5 py-2 rounded-xl text-xs font-medium text-rose-400 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 transition inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Austragen
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSignup(shift.id)}
                        disabled={isFull}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                          isFull
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/60 active:scale-95'
                        }`}
                      >
                        {isFull ? 'Voll belegt' : 'Eintragen'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Signups avatars / badges */}
                {shift.signups && shift.signups.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-slate-500 mr-1">Helfer:</span>
                    {shift.signups.map((su) => (
                      <span
                        key={su.id}
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                          user && su.userId === user.id
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : 'bg-slate-800 border-slate-700/60 text-slate-300'
                        }`}
                      >
                        {su.userCeviName ? `${su.userFirstName} / ${su.userCeviName}` : su.userFirstName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Modal: Neue Schicht anlegen */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white">Neue Schicht erstellen</h3>
              <button
                onClick={() => setShowShiftModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {shiftStatus.error && (
              <div className="p-3 mb-4 rounded-lg bg-rose-950/60 text-rose-300 text-xs border border-rose-800/60 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" /> {shiftStatus.error}
              </div>
            )}

            <form onSubmit={handleCreateShift} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Titel der Schicht</label>
                <input
                  type="text"
                  required
                  placeholder="z. B. Grillmeister Abendschicht"
                  value={shiftForm.title}
                  onChange={(e) => setShiftForm({ ...shiftForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Kategorie</label>
                <select
                  value={shiftForm.category}
                  onChange={(e) => setShiftForm({ ...shiftForm, category: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {DEFAULT_SHIFT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Beginn</label>
                  <input
                    type="datetime-local"
                    required
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ende</label>
                  <input
                    type="datetime-local"
                    required
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Benötigte Helfer*innen</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={shiftForm.requiredSlots}
                  onChange={(e) => setShiftForm({ ...shiftForm, requiredSlots: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Beschreibung / Notizen (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Aufgaben, Treffpunkt oder Besonderheiten..."
                  value={shiftForm.description}
                  onChange={(e) => setShiftForm({ ...shiftForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={shiftStatus.loading}
                  className="px-5 py-2 text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg disabled:opacity-50 transition"
                >
                  {shiftStatus.loading ? 'Erstelle...' : 'Schicht anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
