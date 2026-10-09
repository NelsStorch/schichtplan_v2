'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Clock, Users, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import type { DepartmentDto, EventDto } from '@schichtplan/shared';

export default function DepartmentHomePage() {
  const [department, setDepartment] = useState<DepartmentDto | null>(null);
  const [events, setEvents] = useState<EventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
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
      } catch (err: any) {
        setError(err.message || 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="bg-rose-100 text-rose-800 p-4 rounded-xl mb-4 font-medium">
          {error || 'Abteilung nicht gefunden'}
        </div>
        <p className="text-slate-600 mb-6 text-sm">
          Bitte überprüfe die Adresse oder wähle eine Abteilung auf der Hauptseite aus.
        </p>
        <a
          href="https://cevi-schichtplan.ch"
          className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-slate-800 transition"
        >
          Zur Cevi-Hauptseite <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shadow-sm"
              style={{ backgroundColor: department.primaryColor || '#e11d48' }}
            >
              {department.name.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">{department.name}</h1>
              <p className="text-xs text-slate-500">Schichtplan-Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-100 transition"
            >
              Anmelden
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Aktuelle Veranstaltungen</h2>
          <p className="text-slate-600 text-sm mt-1">
            Wähle ein Event aus, um dich für Schichten einzutragen oder den Plan einzusehen.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Aktuell keine aktiven Events</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Für diese Abteilung sind momentan keine öffentlichen Schichtpläne freigeschaltet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((evt) => (
              <Link
                key={evt.id}
                href={`/events/${evt.slug}`}
                className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-lg text-slate-900 group-hover:text-rose-600 transition">
                      {evt.title}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(evt.startDate).toLocaleDateString('de-CH', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                  {evt.description && (
                    <p className="text-slate-600 text-sm mt-2 line-clamp-2">{evt.description}</p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                  <span className="text-slate-500 text-xs flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-400" />
                    Offen für Helfer
                  </span>
                  <span className="font-medium text-rose-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    Schichten ansehen <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} {department.name} • Cevi Schichtplan</p>
          <div className="flex gap-4">
            <a href="https://cevi-schichtplan.ch" className="hover:text-slate-700 transition">
              Plattform-Übersicht
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
