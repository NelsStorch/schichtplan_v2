'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Calendar, AlertCircle, CheckCircle2, Trash2, Award } from 'lucide-react';

interface MyShift {
  signupId: string;
  shiftId: string;
  title: string;
  category: string;
  description?: string;
  startTime: string;
  endTime: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  departmentName: string;
  departmentSlug: string;
  createdAt: string;
}

export default function MyShiftsPage() {
  const [shifts, setShifts] = useState<MyShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchMyShifts = async () => {
    try {
      const res = await fetch('/api/shifts/my');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error('Schichten konnten nicht geladen werden');
      const data = await res.json();
      setShifts(data);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyShifts();
  }, []);

  const handleCancel = async (shiftId: string, title: string) => {
    if (!confirm(`Möchtest du dich wirklich aus der Schicht "${title}" austragen?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/shifts/${shiftId}/signup`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Austragen fehlgeschlagen');

      setActionMessage({ text: 'Erfolgreich aus der Schicht ausgetragen.', type: 'success' });
      await fetchMyShifts();
    } catch (err: any) {
      setActionMessage({ text: err.message, type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Zum Schichtplan
          </Link>
          <span className="text-xs bg-rose-950/60 border border-rose-800/60 text-rose-300 px-3 py-1 rounded-full font-medium flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-rose-400" /> {shifts.length} {shifts.length === 1 ? 'Einsatz' : 'Einsätze'}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Meine Schichten</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Hier siehst du alle deine bestätigten Einsätze und kannst dich bei Bedarf austragen.
          </p>
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

        {shifts.length === 0 ? (
          <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-300">Noch keine Schichten gebucht</h3>
            <p className="text-sm text-slate-500 mt-1 mb-6 max-w-sm mx-auto">
              Du hast dich momentan für keine Schichten eingetragen. Wähle ein Event aus und trage dich ein!
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-rose-950/60 transition"
            >
              Schichten finden
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((s) => {
              const startDate = new Date(s.startTime);
              const endDate = new Date(s.endTime);
              const dateStr = startDate.toLocaleDateString('de-CH', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
              });
              const timeStr = `${startDate.toLocaleTimeString('de-CH', {
                hour: '2-digit',
                minute: '2-digit',
              })} - ${endDate.toLocaleTimeString('de-CH', {
                hour: '2-digit',
                minute: '2-digit',
              })}`;

              return (
                <div
                  key={s.signupId}
                  className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-sm hover:border-slate-700 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded">
                          {s.category}
                        </span>
                        <Link
                          href={`/events/${s.eventSlug}`}
                          className="text-xs text-slate-400 hover:text-white transition bg-slate-800 px-2 py-0.5 rounded font-medium"
                        >
                          {s.eventTitle}
                        </Link>
                      </div>

                      <h3 className="font-semibold text-white text-lg">{s.title}</h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                        <span className="flex items-center gap-1 text-slate-300 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" /> {dateStr}
                        </span>
                        <span className="flex items-center gap-1 text-slate-300 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-500" /> {timeStr}
                        </span>
                      </div>

                      {s.description && (
                        <p className="text-slate-400 text-xs mt-2 line-clamp-2">{s.description}</p>
                      )}
                    </div>

                    <div className="pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800 flex justify-end">
                      <button
                        onClick={() => handleCancel(s.shiftId, s.title)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/80 border border-rose-900/60 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Austragen
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
