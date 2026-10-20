'use client';

import { Check, ChevronRight, Edit } from 'lucide-react';
import type { ShiftDto, ShiftTaskDto } from '@schichtplan/shared';
import { Avatar, Badge, Button, SlotMeter, cn, slotStatus } from '@schichtplan/ui';
import { fmtDuration, fmtTime, isPast } from '@/lib/format';

export interface ShiftTicketProps {
  shift: ShiftDto;
  index?: number;
  isMine: boolean;
  canManage: boolean;
  needsLogin: boolean;
  busy?: boolean;
  contactUser?: { id: string; displayName: string; phone?: string | null; email?: string | null } | null;
  responsibles?: { id: string; displayName: string; phone?: string | null; email?: string | null }[];
  onSignup: (task?: ShiftTaskDto) => void;
  onCancel: (signupId?: string) => void;
  onRemoveHelper: (signupId: string, name: string) => void;
  onEdit?: () => void;
  onSelect?: (shift: ShiftDto) => void;
}

const STATUS_TEXT = {
  open: (free: number) => `Noch ${free} Plätze frei`,
  last: () => 'Noch 1 Platz frei',
  full: () => 'Voll besetzt',
};

/**
 * Eine Schicht als interaktives "Ticket" im Schweizer Präzisions-Design:
 * Links der Zeit-Abriss mit Perforations-Kerben.
 * Rechts Kategorie, Titel, Vorschau der Arbeiten und Belegung.
 * Beim Klick öffnet sich der ShiftDetailsDialog mit allen Arbeiten.
 */
