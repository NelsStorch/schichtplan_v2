'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarDays, CheckSquare, Filter, LayoutList, Plus, Rows3, Search, Sparkles } from 'lucide-react';
import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import { Badge, Button, Chip, EmptyState, Input, Select, cn, trackUi, useConfirm, useToast } from '@schichtplan/ui';
import { BulkShiftBar } from '@/components/ok/BulkShiftBar';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';
import { ShiftCard } from '@/components/ok/ShiftCard';
import { ageWarnings } from '@/components/ok/shiftChecks';
import { ShiftSeriesDialog } from '@/components/ok/ShiftSeriesDialog';
import { ShiftTimeline } from '@/components/ok/ShiftTimeline';
import { AssignHelperDialog, DayResponsiblesDialog, DuplicateShiftDialog, ShiftFormDialog } from '@/components/ShiftDialogs';
import { api, errorMessage } from '@/lib/api';
import { dayKeyToIso, fmtDayMonth, fmtShortWeekday, fmtWeekday, groupByBusinessDay } from '@/lib/format';

type View = 'list' | 'plan';
const VIEW_KEY = 'ok-shift-view';

function ShiftsPage() {
  const { event, base, reload, setMessageDraft } = useOkEvent();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();

  const [view, setView] = useState<View>('list');
  const [day, setDay] = useState<string>(params.get('tag') ?? 'ALL');
  const [taskFilter, setTaskFilter] = useState(params.get('arbeit') ?? 'ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [setupFilter, setSetupFilter] = useState<'ALL' | 'EVENT' | 'SETUP'>('ALL');
  const [search, setSearch] = useState(params.get('suche') ?? '');
  const [onlyOpen, setOnlyOpen] = useState(params.get('offen') === '1');
  const [onlyWarning, setOnlyWarning] = useState(params.get('warnung') === '1');

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showShiftForm, setShowShiftForm] = useState(params.get('neu') === '1');
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [duplicatingShift, setDuplicatingShift] = useState<ShiftDto | null>(null);
  const [assigning, setAssigning] = useState<{ shift: ShiftDto; task: ShiftTaskDto } | null>(null);
  const [dayTarget, setDayTarget] = useState<{ dayDate: string; dayLabel: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'plan') setView(saved);
    } catch {
      // ohne Speicher bleibt die Liste
    }
  }, []);

  const changeView = (v: View) => {
    setView(v);
    trackUi('UI_PLAN_VIEW', v === 'plan' ? 'OK_PLAN' : 'OK_LIST');
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // egal
    }
  };

  // ?neu=1 nach dem Öffnen entfernen, damit ein Neuladen den Dialog nicht wieder öffnet
  useEffect(() => {
    if (params.get('neu') === '1') router.replace(`${base}/schichten`, { scroll: false });
  }, [params, router, base]);

  const days = useMemo(() => groupByBusinessDay(event.shifts, event.dayCutoffTime), [event]);
  const taskTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const s of event.shifts) for (const t of s.tasks ?? []) if (t.title.trim()) titles.add(t.title.trim());
    return [...titles].sort((a, b) => a.localeCompare(b, 'de'));
  }, [event]);
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of event.shifts) if (s.category?.trim()) cats.add(s.category.trim());
    return [...cats].sort((a, b) => a.localeCompare(b, 'de'));
  }, [event]);
  const warningShiftIds = useMemo(() => new Set(ageWarnings(event).map((w) => w.shift.id)), [event]);
  const hasSetup = event.shifts.some((s) => s.isSetupTeardown);

  const q = search.trim().toLowerCase();
  const filteredDays = days
    .filter((d) => day === 'ALL' || d.key === day)
    .map((d) => ({
      ...d,
      items: d.items.filter((s) => {
        if (setupFilter === 'SETUP' && !s.isSetupTeardown) return false;
        if (setupFilter === 'EVENT' && s.isSetupTeardown) return false;
        if (taskFilter !== 'ALL' && !s.tasks?.some((t) => t.title.trim() === taskFilter)) return false;
        if (categoryFilter !== 'ALL' && (s.category?.trim() ?? '') !== categoryFilter) return false;
        if (onlyOpen && (s.signups?.length ?? 0) >= s.requiredSlots) return false;
        if (onlyWarning && !warningShiftIds.has(s.id)) return false;
        if (
          q &&
          !s.title.toLowerCase().includes(q) &&
          !(s.category?.toLowerCase().includes(q) ?? false) &&
          !s.tasks?.some((t) => t.title.toLowerCase().includes(q)) &&
          !s.signups?.some((su) => su.displayName.toLowerCase().includes(q))
        )
          return false;
        return true;
      }),
    }))
    .filter((d) => d.items.length > 0);
  const visibleShifts = filteredDays.flatMap((d) => d.items);
  const filtersActive =
    day !== 'ALL' ||
    taskFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    setupFilter !== 'ALL' ||
    Boolean(q) ||
    onlyOpen ||
    onlyWarning;

  const resetFilters = () => {
    setDay('ALL');
    setTaskFilter('ALL');
    setCategoryFilter('ALL');
    setSetupFilter('ALL');
    setSearch('');
    setOnlyOpen(false);
    setOnlyWarning(false);
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const openNew = () => {
    setEditingShift(null);
    setShowShiftForm(true);
  };

  const deleteShift = async (shift: ShiftDto) => {
    const count = shift.signups?.length ?? 0;
    const ok = await confirm({
      title: `Schicht «${shift.title}» löschen?`,
      description: count
        ? `Dabei werden auch ${count} Eintragung${count === 1 ? '' : 'en'} gelöscht.`
        : 'Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Schicht löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/shifts/${shift.id}`, { method: 'DELETE' });
      toast({ title: 'Schicht gelöscht', description: shift.title });
      await reload();
    } catch (err) {
      toast({ title: 'Löschen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  const removeSignup = async (shift: ShiftDto, signupId: string, name: string) => {
    const ok = await confirm({
      title: `${name} austragen?`,
      description: `Aus der Schicht «${shift.title}».`,
      confirmLabel: 'Austragen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/api/shifts/${shift.id}/signup?signupId=${signupId}`, { method: 'DELETE' });
      toast({ title: `${name} ausgetragen` });
      await reload();
    } catch (err) {
      toast({ title: 'Austragen fehlgeschlagen', description: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div>
      <OkPageHeader
        title="Schichten"
        description="Schichten anlegen, Personen einteilen und Lücken finden. Zum Ändern mehrerer Schichten auf einmal «Auswählen» antippen."
        help="/ok/schichten-planen/"
        actions={
          <>
            <Button size="sm" variant={selecting ? 'primary' : 'secondary'} onClick={selecting ? stopSelecting : () => setSelecting(true)}>
              <CheckSquare className="size-4" /> {selecting ? 'Fertig' : 'Auswählen'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowSeriesForm(true)}>
              <Sparkles className="size-4" /> Serie erstellen
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4" /> Neue Schicht
            </Button>
          </>
        }
      />

      {/* Ansicht und Filter */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-line bg-surface p-1" role="group" aria-label="Ansicht">
            {(
              [
                ['list', 'Liste', LayoutList],
                ['plan', 'Plan', Rows3],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => changeView(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                  view === key ? 'bg-fg text-canvas' : 'text-fg-muted hover:text-fg'
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              className="h-10 pl-9 text-sm"
              placeholder="Schicht, Arbeit oder Person…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Schichten durchsuchen"
            />
          </div>
          {taskTitles.length > 1 && (
            <Select
              className="h-10 w-auto text-sm"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              aria-label="Nach Arbeit filtern"
            >
              <option value="ALL">Alle Arbeiten</option>
              {taskTitles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
          {categories.length > 0 && (
            <Select
              className="h-10 w-auto text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Nach Kategorie filtern"
            >
              <option value="ALL">Alle Kategorien</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {days.length > 1 && (
            <>
              <Chip selected={day === 'ALL'} onClick={() => setDay('ALL')}>
                Alle Tage
              </Chip>
              {days.map((d) => (
                <Chip key={d.key} selected={day === d.key} onClick={() => setDay(d.key)}>
                  {fmtShortWeekday(dayKeyToIso(d.key))} {fmtDayMonth(dayKeyToIso(d.key))}
                </Chip>
              ))}
              <span className="mx-1 h-5 w-px bg-line" />
            </>
          )}
          <Chip selected={onlyOpen} onClick={() => setOnlyOpen((v) => !v)}>
            Nur nicht voll
          </Chip>
          {(warningShiftIds.size > 0 || onlyWarning) && (
            <Chip selected={onlyWarning} count={warningShiftIds.size} onClick={() => setOnlyWarning((v) => !v)}>
              <AlertTriangle className="size-3.5 text-warning-ink" /> Jugendschutz-Warnung
            </Chip>
          )}
          {hasSetup && (
            <Chip
              selected={setupFilter === 'SETUP'}
              onClick={() => setSetupFilter(setupFilter === 'SETUP' ? 'ALL' : 'SETUP')}
            >
              Nur Auf-/Abbau
            </Chip>
          )}
          {filtersActive && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>

      {event.shifts.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Noch keine Schichten"
          description="Lege die erste Schicht an. Wiederkehrende Arbeiten wie Bar oder Grill legst du am besten zuerst im Arbeiten-Katalog an."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" /> Erste Schicht anlegen
            </Button>
          }
        />
      ) : filteredDays.length === 0 ? (
        <EmptyState
          icon={<Filter />}
          title="Keine passenden Schichten"
          description="Keine Schicht passt zu den gewählten Filtern."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Filter zurücksetzen
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {filteredDays.map((group) => {
            const iso = dayKeyToIso(group.key);
            const dayLabel = `${fmtWeekday(iso)} ${fmtDayMonth(iso)}`;
            const responsibles = event.dayResponsibles?.[group.key] ?? [];
            const groupSelected = group.items.every((s) => selectedIds.has(s.id));
            return (
              <section key={group.key} className="space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="font-display text-xl font-extrabold text-fg">
                      {fmtWeekday(iso)} <span className="text-base font-normal text-fg-muted">{fmtDayMonth(iso)}</span>
                    </h3>
                    <span className="text-xs font-semibold text-fg-muted">
                      {group.items.length} Schicht{group.items.length === 1 ? '' : 'en'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.responsibleMode === 'BY_DAY' && (
                      <>
                        {responsibles.length ? (
                          <Badge tone="neutral" size="sm">
                            Tagesleitung: {responsibles.map((r) => r.displayName).join(', ')}
                          </Badge>
                        ) : (
                          <Badge tone="warning" size="sm">
                            Keine Tagesleitung
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDayTarget({ dayDate: group.key, dayLabel })}>
                          Tagesleitung ändern
                        </Button>
                      </>
                    )}
                    {selecting && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const s of group.items) {
                              if (groupSelected) next.delete(s.id);
                              else next.add(s.id);
                            }
                            return next;
                          })
                        }
                      >
                        {groupSelected ? 'Tag abwählen' : 'Ganzen Tag wählen'}
                      </Button>
                    )}
                  </div>
                </header>

                {view === 'plan' ? (
                  <ShiftTimeline
                    shifts={group.items}
                    selecting={selecting}
                    selectedIds={selectedIds}
                    onSelect={toggle}
                    onOpen={(shift) => {
                      setEditingShift(shift);
                      setShowShiftForm(true);
                    }}
                  />
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {group.items.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        selecting={selecting}
                        selected={selectedIds.has(shift.id)}
                        onToggleSelect={() => toggle(shift.id)}
                        onEdit={() => {
                          setEditingShift(shift);
                          setShowShiftForm(true);
                        }}
                        onDuplicate={() => setDuplicatingShift(shift)}
                        onDelete={() => deleteShift(shift)}
                        onAssign={(task) => setAssigning({ shift, task })}
                        onRemoveSignup={(signupId, name) => removeSignup(shift, signupId, name)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selecting && (
        <BulkShiftBar
          eventSlug={event.slug}
          shifts={visibleShifts}
          selectedIds={selectedIds}
          onClear={() => setSelectedIds(new Set())}
          onSelectAll={() => setSelectedIds(new Set(visibleShifts.map((s) => s.id)))}
          onDone={reload}
          onMessage={() => {
            const ids = [...selectedIds];
            setMessageDraft({
              target: 'SHIFTS',
              shiftIds: ids,
              label: `Eingetragene in ${ids.length} Schicht${ids.length === 1 ? '' : 'en'}`,
            });
            router.push(`${base}/nachrichten`);
          }}
        />
      )}
      {selecting && selectedIds.size === 0 && (
        <p className="sticky bottom-4 z-20 mt-6 rounded-card border border-line bg-surface/95 p-3 text-sm text-fg-muted shadow-lift backdrop-blur">
          Tippe Schichten an, um sie auszuwählen.
        </p>
      )}

      <ShiftFormDialog
        open={showShiftForm}
        event={event}
        shift={editingShift}
        onClose={() => {
          setShowShiftForm(false);
          setEditingShift(null);
        }}
        onSaved={async () => {
          setShowShiftForm(false);
          setEditingShift(null);
          await reload();
        }}
      />
      <AssignHelperDialog
        open={assigning !== null}
        eventSlug={event.slug}
        shift={assigning?.shift ?? null}
        task={assigning?.task ?? null}
        onClose={() => setAssigning(null)}
        onAssigned={async () => {
          setAssigning(null);
          await reload();
        }}
      />
      <DuplicateShiftDialog
        open={duplicatingShift !== null}
        shift={duplicatingShift}
        onClose={() => setDuplicatingShift(null)}
        onDuplicated={async () => {
          setDuplicatingShift(null);
          await reload();
        }}
      />
      <DayResponsiblesDialog
        open={Boolean(dayTarget)}
        event={event}
        dayDate={dayTarget?.dayDate ?? ''}
        dayLabel={dayTarget?.dayLabel ?? ''}
        onClose={() => setDayTarget(null)}
        onSaved={async () => {
          setDayTarget(null);
          await reload();
        }}
      />
      <ShiftSeriesDialog
        open={showSeriesForm}
        event={event}
        onClose={() => setShowSeriesForm(false)}
        onCreated={async () => {
          setShowSeriesForm(false);
          await reload();
        }}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ShiftsPage />
    </Suspense>
  );
}
