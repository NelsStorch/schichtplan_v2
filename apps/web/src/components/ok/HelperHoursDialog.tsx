'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  LifeBuoy,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { helpUrl, type EventRosterResponseDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  Field,
  Input,
  cn,
} from '@schichtplan/ui';
import {
  DEFAULT_HELPER_STATS_CONFIG,
  computeHelperStats,
  exportHelperHoursCsv,
  formatMinutes,
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

  // Live-Berechnung der Statistiken basierend auf Anlass, Roster und Konfiguration
  const { helpers, summary } = useMemo(
    () => computeHelperStats(event, roster, config),
    [event, roster, config]
  );

  const filteredHelpers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return helpers;
    return helpers.filter((h) => {
      if (h.displayName.toLowerCase().includes(q)) return true;
      if (h.ceviName && h.ceviName.toLowerCase().includes(q)) return true;
      if (h.departmentName && h.departmentName.toLowerCase().includes(q)) return true;
      if (h.stufen.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [helpers, search]);

  const handleExport = () => {
    exportHelperHoursCsv(event.slug, helpers, summary);
  };

  const hasAttendanceTracking = Boolean(event.attendanceMode);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Clock />}
      title="Helferstunden & Einsatz-Statistik"
      description={
        <span>
          Übersicht der geleisteten Arbeits- und Einsatzstunden für {event.title}.{' '}
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
            über alle {summary.activeHelpers} aktiven Helfenden ({summary.totalShifts} Schicht-Einsätze)
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              Schliessen
            </Button>
            <Button onClick={handleExport} variant="secondary">
              <FileSpreadsheet className="size-4" /> CSV exportieren
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
              <Wrench className="size-3.5 text-accent" />
              Auf- & Abbau
            </div>
            <div className="text-2xl font-bold text-fg">
              {summary.totalSetupHours} <span className="text-sm font-normal text-fg-muted">Std.</span>
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              Vor- und Nachbereitung
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

        {/* Suchfeld & Tabelle */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                className="h-9 pl-9 text-xs"
                placeholder="Person, Abteilung oder Stufe suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="text-xs text-fg-muted">
              {filteredHelpers.length} von {helpers.length} Personen
            </div>
          </div>

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
        </div>
      </div>
    </Dialog>
  );
}
