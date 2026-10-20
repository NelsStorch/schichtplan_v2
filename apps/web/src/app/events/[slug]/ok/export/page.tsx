'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ClipboardCheck, FileSpreadsheet, Printer, Users } from 'lucide-react';
import type { EventRosterResponseDto } from '@schichtplan/shared';
import { Button, Card, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv, escapeHtml, openPrintWindow } from '@/lib/exportFile';
import { dayKeyToIso, fmtDateRange, fmtDayMonth, fmtShortDate, fmtTime, fmtWeekday, groupByBusinessDay } from '@/lib/format';

export default function ExportPage() {
  const { event, base } = useOkEvent();
  const toast = useToast();
  const [loadingRoster, setLoadingRoster] = useState(false);
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

  const printPlan = (withEmptyLines: boolean) => {
    const body =
      `<h1>${escapeHtml(event.title)}</h1><p class="sub">${escapeHtml(fmtDateRange(event.startDate, event.endDate))}</p>` +
      days
        .map((d) => {
          const iso = dayKeyToIso(d.key);
          const shifts = [...d.items].sort((a, b) => a.startTime.localeCompare(b.startTime));
          const responsibles = event.dayResponsibles?.[d.key]?.map((r) => r.displayName).join(', ');
          return `<section class="day"><h2>${escapeHtml(fmtWeekday(iso))} ${escapeHtml(fmtDayMonth(iso))}${
            responsibles ? ` <small>Tagesleitung: ${escapeHtml(responsibles)}</small>` : ''
          }</h2>
          <table><thead><tr><th style="width:90px">Zeit</th><th style="width:28%">Schicht / Arbeit</th><th>Eingeteilt</th></tr></thead><tbody>
          ${shifts
            .flatMap((s) =>
              (s.tasks ?? []).map((t) => {
                const names = (s.signups ?? []).filter((su) => su.taskId === t.id).map((su) => escapeHtml(su.displayName));
                const free = Math.max(0, t.requiredSlots - names.length);
                const cells = withEmptyLines ? [...names, ...Array.from({ length: free }, () => '&nbsp;')] : names;
                const list = withEmptyLines
                  ? cells.map((c) => `<div style="border-bottom:1px solid #ccc;min-height:18px">${c}</div>`).join('')
                  : `${names.join(', ') || '<span class="muted">niemand</span>'}${free ? ` <span class="muted">(${free} frei)</span>` : ''}`;
                const label = (s.tasks?.length ?? 0) > 1 || t.title !== s.title ? `${escapeHtml(s.title)}<br><span class="muted">${escapeHtml(t.title)}</span>` : escapeHtml(s.title);
                return `<tr><td>${fmtTime(s.startTime)}–${fmtTime(s.endTime)}</td><td>${label}</td><td>${list}</td></tr>`;
              })
            )
            .join('')}
          </tbody></table></section>`;
        })
        .join('');
    if (!openPrintWindow(`Schichtplan ${event.title}`, body)) {
      toast({ title: 'Druckansicht blockiert', description: 'Bitte Pop-ups für diese Seite erlauben.', tone: 'error' });
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
          title="Schichtplan drucken"
          text="Pro Tag eine Seite mit allen Schichten und Eingeteilten."
        >
          <Button size="sm" onClick={() => printPlan(false)} disabled={empty}>
            Drucken
          </Button>
          <Button size="sm" variant="secondary" onClick={() => printPlan(true)} disabled={empty}>
            Mit leeren Zeilen
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
