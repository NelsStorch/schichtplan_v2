'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSpreadsheet,
  LifeBuoy,
  Medal,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';
import { helpUrl, type EventRosterResponseDto } from '@schichtplan/shared';
import {
  Avatar,
  Button,
  Dialog,
  Input,
  cn,
  trackUi,
} from '@schichtplan/ui';
import {
  DEFAULT_HELPER_STATS_CONFIG,
  computeHelperStats,
  computeStufenStats,
  exportHelperHoursCsv,
  exportStufenRankingCsv,
  type HelperStatsConfig,
} from '@/lib/helperStats';
import type { EventDetails } from '@/lib/types';

export function HelperHoursDialog({
  open,
  event,
  roster,
  onClose,
}: {
  open: boolean;
  event: EventDetails;
  roster: EventRosterResponseDto | null;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<HelperStatsConfig>(DEFAULT_HELPER_STATS_CONFIG);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'helpers' | 'stufen'>('helpers');
  const [expandedStufe, setExpandedStufe] = useState<string | null>(null);

  // Live-Berechnung der Statistiken basierend auf Anlass, Roster und Konfiguration
  const { helpers, summary } = useMemo(
    () => computeHelperStats(event, roster, config),
    [event, roster, config]
  );

  // Stufen-Rangliste berechnen
  const stufenStats = useMemo(
    () => computeStufenStats(helpers, summary),
    [helpers, summary]
  );

  const filteredHelpers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return helpers;
    return helpers.filter((h) => {
      if (h.displayName.toLowerCase().includes(q)) return true;
      if ((h.nickname || h.ceviName) && (h.nickname || h.ceviName)!.toLowerCase().includes(q)) return true;
      if (h.departmentName?.toLowerCase().includes(q)) return true;
      if (h.stufen.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [helpers, search]);

  const filteredStufen = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stufenStats;
    return stufenStats.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true;
      if (s.helpers.some((h) => h.displayName.toLowerCase().includes(q) || ((h.ceviName) && h.ceviName.toLowerCase().includes(q)))) {
        return true;
      }
      return false;
    });
  }, [stufenStats, search]);

  const handleExport = () => {
    if (viewMode === 'stufen') {
      exportStufenRankingCsv(event.slug, stufenStats, summary);
      trackUi('UI_CSV', 'HOURS');
    } else {
      exportHelperHoursCsv(event.slug, helpers, summary);
      trackUi('UI_CSV', 'HOURS');
    }
  };

  const hasAttendanceTracking = Boolean(event.attendanceMode);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Clock />}
      title="Helferstunden & Stufen-Rangliste"
      description={
        <span>
          Übersicht der geleisteten Arbeits- und Einsatzstunden für {event.title} (inkl. Schichtleitungen).{' '}
          <a
            href={helpUrl('/ok/auswertung/#helferstunden--einsatz-statistik')}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline"
          >
            <LifeBuoy className="size-3.5 inline" /> Anleitung im Hilfe-Center
          </a>
        </span>
      }
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-fg-muted">
            <span className="font-semibold text-fg">
              {summary.totalHours} Std.
            </span>{' '}
            über alle {summary.activeHelpers} aktiven Helfenden in {stufenStats.length} Stufen ({summary.totalShifts} Einsätze)
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              Schliessen
            </Button>
            <Button onClick={handleExport} variant="secondary">
              <FileSpreadsheet className="size-4" />
              {viewMode === 'stufen' ? 'Rangliste exportieren' : 'CSV exportieren'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Übersichtskarten */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wider">
              <Clock className="size-3.5 text-accent" />
              Gesamtstunden
            </div>
            <div className="text-2xl font-bold text-fg">
              {summary.totalHours} <span className="text-sm font-normal text-fg-muted">Std.</span>
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              {summary.totalEventHours}h Anlass · {summary.totalSetupHours}h Auf/Abbau
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wider">
              <Users className="size-3.5 text-accent" />
              Aktive Helfende
            </div>
            <div className="text-2xl font-bold text-fg">
              {summary.activeHelpers}
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              Ø {summary.avgHoursPerHelper} Std. / Person
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wider">
              <CalendarDays className="size-3.5 text-accent" />
              Einsätze
            </div>
            <div className="text-2xl font-bold text-fg">
              {summary.totalShifts}
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              Schicht-Eintragungen
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wider">
              <Trophy className="size-3.5 text-amber-500" />
              Stufen aktiv
            </div>
            <div className="text-2xl font-bold text-fg">
              {stufenStats.length}
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              Rangliste berechnet
            </div>
          </div>
        </div>

        {/* Filter-Optionen */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-subtle p-3 text-xs">
          <span className="font-semibold text-fg flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5 text-accent" />
            Filter für Stunden-Berechnung:
          </span>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none text-fg">
              <input
                type="checkbox"
                checked={config.includeSetupTeardown}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, includeSetupTeardown: e.target.checked }))
                }
                className="size-4 rounded border-line text-accent focus:ring-accent"
              />
              <span>Auf- und Abbau einbeziehen</span>
            </label>

            {hasAttendanceTracking && (
              <label className="flex items-center gap-2 cursor-pointer select-none text-fg">
                <input
                  type="checkbox"
                  checked={config.countAttendedOnly}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, countAttendedOnly: e.target.checked }))
                  }
                  className="size-4 rounded border-line text-accent focus:ring-accent"
                />
                <span>Nur bestätigte Anwesenheiten («Da»)</span>
              </label>
            )}
          </div>
        </div>

        {/* Tab-Umschaltung: Personen vs. Stufen-Rangliste */}
        <div className="flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setViewMode('helpers')}
              className={cn(
                'flex items-center gap-2 pb-2.5 text-sm font-semibold transition border-b-2',
                viewMode === 'helpers'
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              )}
            >
              <Users className="size-4" />
              Personen ({filteredHelpers.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stufen')}
              className={cn(
                'flex items-center gap-2 pb-2.5 text-sm font-semibold transition border-b-2',
                viewMode === 'stufen'
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg'
              )}
            >
              <Trophy className="size-4 text-amber-500" />
              Stufen-Rangliste ({stufenStats.length})
            </button>
          </div>

          <div className="relative max-w-xs mb-1.5">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder={viewMode === 'stufen' ? 'Stufe oder Name suchen…' : 'Person, Abteilung oder Stufe suchen…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* TAB 1: Personen-Tabelle */}
        {viewMode === 'helpers' && (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface-subtle border-b border-line text-fg-muted uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Helfende Person</th>
                    <th className="py-2.5 px-3">Abteilung / Stufe</th>
                    <th className="py-2.5 px-3 text-center">Schichten</th>
                    <th className="py-2.5 px-3 text-right">Anlass</th>
                    <th className="py-2.5 px-3 text-right">Auf-/Abbau</th>
                    <th className="py-2.5 px-3 text-right">Gesamtzeit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {filteredHelpers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-fg-subtle">
                        Keine Helfenden gefunden.
                      </td>
                    </tr>
                  ) : (
                    filteredHelpers.map((h) => (
                      <tr key={h.key} className="hover:bg-surface-elevated/50 transition">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={h.displayName}
                              size="sm"
                              className="size-6 text-[10px]"
                            />
                            <div>
                              <div className="font-semibold text-fg flex items-center gap-1.5">
                                {h.displayName}
                                {h.isGuest && (
                                  <span className="rounded bg-surface-elevated border border-line px-1.5 py-0.2 text-[9px] text-fg-subtle font-normal">
                                    Gast
                                  </span>
                                )}
                              </div>
                              {h.subName && (
                                <div className="text-[11px] text-fg-subtle">{h.subName}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-fg-muted">
                          {h.departmentName ? (
                            <div>
                              <div>{h.departmentName}</div>
                              {h.stufen.length > 0 && (
                                <div className="text-[10px] text-fg-subtle">
                                  {h.stufen.join(', ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-fg-subtle">–</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center font-mono font-medium">
                          {h.shiftCount}
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono text-fg-muted">
                          {h.eventHours > 0 ? `${h.eventHours} Std.` : '–'}
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono text-fg-muted">
                          {h.setupHours > 0 ? `${h.setupHours} Std.` : '–'}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="font-semibold font-mono text-fg">
                            {h.formattedTime}
                          </div>
                          <div className="text-[10px] text-fg-subtle font-mono">
                            {h.totalHours} Std.
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Stufen-Rangliste */}
        {viewMode === 'stufen' && (
          <div className="space-y-3">
            {filteredStufen.length === 0 ? (
              <div className="rounded-xl border border-line bg-surface p-8 text-center text-fg-subtle">
                Keine Stufen mit Helferstunden gefunden.
              </div>
            ) : (
              <div className="grid gap-3 max-h-96 overflow-y-auto pr-1">
                {filteredStufen.map((s, idx) => {
                  const isTop1 = idx === 0;
                  const isTop2 = idx === 1;
                  const isTop3 = idx === 2;
                  const isExpanded = expandedStufe === s.name;

                  return (
                    <div
                      key={s.name}
                      className={cn(
                        'rounded-xl border bg-surface p-4 transition',
                        isTop1
                          ? 'border-amber-500/40 bg-amber-500/5 shadow-xs'
                          : isTop2
                            ? 'border-slate-400/40 bg-slate-400/5'
                            : isTop3
                              ? 'border-amber-700/30 bg-amber-700/5'
                              : 'border-line'
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Rang Badge */}
                          <div
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full font-bold text-xs',
                              isTop1
                                ? 'bg-amber-500 text-white shadow-sm'
                                : isTop2
                                  ? 'bg-slate-400 text-white'
                                  : isTop3
                                    ? 'bg-amber-700 text-white'
                                    : 'bg-surface-elevated text-fg-muted border border-line'
                            )}
                          >
                            {isTop1 ? (
                              <Trophy className="size-4" />
                            ) : isTop2 || isTop3 ? (
                              <Medal className="size-4" />
                            ) : (
                              `#${idx + 1}`
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-fg truncate text-sm">
                                {s.name}
                              </h4>
                              <span className="text-[11px] font-medium text-fg-subtle rounded-full bg-surface-elevated px-2 py-0.5 border border-line">
                                {s.percentageOfTotal}% aller Stunden
                              </span>
                            </div>
                            <p className="text-xs text-fg-muted mt-0.5">
                              {s.helperCount} {s.helperCount === 1 ? 'Person' : 'Personen'} · {s.shiftCount} {s.shiftCount === 1 ? 'Einsatz' : 'Einsätze'} · Ø {s.avgHoursPerHelper} Std./Person
                            </p>
                          </div>
                        </div>

                        {/* Stundenanzeige & Aufklapp-Button */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="font-mono text-base font-bold text-fg">
                              {s.totalHours} <span className="text-xs font-normal text-fg-muted">Std.</span>
                            </div>
                            <div className="font-mono text-[10px] text-fg-subtle">
                              {s.formattedTime}
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            onClick={() => setExpandedStufe(isExpanded ? null : s.name)}
                            aria-label="Helfende anzeigen"
                          >
                            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Visueller Fortschrittsbalken */}
                      <div className="mt-3 w-full bg-line/60 rounded-full h-2 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isTop1
                              ? 'bg-amber-500'
                              : isTop2
                                ? 'bg-slate-400'
                                : isTop3
                                  ? 'bg-amber-600'
                                  : 'bg-accent'
                          )}
                          style={{ width: `${Math.max(4, s.percentageOfTotal)}%` }}
                        />
                      </div>

                      {/* Aufklappbare Helfenden-Liste dieser Stufe */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-line/70">
                          <div className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider mb-2">
                            Beteiligte Personen ({s.helpers.length}):
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.helpers.map((h, hIdx) => (
                              <span
                                key={hIdx}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-2 py-1 text-xs text-fg"
                              >
                                <span className="font-medium">{h.displayName}</span>
                                {h.ceviName && <span className="text-fg-subtle text-[11px]">({h.ceviName})</span>}
                                <span className="font-mono font-bold text-accent-ink ml-1 text-[11px]">
                                  {h.hours}h
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
