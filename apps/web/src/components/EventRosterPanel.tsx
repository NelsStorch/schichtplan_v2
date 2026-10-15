'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Info,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import type { EventRosterItemDto, EventRosterResponseDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  cn,
  useToast,
} from '@schichtplan/ui';
import { api, errorMessage } from '@/lib/api';
import { fmtShortWeekday, fmtTime } from '@/lib/format';
import type { EventDetails } from '@/lib/types';

export function EventRosterPanel({
  event,
  onOpenSettings,
}: {
  event: EventDetails;
  onOpenSettings?: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<EventRosterResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'FULFILLED' | 'DEREGISTERED'>('ALL');
  const [stufeFilter, setStufeFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Abmelde-Dialog
  const [deregisterTarget, setDeregisterTarget] = useState<EventRosterItemDto | null>(null);
  const [deregisterReason, setDeregisterReason] = useState('');
  const [deregisterSaving, setDeregisterSaving] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      const res = await api<EventRosterResponseDto>(`/api/events/${event.slug}/roster`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [event.slug]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // Abmelden speichern
  const handleDeregisterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!deregisterTarget) return;
    setDeregisterSaving(true);
    try {
      await api(`/api/events/${event.slug}/deregistrations`, {
        method: 'POST',
        json: {
          userId: deregisterTarget.userId,
          reason: deregisterReason.trim() || undefined,
        },
      });
      toast({
        title: `${deregisterTarget.displayName} abgemeldet`,
        description: 'Die Person muss an diesem Event keine Schichten übernehmen.',
      });
      setDeregisterTarget(null);
      setDeregisterReason('');
      await loadRoster();
    } catch (err) {
      toast({ title: 'Abmelden fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    } finally {
      setDeregisterSaving(false);
    }
  };

  // Abmeldung aufheben
  const handleCancelDeregistration = async (item: EventRosterItemDto) => {
    try {
      await api(`/api/events/${event.slug}/deregistrations/${item.userId}`, {
        method: 'DELETE',
      });
      toast({
        title: `Abmeldung für ${item.displayName} aufgehoben`,
        description: 'Die Person wird wieder regulär im Helfer-Pool geführt.',
      });
      await loadRoster();
    } catch (err) {
      toast({ title: 'Aktion fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  // Kennzahlen berechnen
  const minShifts = data?.minShiftsPerPerson ?? null;
  const items = data?.items ?? [];

  const stats = useMemo(() => {
    const total = items.length;
    const deregistered = items.filter((i) => i.isDeregistered).length;
    const active = items.filter((i) => !i.isDeregistered);

    const fulfilled = minShifts !== null
      ? active.filter((i) => i.shiftCount >= minShifts).length
      : active.filter((i) => i.shiftCount > 0).length;

    const open = minShifts !== null
      ? active.filter((i) => i.shiftCount < minShifts).length
      : active.filter((i) => i.shiftCount === 0).length;

    const totalAssignedShifts = items.reduce((sum, i) => sum + i.shiftCount, 0);

    return { total, deregistered, fulfilled, open, totalAssignedShifts };
  }, [items, minShifts]);

  // Alle vorkommenden Stufen und Abteilungen für Filter
  const availableStufen = useMemo(() => {
    const set = new Map<string, string>();
    for (const item of items) {
      for (const s of item.stufen) {
        set.set(s.id, s.name);
      }
    }
    return [...set.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  const availableDepts = useMemo(() => {
    const set = new Map<string, string>();
    for (const item of items) {
      if (item.departmentId && item.departmentName) {
        set.set(item.departmentId, item.departmentName);
      }
    }
    return [...set.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);

  // Gefilterte Liste
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      // Suchfilter
      if (q) {
        const matchName =
          (item.ceviName && item.ceviName.toLowerCase().includes(q)) ||
          item.firstName.toLowerCase().includes(q) ||
          item.lastName.toLowerCase().includes(q) ||
          item.displayName.toLowerCase().includes(q);
        const matchStufe = item.stufen.some((s) => s.name.toLowerCase().includes(q));
        const matchDept = item.departmentName?.toLowerCase().includes(q);
        if (!matchName && !matchStufe && !matchDept) return false;
      }

      // Status-Filter
      if (statusFilter === 'DEREGISTERED' && !item.isDeregistered) return false;
      if (statusFilter === 'FULFILLED') {
        if (item.isDeregistered) return false;
        if (minShifts !== null && item.shiftCount < minShifts) return false;
        if (minShifts === null && item.shiftCount === 0) return false;
      }
      if (statusFilter === 'OPEN') {
        if (item.isDeregistered) return false;
        if (minShifts !== null && item.shiftCount >= minShifts) return false;
        if (minShifts === null && item.shiftCount > 0) return false;
      }

      // Stufen-Filter
      if (stufeFilter !== 'ALL' && !item.stufen.some((s) => s.id === stufeFilter || s.name === stufeFilter)) {
        return false;
      }

      // Abteilungs-Filter
      if (deptFilter !== 'ALL' && item.departmentId !== deptFilter) {
        return false;
      }

      return true;
    });
  }, [items, search, statusFilter, stufeFilter, deptFilter, minShifts]);

  if (loading) {
    return (
      <div className="py-6 space-y-4">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-6">
        <Callout tone="danger">Fehler beim Laden des Helfer-Pools: {error || 'Keine Daten'}</Callout>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-6">
      {/* Hinweis wenn Event nicht auf Abteilungen/Stufen beschränkt ist */}
      {!data.isRestricted && (
        <Callout tone="info" className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-fg">Öffentlicher Anlass ohne Abteilungs- oder Stufen-Filter</p>
            <p className="mt-1 text-xs text-fg-muted">
              Dieser Anlass ist für «{data.scopeDescription}» freigegeben. Der feste Helfer-Pool und die automatische
              Soll-Erfassung stehen bei Anlässen mit Abteilungs- oder Stufen-Einschränkung zur Verfügung.
            </p>
          </div>
          {onOpenSettings && (
            <Button size="sm" variant="secondary" onClick={onOpenSettings} className="shrink-0">
              <Settings className="size-3.5" /> Zugang anpassen
            </Button>
          )}
        </Callout>
      )}

      {/* Soll-Header & Übersicht */}
      <Card className="p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent-ink">
              <Users className="size-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-fg">Helfer-Pool &amp; Schicht-Soll</h3>
              <p className="text-xs text-fg-muted">
                Zielgruppe: <span className="font-medium text-fg">{data.scopeDescription}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {minShifts !== null ? (
              <Badge tone="accent" className="font-bold">
                🎯 Soll: mind. {minShifts} Schicht{minShifts > 1 ? 'en' : ''} / Person
              </Badge>
            ) : (
              <Badge tone="neutral" className="text-fg-subtle">
                Kein Soll festgelegt
              </Badge>
            )}
            {onOpenSettings && (
              <Button size="sm" variant="ghost" onClick={onOpenSettings} title="Soll in den Event-Einstellungen ändern">
                <Settings className="size-3.5" />
                <span className="hidden sm:inline">{minShifts !== null ? 'Soll anpassen' : 'Soll festlegen'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-card border border-line bg-surface-2/60 p-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">Helfer-Pool</p>
            <p className="mt-1 font-display text-2xl font-black text-fg">{stats.total}</p>
            <p className="text-2xs text-fg-muted">berechtigte Personen</p>
          </div>

          <div className="rounded-card border border-line bg-surface-2/60 p-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-success-ink">Soll erfüllt</p>
            <p className="mt-1 font-display text-2xl font-black text-success-ink">{stats.fulfilled}</p>
            <p className="text-2xs text-fg-muted">
              {minShifts !== null ? `mind. ${minShifts} Schichten` : 'mind. 1 Schicht'}
            </p>
          </div>

          <div className="rounded-card border border-line bg-surface-2/60 p-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-warning-ink">Noch offen</p>
            <p className="mt-1 font-display text-2xl font-black text-warning-ink">{stats.open}</p>
            <p className="text-2xs text-fg-muted">brauchen noch Schichten</p>
          </div>

          <div className="rounded-card border border-line bg-surface-2/60 p-3">
            <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">Abgemeldet</p>
            <p className="mt-1 font-display text-2xl font-black text-fg-muted">{stats.deregistered}</p>
            <p className="text-2xs text-fg-muted">müssen nicht helfen</p>
          </div>
        </div>
      </Card>

      {/* Filterleiste */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-subtle" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Cevi-Name oder Name suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Chip selected={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>
          Alle ({stats.total})
        </Chip>
        <Chip selected={statusFilter === 'OPEN'} onClick={() => setStatusFilter('OPEN')}>
          Noch offen ({stats.open})
        </Chip>
        <Chip selected={statusFilter === 'FULFILLED'} onClick={() => setStatusFilter('FULFILLED')}>
          Erfüllt ({stats.fulfilled})
        </Chip>
        <Chip selected={statusFilter === 'DEREGISTERED'} onClick={() => setStatusFilter('DEREGISTERED')}>
          Abgemeldet ({stats.deregistered})
        </Chip>

        {/* Stufen-Filter falls mehrere existieren */}
        {availableStufen.length > 1 && (
          <div className="min-w-[8rem]">
            <Select
              className="h-9 text-xs"
              value={stufeFilter}
              onChange={(e) => setStufeFilter(e.target.value)}
            >
              <option value="ALL">Alle Stufen ({availableStufen.length})</option>
              {availableStufen.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Abteilungs-Filter falls mehrere existieren */}
        {data.multipleDepartments && availableDepts.length > 1 && (
          <div className="min-w-[9rem]">
            <Select
              className="h-9 text-xs"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="ALL">Alle Abteilungen</option>
              {availableDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* Tabelle aller Personen im Pool */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<Filter />}
          title="Keine Personen gefunden"
          description={
            search || statusFilter !== 'ALL' || stufeFilter !== 'ALL' || deptFilter !== 'ALL'
              ? 'Keine Treffer für die aktuellen Filterkriterien.'
              : 'Aktuell sind noch keine berechtigten Personen im Helfer-Pool.'
          }
          action={
            (search || statusFilter !== 'ALL' || stufeFilter !== 'ALL' || deptFilter !== 'ALL') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                  setStufeFilter('ALL');
                  setDeptFilter('ALL');
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-4 py-3">Person / Cevi-Name</th>
                  {/* Abteilung wird ausgeblendet wenn nur 1 Abteilung involviert ist */}
                  {data.multipleDepartments && <th className="px-4 py-3">Abteilung</th>}
                  <th className="px-4 py-3">Stufe</th>
                  <th className="px-4 py-3">Alter</th>
                  <th className="px-4 py-3">Schichten</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredItems.map((item) => {
                  const isExpanded = expandedUserId === item.userId;
                  const isTargetMet = minShifts !== null
                    ? item.shiftCount >= minShifts
                    : item.shiftCount > 0;

                  return (
                    <tr
                      key={item.userId}
                      className={cn(
                        'transition hover:bg-surface-2/50',
                        item.isDeregistered && 'bg-surface-2/30 opacity-75'
                      )}
                    >
                      {/* Name & Cevi-Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={item.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="font-bold text-fg truncate">
                              {item.ceviName ? item.ceviName : `${item.firstName} ${item.lastName}`}
                            </p>
                            {item.ceviName && (
                              <p className="text-2xs text-fg-muted truncate">
                                {item.firstName} {item.lastName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Abteilung (nur bei mehreren) */}
                      {data.multipleDepartments && (
                        <td className="px-4 py-3 text-xs text-fg-muted">
                          {item.departmentName || '–'}
                        </td>
                      )}

                      {/* Stufe */}
                      <td className="px-4 py-3">
                        {item.stufen.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.stufen.map((s) => (
                              <Badge key={s.id} tone="neutral" className="text-2xs">
                                {s.name}
                                {s.role === 'LEITUNG' && ' 👑'}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-fg-subtle">–</span>
                        )}
                      </td>

                      {/* Alter */}
                      <td className="px-4 py-3 text-xs text-fg-muted">
                        {item.age !== null ? `${item.age} J.` : '–'}
                      </td>

                      {/* Schichten */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'font-display text-sm font-bold',
                              item.isDeregistered
                                ? 'text-fg-subtle'
                                : isTargetMet
                                ? 'text-success-ink'
                                : item.shiftCount > 0
                                ? 'text-warning-ink'
                                : 'text-fg-muted'
                            )}
                          >
                            {minShifts !== null
                              ? `${item.shiftCount} / ${minShifts}`
                              : `${item.shiftCount} Schicht${item.shiftCount === 1 ? '' : 'en'}`}
                          </span>

                          {item.shifts.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedUserId(isExpanded ? null : item.userId)}
                              className="rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
                              title="Schichtdetails ein-/ausblenden"
                            >
                              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </button>
                          )}
                        </div>

                        {/* Aufgeklappte Schichtdetails */}
                        {isExpanded && item.shifts.length > 0 && (
                          <ul className="mt-2 space-y-1 text-2xs text-fg-muted border-t border-line/60 pt-1.5">
                            {item.shifts.map((s) => (
                              <li key={s.id} className="flex items-center gap-1.5 truncate">
                                <Clock className="size-2.5 shrink-0 text-accent-ink" />
                                <span className="font-medium text-fg truncate">{s.title}</span>
                                {s.taskTitle && <span className="text-fg-subtle">({s.taskTitle})</span>}
                                <span className="text-fg-subtle">· {fmtShortWeekday(s.startTime)} {fmtTime(s.startTime)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>

                      {/* Status / Soll */}
                      <td className="px-4 py-3">
                        {item.isDeregistered ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge tone="neutral" className="bg-fg-muted/15 font-semibold text-fg-muted">
                              Abgemeldet
                            </Badge>
                            {item.deregistrationReason && (
                              <span className="text-2xs italic text-fg-subtle truncate max-w-[10rem]" title={item.deregistrationReason}>
                                {item.deregistrationReason}
                              </span>
                            )}
                          </div>
                        ) : minShifts !== null ? (
                          isTargetMet ? (
                            <Badge tone="success" className="font-semibold">
                              <CheckCircle2 className="mr-1 size-3" /> Erfüllt
                            </Badge>
                          ) : (
                            <Badge tone="warning" className="font-semibold">
                              Noch {minShifts - item.shiftCount} nötig
                            </Badge>
                          )
                        ) : item.shiftCount > 0 ? (
                          <Badge tone="accent">Eingeteilt</Badge>
                        ) : (
                          <Badge tone="neutral" className="text-fg-subtle">Keine Schicht</Badge>
                        )}
                      </td>

                      {/* Aktionen */}
                      <td className="px-4 py-3 text-right">
                        {item.isDeregistered ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCancelDeregistration(item)}
                            title="Abmeldung aufheben"
                          >
                            <UserCheck className="size-3.5" />
                            <span className="hidden sm:inline">Wieder anmelden</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeregisterTarget(item);
                              setDeregisterReason('');
                            }}
                            className="text-fg-subtle hover:text-danger-ink"
                            title="Als abgemeldet eintragen (muss keine Schichten übernehmen)"
                          >
                            <UserMinus className="size-3.5" />
                            <span className="hidden sm:inline">Abmelden</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Abmelde-Dialog */}
      {deregisterTarget && (
        <Dialog
          open={Boolean(deregisterTarget)}
          onClose={() => setDeregisterTarget(null)}
          title={`${deregisterTarget.displayName} abmelden`}
          description="Als abgemeldet eingetragene Personen müssen an diesem Anlass keine Schichten übernehmen (ihr Soll entfällt)."
          icon={<UserMinus />}
        >
          <form onSubmit={handleDeregisterSubmit} className="space-y-4">
            <Field label="Grund der Abmeldung (optional)" hint="z. B. Ferien, Militär, verletzt, Prüfungen…">
              <Input
                placeholder="Grund eingeben…"
                value={deregisterReason}
                onChange={(e) => setDeregisterReason(e.target.value)}
                autoFocus
              />
            </Field>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
              <Button type="button" variant="ghost" onClick={() => setDeregisterTarget(null)}>
                Abbrechen
              </Button>
              <Button type="submit" loading={deregisterSaving} variant="danger">
                Als abgemeldet eintragen
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
