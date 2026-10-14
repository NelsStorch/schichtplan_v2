'use client';

import { useMemo } from 'react';
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  Edit,
  Lock,
  Shield,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  SlotMeter,
  cn,
  slotStatus,
} from '@schichtplan/ui';
import { fmtDuration, fmtTime, fmtWeekday, fmtDayMonth, isPast } from '@/lib/format';
import { loginUrl } from '@/lib/api';
import type { EventDetails } from '@/lib/types';

export interface ShiftDetailsDialogProps {
  shift: ShiftDto | null;
  event: EventDetails;
  isOpen: boolean;
  onClose: () => void;
  currentUser: { id: string; ceviName?: string | null; firstName?: string } | null;
  needsLogin: boolean;
  canManage: boolean;
  busy?: boolean;
  onSignup: (task?: ShiftTaskDto) => void;
  onCancel: (signupId?: string) => void;
  onRemoveHelper: (signupId: string, name: string) => void;
  onAssignHelper?: (shift: ShiftDto, task?: ShiftTaskDto) => void;
  onEditShift?: (shift: ShiftDto) => void;
}

export function ShiftDetailsDialog({
  shift,
  event,
  isOpen,
  onClose,
  currentUser,
  needsLogin,
  canManage,
  busy,
  onSignup,
  onCancel,
  onRemoveHelper,
  onAssignHelper,
  onEditShift,
}: ShiftDetailsDialogProps) {
  if (!shift) return null;

  const signups = shift.signups ?? [];
  const filled = signups.length;
  const total = shift.requiredSlots;
  const status = slotStatus(filled, total);
  const free = Math.max(0, total - filled);
  const over = isPast(shift.endTime);

  const mySignupInShift = currentUser
    ? signups.find((s) => s.userId === currentUser.id)
    : null;
  const isMine = Boolean(mySignupInShift);

  const tasks = shift.tasks && shift.tasks.length > 0
    ? shift.tasks
    : [
        {
          id: 'default',
          shiftId: shift.id,
          title: shift.title,
          description: shift.description,
          requiredSlots: shift.requiredSlots,
          minAge: shift.minAge,
          ageRequirementType: 'ALL' as const,
        },
      ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
              {shift.title}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{shift.category}</Badge>
            {shift.minAge && (
              <Badge tone="warning">Schicht ab {shift.minAge} J.</Badge>
            )}
            {isMine && (
              <Badge tone="success">
                <Check className="size-3" /> Du bist dabei
              </Badge>
            )}
            {over && <Badge tone="neutral">Vergangen</Badge>}
          </div>
        </div>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-fg-muted">
            <span className="font-semibold text-fg">{filled}</span> von{' '}
            <span className="font-semibold text-fg">{total}</span> Plätzen besetzt
          </div>
          <div className="flex items-center gap-2">
            {canManage && onAssignHelper && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAssignHelper(shift)}
              >
                <UserPlus className="size-3.5" /> Helfer einteilen
              </Button>
            )}
            {canManage && onEditShift && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onEditShift(shift);
                }}
              >
                <Edit className="size-3.5" /> Bearbeiten
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Schliessen
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 pt-1">
        {/* Zeit & Datum Kachel */}
        <div className="rounded-card border border-line bg-surface-2/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-accent/12 text-accent-ink">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-fg sm:text-base">
                  {fmtWeekday(shift.startTime)}, {fmtDayMonth(shift.startTime)}
                </p>
                <p className="font-mono text-xs text-fg-muted sm:text-sm">
                  {fmtTime(shift.startTime)} – {fmtTime(shift.endTime)} Uhr ({fmtDuration(shift.startTime, shift.endTime)})
                </p>
              </div>
            </div>

            <div className="text-right max-sm:w-full max-sm:border-t max-sm:border-line max-sm:pt-2">
              <SlotMeter filled={filled} total={total} className="w-32 max-sm:w-full" />
              <p
                className={cn(
                  'mt-1 text-xs font-semibold',
                  status === 'full'
                    ? 'text-success-ink'
                    : status === 'last'
                    ? 'text-warning-ink'
                    : 'text-fg-muted'
                )}
              >
                {status === 'full'
                  ? 'Voll besetzt'
                  : status === 'last'
                  ? 'Noch 1 Platz frei'
                  : `Noch ${free} Plätze frei`}
              </p>
            </div>
          </div>

          {shift.description && (
            <p className="mt-3.5 border-t border-line/80 pt-3 text-sm leading-relaxed text-fg-muted">
              {shift.description}
            </p>
          )}
        </div>

        {/* Arbeiten in dieser Schicht */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-fg sm:text-lg">
              Arbeiten in dieser Schicht
            </h3>
            <span className="text-xs font-semibold text-fg-subtle">
              {tasks.length} {tasks.length === 1 ? 'Arbeit' : 'Arbeiten'}
            </span>
          </div>

          <p className="mb-4 text-xs text-fg-muted">
            Wähle die passende Arbeit aus, um dich einzutragen. Jede Arbeit hat spezifische Aufgaben und Jugendschutz-Regeln.
          </p>

          <div className="grid gap-3.5 sm:grid-cols-1">
            {tasks.map((task) => {
              const taskSignups = signups.filter(
                (s) => (s.taskId === task.id) || (tasks.length === 1 && !s.taskId)
              );
              const taskFilled = taskSignups.length;
              const taskTotal = task.requiredSlots;
              const taskFull = taskFilled >= taskTotal;
              const taskMineSignup = currentUser
                ? taskSignups.find((s) => s.userId === currentUser.id)
                : null;
              const isMineInThisTask = Boolean(taskMineSignup);
              const isMineInOtherTask = isMine && !isMineInThisTask;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'relative flex flex-col justify-between gap-3.5 rounded-card border p-4 transition-all sm:p-5',
                    isMineInThisTask
                      ? 'border-accent/60 bg-[linear-gradient(135deg,rgb(var(--accent)/0.08),transparent_65%)] shadow-glow'
                      : 'border-line bg-surface hover:border-line-strong'
                  )}
                >
                  <div className="space-y-2">
                    {/* Titel & Status */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-bold text-fg sm:text-lg">
                            {task.title}
                          </h4>
                          {isMineInThisTask && (
                            <Badge tone="success" size="sm">
                              <Check className="size-3" /> Deine Arbeit
                            </Badge>
                          )}
                        </div>
                        {task.description && (
                          <p className="mt-1 text-xs leading-relaxed text-fg-muted sm:text-sm">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2.5 py-1 font-mono text-xs font-semibold',
                            taskFull
                              ? 'bg-success/15 text-success-ink'
                              : 'bg-surface-2 text-fg-muted'
                          )}
                        >
                          {taskFilled}/{taskTotal} belegt
                        </span>
                      </div>
                    </div>

                    {/* Jugendschutz / Mindestalter */}
                    {task.minAge ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <Badge tone="warning" size="sm">
                          {task.ageRequirementType === 'ALL' ? (
                            <>
                              <AlertCircle className="size-3" /> Mindestalter ab {task.minAge} Jahren (alle Helfer)
                            </>
                          ) : (
                            <>
                              <Shield className="size-3" /> Mindestalter ab {task.minAge} Jahren (mind. 1 Person in Schicht)
                            </>
                          )}
                        </Badge>
                      </div>
                    ) : null}
                  </div>

                  {/* Eingetragene Personen */}
                  <div className="rounded-field border border-line/60 bg-surface-2/40 p-3">
                    <span className="mb-2 block text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                      Eingeteilte Helfer ({taskFilled}/{taskTotal})
                    </span>

                    {taskSignups.length === 0 ? (
                      <p className="text-xs italic text-fg-subtle">
                        Noch niemand eingetragen – melde dich als Erste/r an!
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Eingetragene Helfer">
                        {taskSignups.map((s) => {
                          const isCurrentUser = currentUser && s.userId === currentUser.id;
                          return (
                            <li
                              key={s.id}
                              className={cn(
                                'inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-medium',
                                isCurrentUser
                                  ? 'border border-accent/40 bg-accent/15 text-accent-ink font-semibold'
                                  : 'bg-surface text-fg border border-line'
                              )}
                            >
                              <Avatar
                                name={s.displayName}
                                size="sm"
                                className="size-5 text-[8px]"
                              />
                              <span>
                                {s.displayName} {isCurrentUser && '(Du)'}
                              </span>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveHelper(s.id, s.displayName)}
                                  aria-label={`${s.displayName} austragen`}
                                  className="-mr-1 ml-0.5 rounded-full p-0.5 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                                >
                                  <X className="size-3" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Aktions-Button */}
                  {!over && (
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-line/60">
                      {isMineInThisTask ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => onCancel(taskMineSignup?.id)}
                          loading={busy}
                        >
                          <UserMinus className="size-3.5" /> Aus dieser Arbeit austragen
                        </Button>
                      ) : isMineInOtherTask ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                          <Check className="size-3.5 text-accent-ink" /> Du bist bereits für eine andere Arbeit eingeteilt
                        </div>
                      ) : taskFull ? (
                        <Button disabled variant="secondary" size="sm">
                          Voll besetzt
                        </Button>
                      ) : needsLogin ? (
                        <a
                          href={loginUrl()}
                          className="inline-flex items-center gap-1.5 rounded-button bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition hover:brightness-110"
                        >
                          <Lock className="size-3.5" /> Anmelden &amp; eintragen
                        </a>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onSignup(task)}
                          loading={busy}
                        >
                          <UserPlus className="size-3.5" /> Für diese Arbeit eintragen
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
