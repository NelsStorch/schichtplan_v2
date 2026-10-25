'use client';

import { AlertTriangle, CheckCircle2, Clock, Copy, Edit, Hammer, Trash2, UserPlus, X } from 'lucide-react';
import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import { Avatar, Badge, Button, Card, cn } from '@schichtplan/ui';
import { fmtDuration, fmtTimeRange } from '@/lib/format';
import { taskHasAdult } from './shiftChecks';

export function ShiftCard({
  shift,
  selecting,
  selected,
  onToggleSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onAssign,
  onRemoveSignup,
}: {
  shift: ShiftDto;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAssign: (task: ShiftTaskDto) => void;
  onRemoveSignup: (signupId: string, name: string) => void;
}) {
  const signups = shift.signups ?? [];
  const isFull = signups.length >= shift.requiredSlots;

  return (
    <Card
      className={cn(
        'relative flex flex-col gap-4 p-5 shadow-soft transition',
        selecting && 'cursor-pointer',
        selected && 'border-accent ring-2 ring-accent/30'
      )}
      onClick={selecting ? onToggleSelect : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {selecting && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              aria-label={`${shift.title} auswählen`}
              className="mt-1 size-4 shrink-0 accent-accent"
            />
          )}
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-2xs font-semibold tabular',
                  isFull ? 'bg-success/15 text-success-ink' : 'bg-warning/15 text-warning-ink'
                )}
              >
                {signups.length}/{shift.requiredSlots} besetzt
              </span>
              {shift.isSetupTeardown && (
                <Badge tone="warning" size="sm">
                  <Hammer className="size-3" /> Auf-/Abbau
                </Badge>
              )}
              {shift.category ? <Badge size="sm">{shift.category}</Badge> : null}
              {shift.minAge ? <Badge tone="warning" size="sm">ab {shift.minAge} J.</Badge> : null}
            </div>
            <h3 className="text-lg font-bold text-fg">{shift.title}</h3>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-fg-muted">
              <Clock className="size-3.5" />
              {fmtTimeRange(shift.startTime, shift.endTime)} ({fmtDuration(shift.startTime, shift.endTime)})
            </p>
            {shift.responsibles && shift.responsibles.length > 0 && (
              <p className="mt-1 text-xs text-fg-muted">
                Verantwortlich: {shift.responsibles.map((r) => r.displayName).join(', ')}
              </p>
            )}
          </div>
        </div>

        {!selecting && (
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" title="Schicht bearbeiten" aria-label="Schicht bearbeiten" onClick={onEdit}>
              <Edit className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Kopieren (z. B. als Folgeschicht)"
              aria-label="Schicht kopieren"
              onClick={onDuplicate}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Schicht löschen"
              aria-label="Schicht löschen"
              onClick={onDelete}
              className="hover:text-danger-ink"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {shift.description && <p className="text-xs leading-relaxed text-fg-muted">{shift.description}</p>}

      <div className="space-y-2">
        {shift.tasks?.map((task) => {
          const taskSignups = signups.filter((s) => s.taskId === task.id);
          const taskFull = taskSignups.length >= task.requiredSlots;
          const hasAdult = taskHasAdult(shift, task);
          return (
            <div key={task.id} className="rounded-field border border-line bg-surface-2/60 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">
                  <span>{task.title}</span>
                  <span className="tabular text-2xs font-normal text-fg-muted">
                    {taskSignups.length}/{task.requiredSlots}
                  </span>
                  {task.minAge ? (
                    <Badge size="sm" tone="warning">
                      ab {task.minAge} J. ({task.ageRequirementType === 'ALL' ? 'alle' : 'mind. 1 Person'})
                    </Badge>
                  ) : null}
                </div>
                {!selecting && (
                  <Button size="sm" variant="secondary" onClick={() => onAssign(task)} disabled={taskFull}>
                    <UserPlus className="size-3" /> {taskFull ? 'Voll' : 'Einteilen'}
                  </Button>
                )}
              </div>

              {task.minAge && task.ageRequirementType === 'AT_LEAST_ONE' && (
                <p className="mt-1 text-2xs">
                  {hasAdult ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-success-ink">
                      <CheckCircle2 className="size-3" /> Jemand ab {task.minAge} ist in der Schicht
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-warning-ink">
                      <AlertTriangle className="size-3" /> Noch niemand ab {task.minAge} in der Schicht
                    </span>
                  )}
                </p>
              )}

              {taskSignups.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {taskSignups.map((su) => (
                    <span
                      key={su.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface py-0.5 pl-1.5 pr-2 text-xs font-medium text-fg"
                    >
                      <Avatar name={su.displayName} size="sm" className="size-4 text-[8px]" />
                      <span>{su.displayName}</span>
                      {su.userAge !== null && su.userAge !== undefined && (
                        <span className="text-2xs font-normal text-fg-muted">({su.userAge})</span>
                      )}
                      {!selecting && (
                        <button
                          type="button"
                          onClick={() => onRemoveSignup(su.id, su.displayName)}
                          className="rounded-full p-0.5 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                          title={`${su.displayName} austragen`}
                          aria-label={`${su.displayName} austragen`}
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-2xs italic text-fg-muted">Noch niemand eingeteilt.</p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
