'use client';

import { useMemo, useState } from 'react';
import {
  Award,
  Check,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Gift,
  HelpCircle,
  Search,
  SlidersHorizontal,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import type { EventRosterResponseDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  Field,
  Input,
  Select,
  Switch,
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
  const [showConfig, setShowConfig] = useState(false);

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
    exportHelperHoursCsv(event.slug, helpers, summary, config);
  };

  const hasAttendanceTracking = Boolean(event.attendanceMode);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={<Award />}
      title="Helferstunden & Bon-Auswertung"
      description={`Abrechnung von Arbeitsstunden, Verpflegungsbons und T-Shirts für ${event.title}`}
      size="lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-fg-muted">
            <span className="font-semibold text-fg">
              {summary.totalHours} Std.
            </span>{' '}
            über alle {summary.activeHelpers} Helfenden · {summary.totalBons} Bons berechnet
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
              Helfende
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
              <Ticket className="size-3.5 text-accent" />
              Verpflegungsbons
            </div>
            <div className="text-2xl font-bold text-fg">
              {summary.totalBons}
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              {config.bonCalculationMode === 'HOURS'
                ? `1 Bon je ${config.hoursPerBon}h`
                : '1 Bon pro Schicht'}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wider">
              <Gift className="size-3.5 text-accent" />
              T-Shirt / Geschenk
            </div>
            <div className="text-2xl font-bold text-fg">
              {summary.totalTshirts}
            </div>
            <div className="text-[11px] text-fg-subtle truncate">
              ab {config.tshirtMinHours} Std. Einsatz
            </div>
          </div>
        </div>

        {/* Konfiguration (Ausklappbar oder direkt bedienbar) */}
        <div className="rounded-xl border border-line bg-surface-subtle p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-2 text-xs font-semibold text-fg hover:text-accent transition"
            >
              <SlidersHorizontal className="size-3.5 text-accent" />
              Berechnungs-Regeln anpassen
              <span className="text-[11px] font-normal text-fg-muted">
                ({config.bonCalculationMode === 'HOURS' ? `1 Bon pro ${config.hoursPerBon}h` : '1 Bon pro Schicht'}, T-Shirt ab {config.tshirtMinHours}h)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-accent-ink hover:underline"
            >
              {showConfig ? 'Weniger anzeigen' : 'Einstellungen bearbeiten'}
            </button>
          </div>

          {showConfig && (
            <div className="grid gap-4 pt-3 border-t border-line/60 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-fg-muted uppercase tracking-wider block">
                  Verpflegungsbon-Logik
                </label>
                <div className="inline-flex rounded-full border border-line bg-surface p-1">
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, bonCalculationMode: 'HOURS' }))}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition',
                      config.bonCalculationMode === 'HOURS'
                        ? 'bg-fg text-canvas'
                        : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    Nach geleisteten Stunden
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, bonCalculationMode: 'SHIFTS' }))}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition',
                      config.bonCalculationMode === 'SHIFTS'
                        ? 'bg-fg text-canvas'
                        : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    1 Bon pro Schicht
                  </button>
                </div>

                {config.bonCalculationMode === 'HOURS' && (
                  <Field label="Stunden pro Verpflegungsbon" hint="z. B. 3h Einsatz = 1 Bon, 6h = 2 Bons">
                    <Input
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={config.hoursPerBon}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          hoursPerBon: Math.max(0.5, parseFloat(e.target.value) || 1),
                        }))
                      }
                    />
                  </Field>
                )}
              </div>

              <div className="space-y-3">
                <Field label="Mindeststunden für T-Shirt / Helfergeschenk" hint="Helfer ab dieser Stundenzahl erhalten ein T-Shirt">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    step={0.5}
                    value={config.tshirtMinHours}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        tshirtMinHours: Math.max(1, parseFloat(e.target.value) || 1),
                      }))
                    }
                  />
                </Field>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-fg">
                    <input
                      type="checkbox"
                      checked={config.includeSetupTeardown}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, includeSetupTeardown: e.target.checked }))
                      }
                      className="size-4 rounded border-line text-accent focus:ring-accent"
                    />
                    <span>Auf- und Abbau-Schichten mitzählen</span>
                  </label>

                  {hasAttendanceTracking && (
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-fg">
                      <input
                        type="checkbox"
                        checked={config.countAttendedOnly}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, countAttendedOnly: e.target.checked }))
                        }
                        className="size-4 rounded border-line text-accent focus:ring-accent"
                      />
                      <span>Nur bestätigte Anwesenheiten («Da») werten</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
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
                    <th className="py-2.5 px-3 text-right">Gesamtzeit</th>
                    <th className="py-2.5 px-3 text-center">Verpflegungsbons</th>
                    <th className="py-2.5 px-3 text-center">T-Shirt</th>
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

                        <td className="py-2.5 px-3 text-center font-mono">
                          {h.shiftCount}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="font-semibold font-mono text-fg">
                            {h.formattedTime}
                          </div>
                          <div className="text-[10px] text-fg-subtle font-mono">
                            {h.totalHours} Std.
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          {h.bonCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-ink">
                              <Ticket className="size-3" />
                              {h.bonCount} {h.bonCount === 1 ? 'Bon' : 'Bons'}
                            </span>
                          ) : (
                            <span className="text-fg-subtle">–</span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          {h.tshirtEligible ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 font-semibold text-success-ink">
                              <Check className="size-3" />
                              Berechtigt
                            </span>
                          ) : (
                            <span className="text-fg-subtle">–</span>
                          )}
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
