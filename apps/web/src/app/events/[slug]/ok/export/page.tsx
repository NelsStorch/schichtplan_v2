'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardCheck, Download, FileSpreadsheet, Printer, Users } from 'lucide-react';
import type { EventRosterResponseDto } from '@schichtplan/shared';
import { Button, Card, Chip, Dialog, Switch, cn, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv } from '@/lib/exportFile';
import { dayKeyToIso, fmtShortDate, fmtShortWeekday, fmtTime, fmtWeekday, groupByBusinessDay } from '@/lib/format';
import { usePortal } from '@/lib/portal';
import { PRINT_LAYOUTS, createShiftPlanPdf, downloadBlob, pdfFilename, printBlob, type PrintLayout } from '@/lib/printPlan';

export default function ExportPage() {
  const { event, base } = useOkEvent();
  const toast = useToast();
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const days = groupByBusinessDay(event.shifts, event.dayCutoffTime);
  const sorted = days.flatMap((d) => [...d.items].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((s) => ({ day: d.key, shift: s })));

  const exportPlan = () => {
    const rows: (string | number)[][] = [['Tag', 'Beginn', 'Ende', 'Schicht', 'Arbeit', 'Kategorie', 'Plätze', 'Besetzt', 'Eingeteilt']];
    for (const { day, shift } of sorted) {
      for (const task of shift.tasks ?? []) {
        const names = (shift.signups ?? []).filter((s) => s.taskId === task.id).map((s) => s.displayName);
        rows.push([
          `${fmtWeekday(dayKeyToIso(day))} ${fmtShortDate(dayKeyToIso(day))}`,
          fmtTime(shift.startTime),
          fmtTime(shift.endTime),
          shift.title,
          task.title,
          shift.category ?? '',
          task.requiredSlots,
          names.length,
          names.join(', '),
        ]);
      }
    }
    downloadCsv(`schichtplan-${event.slug}.csv`, rows);
  };

  const exportAssignments = () => {
    const rows: (string | number)[][] = [['Name', 'Alter', 'Tag', 'Beginn', 'Ende', 'Schicht', 'Arbeit', 'E-Mail (Gast)', 'Telefon (Gast)']];
    const list = sorted.flatMap(({ day, shift }) =>
      (shift.signups ?? []).map((su) => ({ day, shift, su }))
    );
    list.sort((a, b) => a.su.displayName.localeCompare(b.su.displayName, 'de') || a.shift.startTime.localeCompare(b.shift.startTime));
    for (const { day, shift, su } of list) {
      rows.push([
        su.displayName,
        su.userAge ?? '',
        `${fmtWeekday(dayKeyToIso(day))} ${fmtShortDate(dayKeyToIso(day))}`,
        fmtTime(shift.startTime),
        fmtTime(shift.endTime),
        shift.title,
        su.taskTitle ?? '',
        su.guestEmail ?? '',
        su.guestPhone ?? '',
      ]);
    }
    downloadCsv(`einteilung-${event.slug}.csv`, rows);
  };

  const exportRoster = async () => {
    setLoadingRoster(true);
    try {
      const roster = await api<EventRosterResponseDto>(`/api/events/${event.slug}/roster`);
      const min = roster.minShiftsPerPerson;
      const rows: (string | number)[][] = [
        ['Cevi-Name', 'Vorname', 'Nachname', 'Abteilung', 'Stufe', 'Alter', 'Schichten', ...(min ? ['Soll erfüllt'] : []), 'Abgemeldet', 'Grund'],
      ];
      for (const i of roster.items) {
        rows.push([
          i.ceviName ?? '',
          i.firstName,
          i.lastName,
          i.departmentName ?? '',
          i.stufen.map((s) => s.name).join(', '),
          i.age ?? '',
          i.shiftCount,
          ...(min ? [i.isDeregistered ? '' : i.shiftCount >= min ? 'ja' : 'nein'] : []),
          i.isDeregistered ? 'ja' : '',
          i.deregistrationReason ?? '',
        ]);
      }
      downloadCsv(`helfende-${event.slug}.csv`, rows);
    } catch (err) {
      toast({ title: 'Export fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    } finally {
      setLoadingRoster(false);
    }
  };

  const empty = event.shifts.length === 0;

  return (
    <div>
      <OkPageHeader
        title="Export & Drucken"
        description="Listen für Excel und Ausdrucke zum Aufhängen. Die Dateien enthalten Personendaten: nur im OK weitergeben und nach dem Anlass löschen."
        help="/ok/export/"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <ExportCard
          icon={<Printer className="size-5" />}
          title="Schichtplan drucken oder als PDF"
          text="Übersicht, Aushang mit Zeilen zum Eintragen oder Einteilung pro Person. Tage und Format wählbar."
        >
          <Button size="sm" onClick={() => setPrintOpen(true)} disabled={empty}>
            <Printer className="size-4" /> Drucken oder PDF
          </Button>
        </ExportCard>
        <ExportCard
          icon={<CalendarDays className="size-5" />}
          title="Schichtplan als Tabelle"
          text="Eine Zeile pro Schicht und Arbeit, mit Plätzen und Eingeteilten (CSV für Excel)."
        >
          <Button size="sm" variant="secondary" onClick={exportPlan} disabled={empty}>
            <FileSpreadsheet className="size-4" /> CSV herunterladen
          </Button>
        </ExportCard>
        <ExportCard
          icon={<Users className="size-5" />}
          title="Einteilung pro Person"
          text="Wer wann wo hilft, nach Namen sortiert. Bei Gästen mit Kontaktdaten."
        >
          <Button size="sm" variant="secondary" onClick={exportAssignments} disabled={empty}>
            <FileSpreadsheet className="size-4" /> CSV herunterladen
          </Button>
        </ExportCard>
        <ExportCard
          icon={<Users className="size-5" />}
          title="Helfende mit Soll"
          text="Alle Personen aus «Helfende» mit Stufe, Anzahl Schichten und Abmeldungen."
        >
          <Button size="sm" variant="secondary" onClick={exportRoster} loading={loadingRoster}>
            <FileSpreadsheet className="size-4" /> CSV herunterladen
          </Button>
        </ExportCard>
        <ExportCard
          icon={<ClipboardCheck className="size-5" />}
          title="Anwesenheitsliste"
          text="Liste zum Abhaken und Auswertung, wer da war."
        >
          <Link href={`${base}/anwesenheit`} className="text-sm font-semibold text-accent-ink hover:underline">
            Zur Anwesenheit
          </Link>
        </ExportCard>
      </div>
      <PrintDialog open={printOpen} onClose={() => setPrintOpen(false)} />
    </div>
  );
}

function ExportCard({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col justify-between gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent/10 text-accent-ink">{icon}</span>
        <div>
          <h3 className="font-bold text-fg">{title}</h3>
          <p className="mt-0.5 text-sm text-fg-muted">{text}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </Card>
  );
}

function PrintDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { event } = useOkEvent();
  const { department } = usePortal();
  const toast = useToast();
  const [busy, setBusy] = useState<'print' | 'download' | null>(null);
  const days = groupByBusinessDay(event.shifts, event.dayCutoffTime).map((d) => d.key);
  const [layout, setLayout] = useState<PrintLayout>('plan');
  const [selectedDays, setSelectedDays] = useState<string[] | null>(null);
  const [landscape, setLandscape] = useState(false);
  const [pageBreakPerDay, setPageBreakPerDay] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const chosen = selectedDays ?? days;

  const toggleDay = (key: string) =>
    setSelectedDays(chosen.includes(key) ? chosen.filter((k) => k !== key) : days.filter((k) => k === key || chosen.includes(k)));

  const run = async (action: 'print' | 'download') => {
    const options = { layout, days: chosen, landscape, pageBreakPerDay, showDetails, onlyOpen };
    setBusy(action);
    try {
      const blob = await createShiftPlanPdf(event, department, options);
      if (action === 'print') printBlob(blob, pdfFilename(event, options));
      else downloadBlob(blob, pdfFilename(event, options));
    } catch (err) {
      toast({ title: 'PDF konnte nicht erstellt werden', description: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schichtplan drucken oder als PDF"
      description="Als PDF mit Logo, direkt drucken oder herunterladen."
      footer={
        <>
          <Button variant="secondary" onClick={() => run('download')} loading={busy === 'download'} disabled={chosen.length === 0 || busy !== null}>
            <Download className="size-4" /> PDF herunterladen
          </Button>
          <Button onClick={() => run('print')} loading={busy === 'print'} disabled={chosen.length === 0 || busy !== null}>
            <Printer className="size-4" /> Drucken
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-fg">Art</legend>
          {PRINT_LAYOUTS.map((l) => (
            <label
              key={l.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-tile border p-3 transition-colors',
                layout === l.value ? 'border-fg bg-surface-2' : 'border-line hover:border-line-strong'
              )}
            >
              <input
                type="radio"
                name="print-layout"
                className="mt-1 accent-current"
                checked={layout === l.value}
                onChange={() => setLayout(l.value)}
              />
              <span>
                <span className="block text-sm font-semibold text-fg">{l.label}</span>
                <span className="block text-xs text-fg-muted">{l.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {days.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-fg">Tage</legend>
            <div className="flex flex-wrap gap-2">
              {days.map((key) => (
                <Chip key={key} selected={chosen.includes(key)} onClick={() => toggleDay(key)}>
                  {fmtShortWeekday(dayKeyToIso(key))} {fmtShortDate(dayKeyToIso(key))}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-4">
          <Switch checked={landscape} onChange={setLandscape} label="Querformat" description="Mehr Platz für viele Namen pro Zeile." />
          {layout !== 'personen' && (
            <>
              <Switch checked={pageBreakPerDay} onChange={setPageBreakPerDay} label="Jeder Tag auf einer neuen Seite" />
              <Switch
                checked={showDetails}
                onChange={setShowDetails}
                label="Details zeigen"
                description="Kategorie, Beschreibung, Altersgrenze und Verantwortliche."
              />
              <Switch
                checked={onlyOpen}
                onChange={setOnlyOpen}
                label="Nur offene Plätze"
                description="Zum Aufhängen, wenn noch Helfende gesucht werden."
              />
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
