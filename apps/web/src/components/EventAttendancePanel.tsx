'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  UserX,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  ATTENDANCE_MODES,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
  type ShiftDto,
  type ShiftSignupDto,
} from '@schichtplan/shared';
import { Badge, Button, Callout, Card, Chip, EmptyState, Input, cn, trackUi, useConfirm, useToast, useOrganization } from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtShortWeekday, fmtTime, fmtWeekday, groupByBusinessDay, fmtTimeRange } from '@/lib/format';
import type { EventDetails } from '@/lib/types';
import { CateringOverviewDialog } from './ok/CateringOverviewDialog';

type AttendanceFields = Pick<ShiftSignupDto, 'attendance' | 'attendanceAt' | 'attendanceSource' | 'attendanceByName'>;
type StatusFilter = 'ALL' | 'OPEN' | AttendanceStatus;

const STATUS_BUTTONS: Array<{ status: AttendanceStatus; short: string; icon: typeof CheckCircle2; active: string }> = [
  { status: 'PRESENT', short: 'Da', icon: CheckCircle2, active: 'border-success/50 bg-success/15 text-success-ink' },
  { status: 'EXCUSED', short: 'Entsch.', icon: FileText, active: 'border-warning/50 bg-warning/15 text-warning-ink' },
  { status: 'NO_SHOW', short: 'Fehlt', icon: UserX, active: 'border-danger/50 bg-danger/15 text-danger-ink' },
];

const statusLabel = (status: AttendanceStatus | null | undefined) => (status ? ATTENDANCE_STATUSES[status] : 'Offen');

/** «per QR-Code, 18:02» bzw. «Nels / Inferno (OK), 18:02» */
function attendanceNote(a: AttendanceFields): string | null {
  if (!a.attendance || !a.attendanceAt) return null;
  const who = a.attendanceSource === 'QR' ? 'per QR-Code' : a.attendanceByName || 'OK';
  return `${who}, ${fmtShortWeekday(a.attendanceAt)} ${fmtTime(a.attendanceAt)}`;
}

