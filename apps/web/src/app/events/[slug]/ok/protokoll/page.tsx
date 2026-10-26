'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, History, RefreshCw, Repeat, Search, UserMinus, UserPlus, X } from 'lucide-react';
import type { ShiftSignupLogDto } from '@schichtplan/shared';
import { ATTENDANCE_STATUSES } from '@schichtplan/shared';
import { Badge, Button, Card, Chip, EmptyState, Input, Skeleton, cn, useToast } from '@schichtplan/ui';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { fmtWeekday, fmtTimeRange } from '@/lib/format';

type Action = 'ALL' | 'SIGNUP' | 'SIGNOFF' | 'REPLACE' | 'ATTENDANCE';

const stampFmt = new Intl.DateTimeFormat('de-CH', {
  timeZone: 'Europe/Zurich',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export default function LogPage() {
  const { event } = useOkEvent();
  const toast = useToast();
  const [logs, setLogs] = useState<ShiftSignupLogDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<Action>('ALL');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await api<ShiftSignupLogDto[]>(`/api/events/${event.slug}/logs`));
    } catch (err) {
      toast({ title: 'Protokoll konnte nicht geladen werden', description: errorMessage(err), tone: 'error' });
      setLogs((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, [event.slug, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const list = logs ?? [];
    return {
      ALL: list.length,
      SIGNUP: list.filter((l) => l.action === 'SIGNUP').length,
      SIGNOFF: list.filter((l) => l.action === 'SIGNOFF').length,
      REPLACE: list.filter((l) => l.action === 'REPLACE').length,
      ATTENDANCE: list.filter((l) => l.action === 'ATTENDANCE').length,
    };
  }, [logs]);

  const q = search.trim().toLowerCase();
  const filtered = (logs ?? []).filter((l) => {
    if (action !== 'ALL' && l.action !== action) return false;
    if (!q) return true;
    return [l.helperName, l.shiftTitle, l.taskTitle ?? '', l.performedByName ?? ''].some((v) => v.toLowerCase().includes(q));
  });

  return (
    <div>
      <OkPageHeader
        title="Protokoll"
        description="Wer sich wann ein- oder ausgetragen hat und wer die Anwesenheit erfasst hat."
        help="/ok/auswertung/#aktivitaets-protokoll"
        actions={
          <Button variant="secondary" size="sm" loading={loading} onClick={load}>
            <RefreshCw className="size-3.5" /> Aktualisieren
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Chip selected={action === 'ALL'} count={counts.ALL} onClick={() => setAction('ALL')}>
            Alle
          </Chip>
          <Chip selected={action === 'SIGNUP'} count={counts.SIGNUP} onClick={() => setAction('SIGNUP')}>
            Eintragungen
          </Chip>
          <Chip selected={action === 'SIGNOFF'} count={counts.SIGNOFF} onClick={() => setAction('SIGNOFF')}>
            Austragungen
          </Chip>
          {counts.REPLACE > 0 && (
            <Chip selected={action === 'REPLACE'} count={counts.REPLACE} onClick={() => setAction('REPLACE')}>
              Übernommen
            </Chip>
          )}
          {counts.ATTENDANCE > 0 && (
            <Chip selected={action === 'ATTENDANCE'} count={counts.ATTENDANCE} onClick={() => setAction('ATTENDANCE')}>
              Anwesenheit
            </Chip>
          )}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            className="h-10 pl-9 pr-8 text-sm"
            placeholder="Person oder Schicht…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Protokoll durchsuchen"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
              aria-label="Suche leeren"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {logs === null ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-card" />
          <Skeleton className="h-14 rounded-card" />
          <Skeleton className="h-14 rounded-card" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<History />}
          title={logs.length === 0 ? 'Noch keine Einträge' : 'Keine passenden Einträge'}
          description={
            logs.length === 0
              ? 'Sobald sich jemand ein- oder austrägt, steht es hier mit Zeit und Person.'
              : 'Passe Filter oder Suche an.'
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {filtered.map((item) => {
            const isSignup = item.action === 'SIGNUP';
            const isAttendance = item.action === 'ATTENDANCE';
            const isReplace = item.action === 'REPLACE';
            return (
              <div key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                      isAttendance
                        ? 'bg-accent/15 text-accent-ink'
                        : isReplace
                          ? 'bg-warning/15 text-warning-ink'
                          : isSignup
                            ? 'bg-success/15 text-success-ink'
                            : 'bg-danger/15 text-danger-ink'
                    )}
                  >
                    {isAttendance ? (
                      <ClipboardCheck className="size-4" />
                    ) : isReplace ? (
                      <Repeat className="size-4" />
                    ) : isSignup ? (
                      <UserPlus className="size-4" />
                    ) : (
                      <UserMinus className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-fg">{item.helperName}</span>
                      <Badge tone={isAttendance ? 'accent' : isReplace ? 'warning' : isSignup ? 'success' : 'danger'} size="sm">
                        {isAttendance
                          ? `Anwesenheit: ${item.attendance ? ATTENDANCE_STATUSES[item.attendance] : 'offen'}`
                          : isReplace
                            ? 'Übernommen'
                            : isSignup
                              ? 'Eingetragen'
                              : 'Ausgetragen'}
                      </Badge>
                      <span className="text-2xs text-fg-subtle">
                        {isReplace
                          ? `von ${item.performedByName ?? 'Gast'}`
                          : item.performedByName
                            ? `durch ${item.performedByName}`
                            : isAttendance
                              ? 'per QR-Code'
                              : 'selbst'}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      «{item.shiftTitle}»{item.taskTitle && item.taskTitle !== item.shiftTitle ? ` · ${item.taskTitle}` : ''}
                      {item.shiftStartTime && item.shiftEndTime
                        ? ` · ${fmtWeekday(item.shiftStartTime)}, ${fmtTimeRange(item.shiftStartTime, item.shiftEndTime)}`
                        : ''}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 pl-11 font-mono text-2xs text-fg-subtle tabular sm:pl-0">
                  {stampFmt.format(new Date(item.createdAt))}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
