'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Layers,
  Medal,
  Printer,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  type DepartmentStatsResponseDto,
} from '@schichtplan/shared';
import { Badge, Button, EmptyState, Input, Skeleton, Switch, cn, useToast } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv } from '@/lib/exportFile';
import { fmtShortDate } from '@/lib/format';
import { downloadBlob, printBlob } from '@/lib/printPlan';
import { usePortal } from '@/lib/portal';

export function DepartmentStatsPanel() {
  const { department } = usePortal();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DepartmentStatsResponseDto | null>(null);

  const [selectedYear, setSelectedYear] = useState<number | 'ALL'>(new Date().getFullYear());
  const [countAttendedOnly, setCountAttendedOnly] = useState(false);
  const [includeSetupTeardown, setIncludeSetupTeardown] = useState(true);
  const [helperSearch, setHelperSearch] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'helpers' | 'events' | 'stufen'>('helpers');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear === 'ALL') {
        params.set('year', 'ALL');
      } else {
        params.set('year', String(selectedYear));
      }
      if (countAttendedOnly) {
        params.set('countAttendedOnly', 'true');
      }
      if (!includeSetupTeardown) {
        params.set('includeSetupTeardown', 'false');
      }

      const res = await api<DepartmentStatsResponseDto>(`/api/departments/current/stats?${params.toString()}`);
      setData(res);
    } catch (err) {
      toast({
        title: 'Statistik konnte nicht geladen werden',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedYear, countAttendedOnly, includeSetupTeardown, toast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Gefilterte Helfende
  const filteredHelpers = useMemo(() => {
    if (!data?.topHelpers) return [];
    const q = helperSearch.trim().toLowerCase();
    if (!q) return data.topHelpers;
    return data.topHelpers.filter((h) => {
      const matchName = h.displayName.toLowerCase().includes(q);
      const matchFirst = h.firstName ? h.firstName.toLowerCase().includes(q) : false;
      const matchLast = h.lastName?.toLowerCase().includes(q) ?? false;
      const matchCevi = h.ceviName?.toLowerCase().includes(q) ?? false;
      const matchStufe = h.stufen.some((s) => s.toLowerCase().includes(q));
      return matchName || matchFirst || matchLast || matchCevi || matchStufe;
    });
  }, [data?.topHelpers, helperSearch]);

  // CSV Export für GV / Jahresbericht
  const handleExportCsv = () => {
    if (!data) return;

    const deptSlug = department?.slug || 'abteilung';
    const yearLabel = data.year === 'ALL' ? 'alle-jahre' : String(data.year);
    const filename = `cevi-helferstunden-${deptSlug}-${yearLabel}.csv`;

    const rows: (string | number | null | undefined)[][] = [];

    // Titelzeilen
    rows.push([`Cevi Schichtplan - Jahresauswertung ${department?.name ?? ''}`]);
    rows.push([`Jahr: ${data.year === 'ALL' ? 'Alle erfassten Jahre' : data.year}`]);
    rows.push([`Stand: ${new Date().toLocaleDateString('de-CH')}`]);
    rows.push([
      `Filter: ${countAttendedOnly ? 'Nur bestätigte Anwesenheiten' : 'Alle eingetragenen Schichten'}, ${
        includeSetupTeardown ? 'inkl. Auf-/Abbau' : 'ohne Auf-/Abbau'
      }`,
    ]);
    rows.push([]);

    // Kennzahlen
    rows.push(['Gesamtstunden (h)', data.summary.totalHours]);
    rows.push(['Geleistete Zeit', data.summary.formattedTime]);
    rows.push(['Aktive Helfende', data.summary.totalHelpers]);
    rows.push(['Anzahl Anlässe', data.summary.totalEvents]);
    rows.push(['Anzahl Schichten', data.summary.totalShifts]);
    rows.push(['Besetzungsgrad (%)', `${data.summary.fillRatePct}%`]);
    rows.push(['Bestätigte Anwesenheitsrate (%)', `${data.summary.attendedRatePct}%`]);
    rows.push(['Ø Stunden pro Helfer*in', data.summary.averageHoursPerHelper]);
    rows.push([]);

    // Helferliste
    rows.push(['--- HELFER-EHRENTAFEL & STUNDEN ---']);
    rows.push([
      'Rang',
      'Name',
      'Cevi-Name',
      'Stufen',
      'Anzahl Anlässe',
      'Schichten gesamt',
      'Bestätigte Schichten',
      'Stunden (Dezimal)',
      'Geleistete Zeit',
      'Gast/Extern',
    ]);

    data.topHelpers.forEach((h, idx) => {
      rows.push([
        idx + 1,
        `${h.firstName || h.displayName} ${h.lastName || ''}`.trim(),
        h.ceviName || '',
        h.stufen.join(', ') || 'Ohne Stufe',
        h.eventCount,
        h.shiftCount,
        h.attendedShiftCount,
        h.hours,
        h.formattedTime,
        h.isGuest ? 'Ja' : 'Nein',
      ]);
    });

    rows.push([]);

    // Anlässe
    rows.push(['--- ANLÄSSE DES JAHRES ---']);
    rows.push([
      'Anlass',
      'Datum Start',
      'Datum Ende',
      'Helfende',
      'Schichten',
      'Besetzte Slots',
      'Benötigte Slots',
      'Besetzungsgrad (%)',
      'Gesamtstunden (h)',
      'Anlass-Stunden (h)',
      'Auf-/Abbau (h)',
      'Bestätigte Stunden (h)',
      'Anwesenheitsrate (%)',
    ]);

    data.events.forEach((ev) => {
      rows.push([
        ev.title,
        ev.startDate.slice(0, 10),
        ev.endDate.slice(0, 10),
        ev.helpersCount,
        ev.totalShifts,
        ev.filledSlots,
        ev.totalSlots,
        `${ev.fillRatePct}%`,
        ev.totalHours,
        ev.eventHours,
        ev.setupHours,
        ev.attendedHours,
        `${ev.attendedRatePct}%`,
      ]);
    });

    rows.push([]);

    // Stufen
    rows.push(['--- STUFEN-VERTEILUNG ---']);
    rows.push(['Stufe', 'Helfende', 'Schichten', 'Gesamtstunden (h)', 'Anteil an Gesamt (%)']);
    data.stufen.forEach((st) => {
      rows.push([st.name, st.helpersCount, st.totalShifts, st.totalHours, `${st.percentageOfTotal}%`]);
    });

    downloadCsv(filename, rows);
    toast({
      title: 'CSV exportiert',
      description: `Datei «${filename}» wurde heruntergeladen.`,
      tone: 'success',
    });
  };

  const getPdfBlob = async () => {
    if (!data) return null;
    const { renderDepartmentStatsPdf } = await import('./DepartmentStatsPdf');
    return renderDepartmentStatsPdf(data, department, '/fonts/pdf');
  };

  const handlePrintPdf = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const blob = await getPdfBlob();
      if (!blob) return;
      const deptSlug = department?.slug || 'abteilung';
      const yearLabel = data.year === 'ALL' ? 'alle-jahre' : String(data.year);
      const filename = `cevi-jahresbericht-${deptSlug}-${yearLabel}.pdf`;
      printBlob(blob, filename);
    } catch (err) {
      toast({
        title: 'PDF konnte nicht erstellt werden',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const blob = await getPdfBlob();
      if (!blob) return;
      const deptSlug = department?.slug || 'abteilung';
      const yearLabel = data.year === 'ALL' ? 'alle-jahre' : String(data.year);
      const filename = `cevi-jahresbericht-${deptSlug}-${yearLabel}.pdf`;
      downloadBlob(blob, filename);
      toast({
        title: 'PDF heruntergeladen',
        description: `Datei «${filename}» wurde erfolgreich gespeichert.`,
        tone: 'success',
      });
    } catch (err) {
      toast({
        title: 'PDF konnte nicht erstellt werden',
        description: errorMessage(err),
        tone: 'error',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Filter-Steuerung (wird beim Drucken angepasst) */}
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-sm sm:p-5 print:border-none print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-fg sm:text-xl">
              <BarChart3 className="size-5 text-accent-ink" />
              Statistiken & Jahresrückblick
            </h3>
            <p className="mt-0.5 text-xs text-fg-muted sm:text-sm">
              Auswertung aller Helferstunden, Anlässe und Stufen für die Generalversammlung (GV) und Berichte.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrintPdf}
              disabled={loading || !data || generatingPdf}
              title="Sauberes A4-PDF direkt drucken"
            >
              <Printer className="size-4" />
              {generatingPdf ? 'PDF wird erstellt...' : 'PDF drucken'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={loading || !data || generatingPdf}
              title="A4-PDF für die GV als Datei herunterladen"
            >
              <FileText className="size-4" />
              PDF Bericht
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading || !data || generatingPdf}
              title="Rohdaten für Excel herunterladen"
            >
              <Download className="size-4" /> CSV für GV
            </Button>
          </div>
        </div>

        {/* Filter-Leiste */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60 print:hidden">
          {/* Jahres-Auswahl */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-fg-muted">Jahr:</span>
            <div className="flex flex-wrap gap-1">
              {data?.availableYears && data.availableYears.length > 0 ? (
                <>
                  {data.availableYears.map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setSelectedYear(yr)}
                      className={cn(
                        'h-7 rounded-full px-2.5 text-xs font-semibold transition',
                        selectedYear === yr
                          ? 'bg-accent-ink text-white shadow-xs'
                          : 'bg-surface-2 text-fg-muted hover:text-fg'
                      )}
                    >
                      {yr}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSelectedYear('ALL')}
                    className={cn(
                      'h-7 rounded-full px-2.5 text-xs font-semibold transition',
                      selectedYear === 'ALL'
                        ? 'bg-accent-ink text-white shadow-xs'
                        : 'bg-surface-2 text-fg-muted hover:text-fg'
                    )}
                  >
                    Alle Jahre
                  </button>
                </>
              ) : (
                <span className="text-xs text-fg-subtle">{selectedYear}</span>
              )}
            </div>
          </div>

          <div className="h-4 w-px bg-border/60 hidden sm:block" />

          {/* Filter-Schalter */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Switch
              checked={countAttendedOnly}
              onChange={setCountAttendedOnly}
              label="Nur bestätigte Anwesenheiten"
            />
            <Switch
              checked={includeSetupTeardown}
              onChange={setIncludeSetupTeardown}
              label="Auf- & Abbau einbeziehen"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : !data || data.summary.totalEvents === 0 ? (
        <EmptyState
          icon={<Calendar />}
          title={`Keine Anlässe im Jahr ${selectedYear === 'ALL' ? 'überhaupt' : selectedYear}`}
          description="In diesem Zeitraum wurden keine Anlässe oder Schichten für die Abteilung gefunden."
        />
      ) : (
        <>
          {/* 2. Bento-Kacheln (KPI-Übersicht) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Kachel 1: Gesamtstunden */}
            <div className="rounded-card border border-border bg-surface p-4 shadow-xs transition hover:border-border/80">
              <div className="flex items-center justify-between text-fg-muted">
                <span className="text-xs font-medium uppercase tracking-wider">Helferstunden</span>
                <Clock className="size-4 text-accent-ink" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {data.summary.totalHours} <span className="text-sm font-normal text-fg-muted">h</span>
              </div>
              <div className="mt-1 text-xs text-fg-muted truncate" title={data.summary.formattedTime}>
                {data.summary.formattedTime}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                <span>{data.summary.eventHours}h Anlass</span>
                <span>·</span>
                <span>{data.summary.setupHours}h Auf/Abbau</span>
              </div>
            </div>

            {/* Kachel 2: Aktive Helfende */}
            <div className="rounded-card border border-border bg-surface p-4 shadow-xs transition hover:border-border/80">
              <div className="flex items-center justify-between text-fg-muted">
                <span className="text-xs font-medium uppercase tracking-wider">Helfende</span>
                <Users className="size-4 text-accent-ink" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {data.summary.totalHelpers}
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                Ø {data.summary.averageHoursPerHelper} h pro Person
              </div>
              <div className="mt-2 text-[11px] text-fg-subtle">
                in {data.summary.totalEvents} {data.summary.totalEvents === 1 ? 'Anlass' : 'Anlässen'}
              </div>
            </div>

            {/* Kachel 3: Besetzungsgrad */}
            <div className="rounded-card border border-border bg-surface p-4 shadow-xs transition hover:border-border/80">
              <div className="flex items-center justify-between text-fg-muted">
                <span className="text-xs font-medium uppercase tracking-wider">Besetzungsgrad</span>
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {data.summary.fillRatePct} <span className="text-sm font-normal text-fg-muted">%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, data.summary.fillRatePct)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-fg-subtle">
                {data.summary.totalFilledSlots} von {data.summary.totalRequiredSlots} Schichten
              </div>
            </div>

            {/* Kachel 4: Anwesenheitsquote */}
            <div className="rounded-card border border-border bg-surface p-4 shadow-xs transition hover:border-border/80">
              <div className="flex items-center justify-between text-fg-muted">
                <span className="text-xs font-medium uppercase tracking-wider">Anwesenheit</span>
                <ShieldCheck className="size-4 text-accent-ink" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                {data.summary.attendedRatePct} <span className="text-sm font-normal text-fg-muted">%</span>
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                {data.summary.attendedHours} h bestätigt
              </div>
              <div className="mt-2 text-[11px] text-fg-subtle">
                {data.summary.totalShifts} Schichten gesamt
              </div>
            </div>
          </div>

          {/* 3. Sub-Tabs Navigation */}
          <div className="flex items-center justify-between border-b border-border print:hidden">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('helpers')}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition',
                  activeSubTab === 'helpers'
                    ? 'border-accent-ink text-accent-ink'
                    : 'border-transparent text-fg-muted hover:text-fg'
                )}
              >
                <Award className="size-4" />
                Ehrentafel & Helfende ({data.topHelpers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('events')}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition',
                  activeSubTab === 'events'
                    ? 'border-accent-ink text-accent-ink'
                    : 'border-transparent text-fg-muted hover:text-fg'
                )}
              >
                <Calendar className="size-4" />
                Anlässe ({data.events.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('stufen')}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition',
                  activeSubTab === 'stufen'
                    ? 'border-accent-ink text-accent-ink'
                    : 'border-transparent text-fg-muted hover:text-fg'
                )}
              >
                <Layers className="size-4" />
                Stufen ({data.stufen.length})
              </button>
            </div>
          </div>

          {/* 4. Tab 1: Ehrentafel & Helfende */}
          {(activeSubTab === 'helpers' || false) && (
            <div className="space-y-4">
              {/* Podest für die Top 3 der GV */}
              {data.topHelpers.length >= 3 && !helperSearch && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 print:grid-cols-3">
                  {/* Platz 2 (Silber) */}
                  <div className="order-2 flex flex-col justify-between rounded-card border border-slate-200 bg-linear-to-b from-slate-50 to-surface p-4 text-center shadow-xs dark:border-slate-800 dark:from-slate-900/40 sm:order-1">
                    <div>
                      <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <Medal className="size-5" />
                      </div>
                      <span className="mt-1 block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        2. Rang (Silber)
                      </span>
                      <h4 className="mt-1 text-base font-bold text-fg truncate" title={data.topHelpers[1].displayName}>
                        {data.topHelpers[1].ceviName || data.topHelpers[1].displayName}
                      </h4>
                      {data.topHelpers[1].ceviName && data.topHelpers[1].firstName && (
                        <p className="text-xs text-fg-muted truncate">
                          {data.topHelpers[1].firstName} {data.topHelpers[1].lastName || ''}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-border/50 pt-2 text-xs">
                      <span className="font-bold text-fg text-sm">{data.topHelpers[1].hours} h</span>
                      <span className="text-fg-muted"> ({data.topHelpers[1].shiftCount} Schichten)</span>
                    </div>
                  </div>

                  {/* Platz 1 (Gold) */}
                  <div className="order-1 flex flex-col justify-between rounded-card border-2 border-amber-400 bg-linear-to-b from-amber-50/80 to-surface p-4 text-center shadow-sm dark:border-amber-500 dark:from-amber-950/20 sm:order-2">
                    <div>
                      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-xs">
                        <Award className="size-6" />
                      </div>
                      <span className="mt-1 block text-xs font-bold text-amber-600 uppercase tracking-wider dark:text-amber-400">
                        1. Rang (Gold) 🏆
                      </span>
                      <h4 className="mt-1 text-lg font-bold text-fg truncate" title={data.topHelpers[0].displayName}>
                        {data.topHelpers[0].ceviName || data.topHelpers[0].displayName}
                      </h4>
                      {data.topHelpers[0].ceviName && data.topHelpers[0].firstName && (
                        <p className="text-xs text-fg-muted truncate">
                          {data.topHelpers[0].firstName} {data.topHelpers[0].lastName || ''}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-amber-200 pt-2 text-xs dark:border-amber-900/50">
                      <span className="font-extrabold text-amber-700 text-base dark:text-amber-300">
                        {data.topHelpers[0].hours} h
                      </span>
                      <span className="text-fg-muted"> ({data.topHelpers[0].shiftCount} Schichten in {data.topHelpers[0].eventCount} Anlässen)</span>
                    </div>
                  </div>

                  {/* Platz 3 (Bronze) */}
                  <div className="order-3 flex flex-col justify-between rounded-card border border-amber-700/20 bg-linear-to-b from-orange-50/50 to-surface p-4 text-center shadow-xs dark:border-orange-950 dark:from-orange-950/20">
                    <div>
                      <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-amber-700/20 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        <Medal className="size-5" />
                      </div>
                      <span className="mt-1 block text-xs font-semibold text-amber-700 uppercase tracking-wider dark:text-amber-400">
                        3. Rang (Bronze)
                      </span>
                      <h4 className="mt-1 text-base font-bold text-fg truncate" title={data.topHelpers[2].displayName}>
                        {data.topHelpers[2].ceviName || data.topHelpers[2].displayName}
                      </h4>
                      {data.topHelpers[2].ceviName && data.topHelpers[2].firstName && (
                        <p className="text-xs text-fg-muted truncate">
                          {data.topHelpers[2].firstName} {data.topHelpers[2].lastName || ''}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 border-t border-border/50 pt-2 text-xs">
                      <span className="font-bold text-fg text-sm">{data.topHelpers[2].hours} h</span>
                      <span className="text-fg-muted"> ({data.topHelpers[2].shiftCount} Schichten)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Suchleiste */}
              <div className="flex items-center gap-2 print:hidden">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
                  <Input
                    type="search"
                    placeholder="Helfende nach Name oder Stufe suchen..."
                    value={helperSearch}
                    onChange={(e) => setHelperSearch(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
                {helperSearch && (
                  <Button variant="secondary" size="sm" onClick={() => setHelperSearch('')}>
                    Zurücksetzen
                  </Button>
                )}
              </div>

              {/* Helfer-Tabelle */}
              <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-xs">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-border bg-surface-2 text-fg-muted">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold w-12 text-center">#</th>
                      <th className="py-2.5 px-3 font-semibold">Name / Cevi-Name</th>
                      <th className="py-2.5 px-3 font-semibold">Stufen</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Anlässe</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Schichten</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Bestätigt</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Stunden</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredHelpers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-fg-muted">
                          Keine Helfenden für «{helperSearch}» gefunden.
                        </td>
                      </tr>
                    ) : (
                      filteredHelpers.map((h, idx) => (
                        <tr key={h.userId ?? `guest-${h.displayName}-${idx}`} className="hover:bg-surface-2/50 transition">
                          <td className="py-2.5 px-3 text-center font-bold text-fg-muted">
                            {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-fg">
                            <div className="flex items-center gap-1.5">
                              {h.ceviName ? (
                                <>
                                  <span className="font-bold text-accent-ink">«{h.ceviName}»</span>
                                  {h.firstName && <span className="text-fg-muted text-xs">({h.firstName} {h.lastName || ''})</span>}
                                </>
                              ) : (
                                <span>{h.displayName}</span>
                              )}
                              {h.isGuest && (
                                <Badge tone="neutral" size="sm" className="ml-1 text-[10px]">
                                  Gast
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1">
                              {h.stufen.length > 0 ? (
                                h.stufen.map((st) => (
                                  <Badge key={st} tone="neutral" size="sm" className="text-[10px]">
                                    {st}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-fg-subtle text-xs">-</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-fg-muted font-mono">{h.eventCount}</td>
                          <td className="py-2.5 px-3 text-right text-fg-muted font-mono">{h.shiftCount}</td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            <span className={cn(h.attendedShiftCount > 0 ? 'text-emerald-600 font-semibold' : 'text-fg-muted')}>
                              {h.attendedShiftCount}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-fg font-mono">
                            {h.hours} h
                            <span className="block text-[10px] font-normal text-fg-subtle">{h.formattedTime}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Tab 2: Anlässe */}
          {activeSubTab === 'events' && (
            <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-xs">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-border bg-surface-2 text-fg-muted">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Anlass</th>
                    <th className="py-2.5 px-3 font-semibold">Datum</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Helfende</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Schichten</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Besetzungsgrad</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Anwesenheit</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Stunden</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-surface-2/50 transition">
                      <td className="py-2.5 px-3 font-medium">
                        <Link
                          href={`/events/${ev.slug}`}
                          className="text-fg hover:text-accent-ink font-semibold flex items-center gap-1.5"
                        >
                          {ev.title}
                          {!ev.isPublished && (
                            <Badge tone="neutral" size="sm" className="text-[10px]">
                              Entwurf
                            </Badge>
                          )}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-fg-muted text-xs whitespace-nowrap">
                        {fmtShortDate(ev.startDate)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-fg-muted font-mono">{ev.helpersCount}</td>
                      <td className="py-2.5 px-3 text-right text-fg-muted font-mono">
                        {ev.filledSlots} / {ev.totalSlots}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-mono text-xs">{ev.fillRatePct}%</span>
                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, ev.fillRatePct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-fg-muted">
                        {ev.attendedRatePct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-fg font-mono">
                        {ev.totalHours} h
                        <span className="block text-[10px] font-normal text-fg-subtle">
                          {ev.eventHours}h / {ev.setupHours}h
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. Tab 3: Stufen-Auswertung */}
          {activeSubTab === 'stufen' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {data.stufen.map((st) => (
                  <div
                    key={st.id}
                    className="rounded-card border border-border bg-surface p-4 shadow-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base text-fg">{st.name}</span>
                      <Badge tone="accent" size="sm">
                        {st.percentageOfTotal}% aller Stunden
                      </Badge>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent-ink transition-all duration-500"
                        style={{ width: `${Math.min(100, st.percentageOfTotal)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-fg-muted pt-1">
                      <span>{st.helpersCount} Helfende · {st.totalShifts} Einsätze</span>
                      <span className="font-bold text-fg font-mono text-sm">{st.totalHours} Std.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