export function ShiftTicket({
  shift,
  index = 0,
  isMine,
  canManage,
  needsLogin,
  busy,
  contactUser,
  responsibles,
  onSignup,
  onCancel,
  onRemoveHelper,
  onEdit,
  onSelect,
}: ShiftTicketProps) {
  const signups = shift.signups ?? [];
  const filled = signups.length;
  const total = shift.requiredSlots;
  const status = slotStatus(filled, total);
  const free = Math.max(0, total - filled);
  const over = isPast(shift.endTime);

  const tasks =
    shift.tasks && shift.tasks.length > 0
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

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(shift);
    }
  };

  return (
    <article
      style={{ '--i': index } as React.CSSProperties}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Schicht ${shift.title}, ${fmtTime(shift.startTime)} bis ${fmtTime(shift.endTime)}, ${STATUS_TEXT[status](free)}`}
      className={cn(
        'group relative grid animate-fade-up stagger grid-cols-[5.25rem_1fr] cursor-pointer rounded-card border text-left',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 active:scale-[0.99] sm:grid-cols-[7rem_1fr]',
        isMine
          ? 'border-accent/60 bg-[linear-gradient(135deg,rgb(var(--accent)/0.10),transparent_60%)] shadow-glow hover:border-accent'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/50 hover:shadow-soft',
        over && 'opacity-65'
      )}
    >
      {/* Zeit-Abriss */}
      <div className="relative flex flex-col items-center justify-center border-r border-dashed border-line-strong px-2 py-5 text-center sm:items-start sm:px-5 sm:text-left">
        <span className="tabular font-mono text-xl font-bold tracking-tight text-fg sm:text-2xl">
          {fmtTime(shift.startTime)}
        </span>
        <span className="tabular font-mono text-xs text-fg-subtle">
          bis {fmtTime(shift.endTime)}
        </span>
        <span className="mt-2.5 rounded-full border border-line/60 bg-surface-2 px-2.5 py-0.5 font-mono text-2xs font-semibold text-fg-muted">
          {fmtDuration(shift.startTime, shift.endTime)}
        </span>

        {/* Perforations-Kerben oben und unten */}
        <span
          aria-hidden
          className={cn(
            'absolute -right-[9px] -top-px size-[18px] -translate-y-1/2 -rotate-45 rounded-full border border-transparent bg-canvas',
            isMine ? 'border-b-accent/60 border-l-accent/60' : 'border-b-line border-l-line'
          )}
        />
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-px -right-[9px] size-[18px] translate-y-1/2 -rotate-45 rounded-full border border-transparent bg-canvas',
            isMine ? 'border-r-accent/60 border-t-accent/60' : 'border-r-line border-t-line'
          )}
        />
      </div>

      {/* Haupt-Bereich */}
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
        {/* Badges & Edit-Button */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {shift.isSetupTeardown && (
              <Badge tone="warning" className="border-warning/30 bg-warning/15 font-bold text-warning-ink">
                🛠️ Aufbau / Abbau
              </Badge>
            )}
            {shift.category ? <Badge>{shift.category}</Badge> : null}
            {responsibles && responsibles.length > 0 && (
              <Badge tone="neutral" className="max-w-[200px] truncate">
                Leitung: {responsibles.map((r) => r.displayName).join(', ')}
              </Badge>
            )}
            {shift.minAge ? (
              <Badge tone="warning">Schicht ab {shift.minAge} J.</Badge>
            ) : null}
            {isMine && (
              <Badge tone="success">
                <Check className="size-3" /> Du bist dabei
              </Badge>
            )}
            {over && <Badge tone="neutral">Vergangen</Badge>}
          </div>

          {canManage && onEdit && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              aria-label="Schicht bearbeiten"
            >
              <Edit className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Titel & Kurzbeschreibung */}
        <div>
          <h3 className="text-lg font-bold leading-snug tracking-tight text-fg transition-colors group-hover:text-accent-ink">
            {shift.title}
          </h3>
          {shift.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-muted">
              {shift.description}
            </p>
          )}
        </div>

        {/* Arbeiten-Vorschau (Pills mit Einteilungszähler) */}
        <div className="space-y-1.5 rounded-field border border-line/70 bg-surface-2/40 p-2.5">
          <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-fg-subtle">
            <span>
              {tasks.length} {tasks.length === 1 ? 'Arbeit' : 'Arbeiten'}:
            </span>
            <span className="text-accent-ink font-semibold lowercase tracking-normal">
              Klicken für Details &amp; Arbeiten
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {tasks.map((t) => {
              const taskSignups = signups.filter(
                (s) => s.taskId === t.id || (tasks.length === 1 && !s.taskId)
              );
              const isTaskFull = taskSignups.length >= t.requiredSlots;
              return (
                <span
                  key={t.id}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    isTaskFull
                      ? 'border-line/80 bg-surface text-fg-muted'
                      : 'border-accent/30 bg-accent/10 text-accent-ink'
                  )}
                >
                  <span className="truncate max-w-[130px] sm:max-w-[180px]">{t.title}</span>
                  {t.minAge && (
                    <span className="rounded bg-warning/20 px-1 py-0.2 text-[10px] font-bold text-warning-ink">
                      {t.minAge}+
                    </span>
                  )}
                  <span className="tabular font-mono text-2xs text-fg-subtle">
                    ({taskSignups.length}/{t.requiredSlots})
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Helfer-Avatar-Vorschau */}
        {signups.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5 overflow-hidden">
              {signups.slice(0, 5).map((s) => (
                <Avatar
                  key={s.id}
                  name={s.displayName}
                  size="sm"
                  className="size-6 border-2 border-surface text-[9px]"
                />
              ))}
            </div>
            <span className="text-xs text-fg-muted">
              {signups.length === 1
                ? `${signups[0].displayName} ist eingeteilt`
                : signups.length <= 3
                ? signups.map((s) => s.displayName).join(', ')
                : `${signups.slice(0, 2).map((s) => s.displayName).join(', ')} +${signups.length - 2} weitere`}
            </span>
          </div>
        )}

        {/* Footer mit SlotMeter und Action-Button im Island-Format */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-line/60">
          <div className="min-w-0">
            <SlotMeter filled={filled} total={total} className="w-28 sm:w-36" />
            <p
              className={cn(
                'mt-1.5 text-xs font-semibold',
                status === 'full'
                  ? 'text-success-ink'
                  : status === 'last'
                  ? 'text-warning-ink'
                  : 'text-fg-muted'
              )}
            >
              <span className="tabular font-mono">
                {filled}/{total}
              </span>{' '}
              · {STATUS_TEXT[status](free)}
            </p>
            {status === 'full' && contactUser && (
              <p className="mt-1 text-2xs font-semibold text-accent-ink">
                Fragen an {contactUser.displayName}
              </p>
            )}
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full py-1 pl-3 pr-1.5 text-xs font-semibold transition-all duration-300',
              isMine
                ? 'bg-surface-2 text-fg border border-line group-hover:border-line-strong'
                : status === 'full'
                ? 'bg-surface-2 text-fg-muted border border-line'
                : 'bg-accent text-accent-fg shadow-sm group-hover:brightness-105'
            )}
          >
            <span>Arbeiten anzeigen</span>
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5',
                isMine || status === 'full' ? 'bg-line/60 text-fg' : 'bg-black/20 text-accent-fg'
              )}
            >
              <ChevronRight className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