function csvCell(value: string) {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function EventAttendancePanel({
  event,
  canEditSettings,
  onOpenSettings,
  onChanged,
}: {
  event: EventDetails;
  /** Abteilungsleitung / OK-Leitung: darf den QR-Code erneuern */
  canEditSettings: boolean;
  onOpenSettings: () => void;
  onChanged: () => Promise<void>;
}) {
  const org = useOrganization();
  const toast = useToast();
  const confirm = useConfirm();
  const mode = event.attendanceMode ?? 'OFF';

  // Lokale Änderungen, bis der Anlass neu geladen ist
  const [overrides, setOverrides] = useState<Record<string, AttendanceFields>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [markingShiftId, setMarkingShiftId] = useState<string | null>(null);
  const [day, setDay] = useState('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [origin, setOrigin] = useState('');
  const [cateringStatsOpen, setCateringStatsOpen] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setOverrides({}), [event]);

  const withAttendance = (su: ShiftSignupDto): ShiftSignupDto => ({ ...su, ...overrides[su.id] });

  const shifts = useMemo(
    () =>
      event.shifts
        .filter((s) => (s.signups?.length ?? 0) > 0)
        .map((s) => ({ ...s, signups: (s.signups ?? []).map(withAttendance) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, overrides]
  );
  const days = useMemo(() => groupByBusinessDay(shifts, event.dayCutoffTime), [shifts, event.dayCutoffTime]);
  const allSignups = shifts.flatMap((s) => s.signups);
  const counts = {
    total: allSignups.length,
    PRESENT: allSignups.filter((s) => s.attendance === 'PRESENT').length,
    EXCUSED: allSignups.filter((s) => s.attendance === 'EXCUSED').length,
    NO_SHOW: allSignups.filter((s) => s.attendance === 'NO_SHOW').length,
    OPEN: allSignups.filter((s) => !s.attendance).length,
  };

  const visibleDays = useMemo(() => {
    const query = search.trim().toLowerCase();
    return days
      .filter((d) => day === 'ALL' || d.key === day)
      .map((d) => ({
        ...d,
        items: d.items
          .map((s) => ({
            ...s,
            signups: s.signups.filter((su) => {
              if (statusFilter === 'OPEN' && su.attendance) return false;
              if (statusFilter !== 'ALL' && statusFilter !== 'OPEN' && su.attendance !== statusFilter) return false;
              if (!query) return true;
              return (
                su.displayName.toLowerCase().includes(query) ||
                (s.title ? s.title.toLowerCase().includes(query) : false) ||
                (su.taskTitle?.toLowerCase().includes(query) ?? false)
              );
            }),
          }))
          .filter((s) => s.signups.length > 0),
      }))
      .filter((d) => d.items.length > 0);
  }, [days, day, search, statusFilter]);

  const setStatus = async (signup: ShiftSignupDto, status: AttendanceStatus | null) => {
    setSaving(signup.id);
    try {
      const res = await api<AttendanceFields>(`/api/events/${event.slug}/signups/${signup.id}/attendance`, {
        method: 'PUT',
        json: { status },
      });
      setOverrides((prev) => ({ ...prev, [signup.id]: res }));
    } catch (err) {
      toast({ title: 'Anwesenheit nicht gespeichert', description: errorMessage(err), tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  const markAllOpenPresent = async (shiftId: string, openSignups: ShiftSignupDto[]) => {
    if (openSignups.length === 0) return;
    setMarkingShiftId(shiftId);
    try {
      const updates = await Promise.all(
        openSignups.map(async (su) => {
          const res = await api<AttendanceFields>(`/api/events/${event.slug}/signups/${su.id}/attendance`, {
            method: 'PUT',
            json: { status: 'PRESENT' },
          });
          return [su.id, res] as const;
        })
      );
      setOverrides((prev) => {
        const next = { ...prev };
        for (const [id, res] of updates) next[id] = res;
        return next;
      });
      toast({
        title: `${openSignups.length} Person${openSignups.length === 1 ? '' : 'en'} als anwesend markiert`,
        tone: 'success',
      });
    } catch (err) {
      toast({ title: 'Anwesenheit nicht gespeichert', description: errorMessage(err), tone: 'error' });
    } finally {
      setMarkingShiftId(null);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onChanged();
    } finally {
      setRefreshing(false);
    }
  };

  const checkinLink = event.checkinToken && origin
    ? `${origin}/events/${event.slug}/checkin?code=${encodeURIComponent(event.checkinToken)}`
    : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(checkinLink);
      toast({ title: 'Check-in-Link kopiert', tone: 'success' });
    } catch {
      toast({ title: 'Kopieren nicht möglich', description: checkinLink, tone: 'error' });
    }
  };

  const rotateCode = async () => {
    const ok = await confirm({
      title: 'QR-Code erneuern?',
      description:
        'Der bisherige QR-Code und alle ausgedruckten Plakate funktionieren danach nicht mehr. Du musst den neuen Code ausdrucken.',
      confirmLabel: 'Erneuern',
      tone: 'danger',
    });
    if (!ok) return;
    setRotating(true);
    try {
      await api(`/api/events/${event.slug}/checkin-token`, { method: 'POST' });
      await onChanged();
      setQrVersion((v) => v + 1);
      toast({ title: 'Neuer QR-Code erstellt', tone: 'success' });
    } catch (err) {
      toast({ title: 'QR-Code nicht erneuert', description: errorMessage(err), tone: 'error' });
    } finally {
      setRotating(false);
    }
  };

  const exportRows = () =>
    shifts.flatMap((s) =>
      s.signups.map((su) => ({
        date: fmtWeekday(s.startTime),
        time: `${fmtTimeRange(s.startTime, s.endTime)}`,
        shift: s.title ?? '',
        task: su.taskTitle ?? '',
        name: su.displayName,
        status: statusLabel(su.attendance),
        note: attendanceNote(su) ?? '',
      }))
    );

  const downloadCsv = () => {
    const header = ['Tag', 'Zeit', 'Schicht', 'Arbeit', 'Name', 'Anwesenheit', 'Erfasst'];
    const lines = [header, ...exportRows().map((r) => [r.date, r.time, r.shift, r.task, r.name, r.status, r.note])]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n');
    // BOM, damit Excel die Umlaute richtig liest
    const blob = new Blob(['﻿' + lines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `anwesenheit-${event.slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    trackUi('UI_CSV', 'ATTENDANCE');
  };

  const printList = () => {
    const win = window.open('', '_blank');
    if (!win) {
      toast({ title: 'Druckansicht blockiert', description: 'Bitte Pop-ups für diese Seite erlauben.', tone: 'error' });
      return;
    }
    const body = shifts
      .map(
        (s) => `
        <h2>${escapeHtml(s.title || fmtTimeRange(s.startTime, s.endTime))} <small>${escapeHtml(fmtWeekday(s.startTime))}, ${fmtTimeRange(s.startTime, s.endTime)}</small></h2>
        <table>
          <thead><tr><th class="box">Da</th><th>Name</th><th>Arbeit</th><th>Status</th><th>Erfasst</th></tr></thead>
          <tbody>${s.signups
            .map(
              (su) => `<tr>
                <td class="box">${su.attendance === 'PRESENT' ? '&#10003;' : ''}</td>
                <td>${escapeHtml(su.displayName)}</td>
                <td>${escapeHtml(su.taskTitle ?? '')}</td>
                <td>${su.attendance ? escapeHtml(statusLabel(su.attendance)) : ''}</td>
                <td>${escapeHtml(attendanceNote(su) ?? '')}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table>`
      )
      .join('');
    win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
      <title>Anwesenheit ${escapeHtml(event.title)}</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 24px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 16px; }
        h2 { font-size: 15px; margin: 20px 0 6px; break-after: avoid; }
        h2 small { font-weight: normal; color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; break-inside: avoid; }
        th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; }
        th { background: #eee; }
        .box { width: 32px; text-align: center; }
      </style></head><body>
      <h1>Anwesenheit: ${escapeHtml(event.title)}</h1>${body}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    trackUi('UI_ATTENDANCE_PRINT');
  };

  if (mode === 'OFF') {
    return (
      <div>
        <EmptyState
          icon={<ClipboardCheck />}
          title="Anwesenheitsliste ist ausgeschaltet"
          description="Schalte sie unter «Einstellungen» ein. Dort wählst du auch, ob nur das OK abhakt oder ob sich die Helfenden zusätzlich per QR-Code selbst einchecken."
          action={
            canEditSettings ? (
              <Button size="sm" onClick={onOpenSettings}>
                <Settings className="size-4" /> Einstellungen öffnen
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-fg">Anwesenheitsliste</h3>
          <p className="text-xs text-fg-muted">{ATTENDANCE_MODES[mode]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" loading={refreshing} onClick={refresh}>
            <RefreshCw className="size-3.5" /> Aktualisieren
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadCsv} disabled={counts.total === 0}>
            <Download className="size-4" /> CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={printList} disabled={counts.total === 0}>
            <Printer className="size-4" /> Drucken
          </Button>
          {event.cateringTokensEnabled && (
            <Button variant="secondary" size="sm" onClick={() => setCateringStatsOpen(true)}>
              <UtensilsCrossed className="size-4" /> Verpflegung
            </Button>
          )}
        </div>
      </div>

      {/* Zähler */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Anwesend', counts.PRESENT, 'text-success-ink'],
            ['Entschuldigt', counts.EXCUSED, 'text-warning-ink'],
            ['Nicht erschienen', counts.NO_SHOW, 'text-danger-ink'],
            ['Offen', counts.OPEN, 'text-fg'],
          ] as const
        ).map(([label, value, tone]) => (
          <Card key={label} className="p-4">
            <p className={cn('text-xs font-semibold uppercase tracking-wider', tone)}>{label}</p>
            <p className={cn('font-display text-2xl font-extrabold mt-1 tabular', tone)}>
              {value} <span className="text-sm font-normal text-fg-muted">/ {counts.total}</span>
            </p>
          </Card>
        ))}
      </div>

      {/* QR-Code für den Selbst-Check-in */}
      {mode === 'OK_AND_QR' && event.checkinToken && (
        <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${event.checkinToken}-${qrVersion}`}
            src={`/api/events/${event.slug}/checkin-qr?format=svg&v=${encodeURIComponent(event.checkinToken.slice(0, 6))}`}
            alt="QR-Code für den Selbst-Check-in"
            className="size-40 shrink-0 self-center rounded-tile border border-line bg-white p-2"
          />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="flex items-center gap-2 font-bold text-fg">
                <QrCode className="size-4" /> Selbst-Check-in per QR-Code
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                Häng den Code am Eingang auf. Wer eingetragen ist, scannt ihn, meldet sich an und wird für die Schicht
                abgehakt, die gerade läuft (ab 30 Minuten vor Beginn bis Schichtende).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/events/${event.slug}/checkin-qr?format=pdf`}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-fg shadow-glow hover:brightness-110 [&_svg]:size-4'
                )}
              >
                <Printer /> A4-Plakat (PDF)
              </a>
              <Button size="sm" variant="secondary" onClick={copyLink} disabled={!checkinLink}>
                <Copy className="size-4" /> Link kopieren
              </Button>
              {canEditSettings && (
                <Button size="sm" variant="ghost" loading={rotating} onClick={rotateCode}>
                  <RotateCcw className="size-4" /> Code erneuern
                </Button>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle">
              Erstellt mit dem {org.name}-QR-Generator. Der Link enthält einen geheimen Code: Wer ihn kennt,
              kann sich von überall einchecken. Bei Bedarf erneuern.
            </p>
          </div>
        </Card>
      )}

      {counts.total === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="Noch niemand eingetragen"
          description="Sobald Helfende in Schichten eingetragen sind, kannst du sie hier abhaken."
        />
      ) : (
        <>
          {/* Filter */}
          <div className="space-y-3 rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip selected={day === 'ALL'} onClick={() => setDay('ALL')}>
                Alle Tage
              </Chip>
              {days.map((d) => (
                <Chip key={d.key} selected={day === d.key} onClick={() => setDay(d.key)}>
                  {fmtShortWeekday(dayKeyToIso(d.key))} {fmtDayMonth(dayKeyToIso(d.key))}
                </Chip>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['ALL', `Alle (${counts.total})`],
                    ['OPEN', `Offen (${counts.OPEN})`],
                    ['PRESENT', `Anwesend (${counts.PRESENT})`],
                    ['EXCUSED', `Entschuldigt (${counts.EXCUSED})`],
                    ['NO_SHOW', `Nicht erschienen (${counts.NO_SHOW})`],
                  ] as const
                ).map(([key, label]) => (
                  <Chip key={key} selected={statusFilter === key} onClick={() => setStatusFilter(key)}>
                    {label}
                  </Chip>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
                <Input
                  className="h-9 pl-9 pr-8 text-sm"
                  placeholder="Name, Schicht oder Arbeit…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Suche leeren"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {visibleDays.length === 0 ? (
            <EmptyState icon={<Search />} title="Keine passenden Einträge" description="Passe den Filter oder die Suche an." />
          ) : (
            visibleDays.map((d) => (
              <section key={d.key} className="space-y-3">
                <h4 className="text-sm font-bold text-fg">
                  {fmtWeekday(dayKeyToIso(d.key))}, {fmtDayMonth(dayKeyToIso(d.key))}
                </h4>
                {d.items.map((s) => (
                  <ShiftAttendanceCard
                    key={s.id}
                    shift={s}
                    allSignups={shifts.find((x) => x.id === s.id)?.signups ?? s.signups}
                    saving={saving}
                    markingAll={markingShiftId === s.id}
                    onSet={setStatus}
                    onMarkAllOpen={(openSignups) => markAllOpenPresent(s.id, openSignups)}
                  />
                ))}
              </section>
            ))
          )}
        </>
      )}

      {mode === 'OK_AND_QR' && !event.checkinToken && (
        <Callout tone="warning" title="Kein QR-Code vorhanden">
          Speichere die Einstellungen einmal neu, damit ein Check-in-Code erstellt wird.
        </Callout>
      )}

      {event.cateringTokensEnabled && (
        <CateringOverviewDialog
          open={cateringStatsOpen}
          onClose={() => setCateringStatsOpen(false)}
          eventSlug={event.slug}
        />
      )}
    </div>
  );
}

function ShiftAttendanceCard({
  shift,
  allSignups,
  saving,
  markingAll,
  onSet,
  onMarkAllOpen,
}: {
  shift: ShiftDto & { signups: ShiftSignupDto[] };
  allSignups: ShiftSignupDto[];
  saving: string | null;
  markingAll: boolean;
  onSet: (signup: ShiftSignupDto, status: AttendanceStatus | null) => void;
  onMarkAllOpen: (openSignups: ShiftSignupDto[]) => void;
}) {
  const present = allSignups.filter((su) => su.attendance === 'PRESENT').length;
  const openSignups = shift.signups.filter((su) => !su.attendance);
  const now = Date.now();
  const running = new Date(shift.startTime).getTime() - 30 * 60_000 <= now && now <= new Date(shift.endTime).getTime();

  return (
    <Card className={cn('p-4', running && 'border-accent/50')}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-fg">
            {shift.title}{' '}
            {running && (
              <Badge tone="accent" size="sm">
                läuft
              </Badge>
            )}
          </p>
          <p className="text-xs text-fg-muted">
            {fmtTimeRange(shift.startTime, shift.endTime)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {openSignups.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              loading={markingAll}
              disabled={saving !== null || markingAll}
              onClick={() => onMarkAllOpen(openSignups)}
            >
              <CheckCircle2 className="size-3.5" /> Alle offenen als Da ({openSignups.length})
            </Button>
          )}
          <Badge tone={present === allSignups.length ? 'success' : 'neutral'}>
            {present} / {allSignups.length} anwesend
          </Badge>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {shift.signups.map((su) => {
          const note = attendanceNote(su);
          return (
            <li key={su.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{su.displayName}</p>
                <p className="text-xs text-fg-muted">
                  {[su.taskTitle, note].filter(Boolean).join(' · ') || 'Offen'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Anwesenheit ${su.displayName}`}>
                {STATUS_BUTTONS.map(({ status, short, icon: Icon, active }) => {
                  const selected = su.attendance === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={saving === su.id}
                      aria-pressed={selected}
                      title={selected ? `${ATTENDANCE_STATUSES[status]} (nochmals klicken = offen)` : ATTENDANCE_STATUSES[status]}
                      onClick={() => onSet(su, selected ? null : status)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition disabled:opacity-50',
                        selected ? active : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg'
                      )}
                    >
                      <Icon className="size-4" />
                      <span>{short}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
