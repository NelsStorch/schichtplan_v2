'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ShiftDto } from '@schichtplan/shared';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    async function fetchEvent() {
      try {
        const res = await fetch(`/api/events/${resolvedParams.slug}`);
        if (!res.ok) throw new Error('Event konnte nicht geladen werden');
        const data = await res.json();
        setEvent(data);
      } catch (err: any) {
        setError(err.message || 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [resolvedParams.slug]);

  const handleSignup = async (shiftId: string) => {
    try {
      const res = await fetch(`/api/shifts/${shiftId}/signup`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Eintragen fehlgeschlagen');
      }
      setActionMessage({ text: 'Erfolgreich für Schicht eingetragen!', type: 'success' });
      // Reload event
      const updated = await (await fetch(`/api/events/${resolvedParams.slug}`)).json();
      setEvent(updated);
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Alle Events
          </Link>
          <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-medium border border-slate-700/60">
            {event.shifts.length} Schichten
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{event.title}</h1>
          {event.description && <p className="text-slate-400 mt-2 text-sm">{event.description}</p>}
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

        <div className="space-y-4">
          {event.shifts.map((shift) => {
            const isFull = (shift.freeSlots ?? 0) <= 0;
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
                className="bg-slate-900/80 rounded-xl border border-slate-800 p-5 shadow-sm hover:border-slate-700 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-rose-400 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded">
                        {shift.category}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">{dateStr}</span>
                    </div>
                    <h3 className="font-semibold text-white text-lg">{shift.title}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                      <span className="flex items-center gap-1 font-medium text-slate-300">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {startTimeStr} - {endTimeStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        {shift.signups?.length || 0} von {shift.requiredSlots} belegt
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    <button
                      onClick={() => handleSignup(shift.id)}
                      disabled={isFull}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        isFull
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-rose-600 hover:bg-rose-500 text-white active:scale-95'
                      }`}
                    >
                      {isFull ? 'Voll belegt' : 'Eintragen'}
                    </button>
                  </div>
                </div>

                {shift.signups && shift.signups.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-slate-500 mr-1">Helfer:</span>
                    {shift.signups.map((su) => (
                      <span
                        key={su.id}
                        className="text-xs bg-slate-800 border border-slate-700/60 text-slate-200 px-2 py-0.5 rounded-full font-medium"
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
    </div>
  );
}
