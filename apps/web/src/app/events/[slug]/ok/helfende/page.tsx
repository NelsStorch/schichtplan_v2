'use client';

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Award, ChevronDown, ChevronUp, Filter, Info, Mail, Search, UserCheck, UserMinus, Users, X } from 'lucide-react';
import type { EventRosterResponseDto } from '@schichtplan/shared';
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
  cn,
  useConfirm,
  useToast,
} from '@schichtplan/ui';
import { HelperHoursDialog } from '@/components/ok/HelperHoursDialog';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { api, errorMessage } from '@/lib/api';
import { fmtShortWeekday, fmtTime } from '@/lib/format';
import { formatMinutes } from '@/lib/helperStats';

type Status = 'ALL' | 'WITH' | 'WITHOUT' | 'UNDER' | 'DEREGISTERED';

interface PersonShift {
  shiftId: string;
  signupId: string;
  title: string;
  taskTitle: string | null;
  startTime: string;
  endTime: string;
}

interface PersonRow {
  key: string;
  userId: string | null;
  name: string;
  subName: string | null;
  departmentName: string | null;
  stufen: { id: string; name: string; role: string }[];
  age: number | null;
  shifts: PersonShift[];
  isGuest: boolean;
  guestEmail: string | null;
  guestPhone: string | null;
  isDeregistered: boolean;
  deregistrationReason: string | null;
}

