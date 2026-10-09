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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="p-6 text-center max-w-md mx-auto">
        <p className="text-rose-600 mb-4">{error || 'Event nicht gefunden'}</p>
        <Link href="/" className="text-sm font-medium text-slate-700 underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Alle Events
          </Link>
          <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
            {event.shifts.length} Schichten
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{event.title}</h1>
          {event.description && <p className="text-slate-600 mt-2 text-sm">{event.description}</p>}
        </div>

        {actionMessage && (
          <div
            className={`p-4 rounded-xl mb-6 text-sm flex items-center gap-2 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
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
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                        {shift.category}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">{dateStr}</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-lg">{shift.title}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {startTimeStr} - {endTimeStr}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {shift.signups?.length || 0} von {shift.requiredSlots} belegt
                      </span>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <button
                      onClick={() => handleSignup(shift.id)}
                      disabled={isFull}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        isFull
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-rose-600 text-white hover:bg-rose-700 active:scale-95'
                      }`}
                    >
                      {isFull ? 'Voll belegt' : 'Eintragen'}
                    </button>
                  </div>
                </div>

                {shift.signups && shift.signups.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-slate-400 mr-1">Helfer:</span>
                    {shift.signups.map((su) => (
                      <span
                        key={su.id}
                        className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium"
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