function HelpersPage() {
  const { event, base, reload, setMessageDraft } = useOkEvent();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [roster, setRoster] = useState<EventRosterResponseDto | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const minShifts = event.minShiftsPerPerson ?? null;

  const initialStatus: Status = params.get('status') === 'offen' ? (minShifts ? 'UNDER' : 'WITHOUT') : 'ALL';
  const [status, setStatus] = useState<Status>(initialStatus);
  const [search, setSearch] = useState('');
  const [stufe, setStufe] = useState('ALL');
  const [dept, setDept] = useState('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deregTarget, setDeregTarget] = useState<PersonRow | null>(null);
  const [showHoursDialog, setShowHoursDialog] = useState(false);

  const loadRoster = useCallback(async () => {
    try {
      setRoster(await api<EventRosterResponseDto>(`/api/events/${event.slug}/roster`));
      setRosterError(null);
    } catch (err) {
      setRosterError(errorMessage(err));
    }
  }, [event.slug]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const refresh = async () => {
    await Promise.all([reload(), loadRoster()]);
  };

  // Personen aus dem Pool plus vom OK eingetragene Gäste (ohne Konto)
  const rows = useMemo<PersonRow[]>(() => {
    const shiftsByUser = new Map<string, PersonShift[]>();
    const guests = new Map<string, PersonRow>();
    for (const shift of event.shifts) {
      for (const su of shift.signups ?? []) {
        const entry: PersonShift = {
          shiftId: shift.id,
          signupId: su.id,
          title: shift.title,
          taskTitle: su.taskTitle ?? null,
          startTime: shift.startTime,
          endTime: shift.endTime,
        };
        if (su.userId) {
          shiftsByUser.set(su.userId, [...(shiftsByUser.get(su.userId) ?? []), entry]);
        } else {
          const key = `guest:${su.guestName || su.id}`;
          const guest = guests.get(key) ?? {
            key,
            userId: null,
            name: su.displayName,
            subName: 'Gast, vom OK eingetragen',
            departmentName: null,
            stufen: [],
            age: null,
            shifts: [],
            isGuest: true,
            guestEmail: su.guestEmail ?? null,
            guestPhone: su.guestPhone ?? null,
            isDeregistered: false,
            deregistrationReason: null,
          };
          guest.shifts.push(entry);
          guests.set(key, guest);
        }
      }
    }
    const people: PersonRow[] = (roster?.items ?? []).map((i) => ({
      key: i.userId,
      userId: i.userId,
      name: i.ceviName || `${i.firstName} ${i.lastName}`.trim(),
      subName: i.ceviName ? `${i.firstName} ${i.lastName}`.trim() : null,
      departmentName: i.departmentName,
      stufen: i.stufen,
      age: i.age,
      shifts: shiftsByUser.get(i.userId) ?? [],
      isGuest: false,
      guestEmail: null,
      guestPhone: null,
      isDeregistered: i.isDeregistered,
      deregistrationReason: i.deregistrationReason,
    }));
    return [...people, ...guests.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [event, roster]);

  const counts = useMemo(() => {
    const active = rows.filter((r) => !r.isDeregistered);
    return {
      ALL: rows.length,
      WITH: active.filter((r) => r.shifts.length > 0).length,
      WITHOUT: active.filter((r) => r.shifts.length === 0).length,
      UNDER: minShifts ? active.filter((r) => !r.isGuest && r.shifts.length < minShifts).length : 0,
      DEREGISTERED: rows.filter((r) => r.isDeregistered).length,
    };
  }, [rows, minShifts]);

  const stufen = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) for (const s of r.stufen) map.set(s.id, s.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }, [rows]);
  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.departmentName).filter((d): d is string => Boolean(d)))].sort(),
    [rows]
  );

  const q = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (status === 'WITH' && (r.isDeregistered || r.shifts.length === 0)) return false;
    if (status === 'WITHOUT' && (r.isDeregistered || r.shifts.length > 0)) return false;
    if (status === 'UNDER' && (r.isDeregistered || r.isGuest || r.shifts.length >= (minShifts ?? 0))) return false;
    if (status === 'DEREGISTERED' && !r.isDeregistered) return false;
    if (stufe !== 'ALL' && !r.stufen.some((s) => s.id === stufe)) return false;
    if (dept !== 'ALL' && r.departmentName !== dept) return false;
    if (q && !`${r.name} ${r.subName ?? ''} ${r.stufen.map((s) => s.name).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const selectableIds = filtered.filter((r) => r.userId).map((r) => r.userId!);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSignup = async (row: PersonRow, s: PersonShift) => {
    const ok = await confirm({
      title: `${row.name} austragen?`,
      description: `Aus der Schicht «${s.title}».`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/shifts/${s.shiftId}/signup?signupId=${s.signupId}`, { method: 'DELETE' });
      toast({ title: `${row.name} ausgetragen` });
      await refresh();
    } catch (err) {
      toast({ title: 'Austragen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const removeFromAll = async (row: PersonRow) => {
    const ok = await confirm({
      title: `${row.name} aus allen Schichten austragen?`,
      description: `Die Person wird aus ${row.shifts.length} Schicht${row.shifts.length === 1 ? '' : 'en'} dieses Anlasses ausgetragen.`,
      confirmLabel: 'Aus allen austragen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/events/${event.slug}/unregister-helper`, {
        method: 'POST',
        json: row.userId ? { userId: row.userId } : { guestName: row.name },
      });
      toast({ title: `${row.name} ausgetragen`, description: `Aus ${row.shifts.length} Schichten` });
      await refresh();
    } catch (err) {
      toast({ title: 'Austragen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const undoDeregistration = async (row: PersonRow) => {
    try {
      await api(`/api/events/${event.slug}/deregistrations/${row.userId}`, { method: 'DELETE' });
      toast({ title: `${row.name} wieder dabei` });
      await loadRoster();
    } catch (err) {
      toast({ title: 'Aktion fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const writeMessage = () => {
    const ids = [...selected];
    setMessageDraft({ target: 'PEOPLE', userIds: ids, label: `${ids.length} ausgewählte Person${ids.length === 1 ? '' : 'en'}` });
    router.push(`${base}/nachrichten`);
  };

  const statusChips: { key: Status; label: string; show: boolean }[] = [
    { key: 'ALL', label: 'Alle', show: true },
    { key: 'WITH', label: 'Mit Schicht', show: true },
    { key: 'WITHOUT', label: 'Ohne Schicht', show: true },
    { key: 'UNDER', label: 'Unter dem Soll', show: Boolean(minShifts) },
    { key: 'DEREGISTERED', label: 'Abgemeldet', show: counts.DEREGISTERED > 0 },
  ];

  return (
    <div>
      <OkPageHeader
        title="Helfende"
        description="Alle Personen, die bei diesem Anlass helfen können oder schon eingetragen sind. Wer nicht helfen kann, meldest du hier ab, dann zählt das Soll nicht."
        help="/ok/helfer-pool/"
        actions={
          <Button size="sm" variant="secondary" onClick={() => setShowHoursDialog(true)}>
            <Award className="size-4" /> Helferstunden & Bons
          </Button>
        }
      />

      {rosterError && <Callout tone="danger" className="mb-6">Personen konnten nicht geladen werden: {rosterError}</Callout>}

      {roster && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MiniStat label="Personen" value={counts.ALL} hint={roster.scopeDescription} />
          <MiniStat label="Mit Schicht" value={counts.WITH} tone="success" />
          <MiniStat
            label={minShifts ? 'Unter dem Soll' : 'Ohne Schicht'}
            value={minShifts ? counts.UNDER : counts.WITHOUT}
            hint={minShifts ? `Soll: ${minShifts} Schichten` : undefined}
            tone="warning"
          />
          <MiniStat label="Abgemeldet" value={counts.DEREGISTERED} hint="müssen nicht helfen" />
        </div>
      )}

      {roster && !roster.isRestricted && (
        <Callout tone="info" className="mb-6 flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Dieser Anlass ist offen für {roster.scopeDescription}. Hier stehen alle Eingetragenen sowie die Personen deiner
            Abteilung. Ein festes Soll pro Person lohnt sich vor allem bei Anlässen nur für die Abteilung oder einzelne Stufen.
          </span>
        </Callout>
      )}

      {/* Filter */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-10 pl-9 text-sm"
              placeholder="Name, Cevi-Name oder Stufe…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Personen durchsuchen"
            />
          </div>
          {stufen.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={stufe} onChange={(e) => setStufe(e.target.value)} aria-label="Stufe">
              <option value="ALL">Alle Stufen</option>
              {stufen.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          )}
          {departments.length > 1 && (
            <Select className="h-10 w-auto text-sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Abteilung">
              <option value="ALL">Alle Abteilungen</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {statusChips
            .filter((c) => c.show)
            .map((c) => (
              <Chip key={c.key} selected={status === c.key} count={counts[c.key]} onClick={() => setStatus(c.key)}>
                {c.label}
              </Chip>
            ))}
        </div>
      </div>

      {/* Auswahl-Leiste */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="inline-flex items-center gap-2 text-fg-muted">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={allSelected}
            disabled={selectableIds.length === 0}
            onChange={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const id of selectableIds) {
                  if (allSelected) next.delete(id);
                  else next.add(id);
                }
                return next;
              })
            }
          />
          {selected.size > 0 ? `${selected.size} ausgewählt` : `${filtered.length} Personen`}
        </label>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Auswahl aufheben
            </Button>
            <Button size="sm" onClick={writeMessage}>
              <Mail className="size-4" /> Nachricht an Auswahl
            </Button>
          </div>
        )}
      </div>

      {!roster && !rosterError ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={rows.length === 0 ? <Users /> : <Filter />}
          title={rows.length === 0 ? 'Noch niemand dabei' : 'Keine passenden Personen'}
          description={rows.length === 0 ? 'Sobald sich jemand einträgt, erscheint die Person hier.' : 'Passe die Filter an.'}
        />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {filtered.map((row) => {
            const isOpen = expanded === row.key;
            const target = minShifts && !row.isGuest ? minShifts : null;
            const met = target ? row.shifts.length >= target : row.shifts.length > 0;
            const totalMins = row.shifts.reduce((sum, s) => {
              const start = new Date(s.startTime).getTime();
              const end = new Date(s.endTime).getTime();
              return sum + Math.max(0, Math.round((end - start) / (60 * 1000)));
            }, 0);

            return (
              <div key={row.key} className={cn('px-4 py-3', row.isDeregistered && 'bg-surface-2/40')}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-accent disabled:opacity-30"
                    checked={row.userId ? selected.has(row.userId) : false}
                    disabled={!row.userId}
                    onChange={() => row.userId && toggle(row.userId)}
                    aria-label={`${row.name} auswählen`}
                    title={row.userId ? undefined : 'Gäste ohne Konto bekommen keine Nachrichten'}
                  />
                  <Avatar name={row.name} size="sm" />
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : row.key)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">{row.name}</span>
                      <span className="block truncate text-2xs text-fg-muted">
                        {[row.subName, row.departmentName, row.age !== null ? `${row.age} J.` : null, ...row.stufen.map((s) => s.name)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="hidden shrink-0 sm:flex sm:items-center sm:gap-2">
                      {totalMins > 0 && (
                        <span className="font-mono text-xs font-semibold text-fg-muted">
                          {formatMinutes(totalMins)}
                        </span>
                      )}
                      {row.isDeregistered ? (
                        <Badge tone="neutral">Abgemeldet</Badge>
                      ) : (
                        <Badge tone={met ? 'success' : row.shifts.length > 0 ? 'warning' : 'neutral'}>
                          {target ? `${row.shifts.length}/${target} Schichten` : `${row.shifts.length} Schicht${row.shifts.length === 1 ? '' : 'en'}`}
                        </Badge>
                      )}
                    </span>
                    {isOpen ? <ChevronUp className="size-4 shrink-0 text-fg-subtle" /> : <ChevronDown className="size-4 shrink-0 text-fg-subtle" />}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 space-y-3 pl-7 sm:pl-[4.25rem]">
                    <div className="flex items-center gap-2 sm:hidden">
                      {totalMins > 0 && (
                        <span className="font-mono text-xs font-semibold text-fg-muted">
                          {formatMinutes(totalMins)}
                        </span>
                      )}
                      {row.isDeregistered ? (
                        <Badge tone="neutral">Abgemeldet</Badge>
                      ) : (
                        <Badge tone={met ? 'success' : 'warning'}>
                          {target ? `${row.shifts.length}/${target} Schichten` : `${row.shifts.length} Schichten`}
                        </Badge>
                      )}
                    </div>
                    {row.isDeregistered && row.deregistrationReason && (
                      <p className="text-xs text-fg-muted">Grund: {row.deregistrationReason}</p>
                    )}
                    {(row.guestEmail || row.guestPhone) && (
                      <p className="text-xs text-fg-muted">
                        {[row.guestEmail, row.guestPhone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {row.shifts.length > 0 ? (
                      <ul className="space-y-1 text-xs">
                        {[...row.shifts]
                          .sort((a, b) => a.startTime.localeCompare(b.startTime))
                          .map((s) => (
                            <li key={s.signupId} className="flex items-center justify-between gap-2 rounded-field bg-surface-2/60 px-3 py-1.5">
                              <span className="min-w-0 truncate text-fg">
                                <strong>{s.title}</strong>
                                {s.taskTitle && s.taskTitle !== s.title ? ` (${s.taskTitle})` : ''}
                                <span className="text-fg-muted">
                                  {' '}
                                  · {fmtShortWeekday(s.startTime)} {fmtTime(s.startTime)}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSignup(row, s)}
                                className="shrink-0 rounded p-1 text-fg-subtle hover:bg-danger/10 hover:text-danger-ink"
                                aria-label={`Aus ${s.title} austragen`}
                              >
                                <X className="size-3.5" />
                              </button>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-fg-muted">Noch in keiner Schicht.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {row.shifts.length > 1 && (
                        <Button size="sm" variant="ghost" className="text-danger-ink hover:bg-danger/10" onClick={() => removeFromAll(row)}>
                          <X className="size-3.5" /> Aus allen Schichten austragen
                        </Button>
                      )}
                      {row.userId &&
                        (row.isDeregistered ? (
                          <Button size="sm" variant="secondary" onClick={() => undoDeregistration(row)}>
                            <UserCheck className="size-3.5" /> Abmeldung aufheben
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setDeregTarget(row)}>
                            <UserMinus className="size-3.5" /> Kann nicht helfen (abmelden)
                          </Button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <DeregisterDialog
        row={deregTarget}
        eventSlug={event.slug}
        onClose={() => setDeregTarget(null)}
        onSaved={async () => {
          setDeregTarget(null);
          await loadRoster();
        }}
      />

      <HelperHoursDialog
        open={showHoursDialog}
        event={event}
        roster={roster}
        onClose={() => setShowHoursDialog(false)}
      />
    </div>
  );
}

function MiniStat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'success' | 'warning' }) {
  return (
    <Card className="p-4">
      <p className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-2xl font-extrabold tabular',
          tone === 'success' ? 'text-success-ink' : tone === 'warning' ? 'text-warning-ink' : 'text-fg'
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-2xs text-fg-muted" title={hint}>{hint}</p>}
    </Card>
  );
}

function DeregisterDialog({
  row,
  eventSlug,
  onClose,
  onSaved,
}: {
  row: PersonRow | null;
  eventSlug: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!row?.userId) return;
    setSaving(true);
    try {
      await api(`/api/events/${eventSlug}/deregistrations`, {
        method: 'POST',
        json: { userId: row.userId, reason: reason.trim() || undefined },
      });
      toast({ title: `${row.name} abgemeldet`, description: 'Muss an diesem Anlass keine Schichten übernehmen.' });
      setReason('');
      await onSaved();
    } catch (err) {
      toast({ title: 'Abmelden fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(row)}
      onClose={onClose}
      icon={<UserMinus />}
      title={row ? `${row.name} abmelden` : ''}
      description="Die Person muss an diesem Anlass keine Schichten übernehmen und zählt nicht mehr beim Soll. Bestehende Eintragungen bleiben."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Grund (optional)" hint="z. B. Ferien, Militär, verletzt">
          <Input value={reason} maxLength={200} autoFocus onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" loading={saving}>
            Abmelden
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Page() {
  return (
    <Suspense>
      <HelpersPage />
    </Suspense>
  );
}
