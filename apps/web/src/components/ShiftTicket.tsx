'use client';

import { Check, Lock, UserMinus, X } from 'lucide-react';
import type { ShiftDto } from '@schichtplan/shared';
import { Avatar, Badge, Button, SlotMeter, cn, slotStatus } from '@schichtplan/ui';
import { fmtDuration, fmtTime, isPast } from '@/lib/format';

export interface ShiftTicketProps {
  shift: ShiftDto;
  index?: number;
  isMine: boolean;
  canManage: boolean;
  /** Anmeldung nur mit Login möglich und niemand angemeldet */
  needsLogin: boolean;
  busy?: boolean;
  onSignup: () => void;
  onCancel: () => void;
  onRemoveHelper: (signupId: string, name: string) => void;
}

const STATUS_TEXT = {
  open: (free: number) => `${free} Plätze frei`,
  last: () => 'Noch 1 Platz frei',
  full: () => 'Voll besetzt',
};

/**
 * Eine Schicht als "Ticket": links die Zeit als Abriss mit Perforation,
 * rechts Aufgabe, Belegung und Aktion.
 */
export function ShiftTicket({
  shift,
  index = 0,
  isMine,
  canManage,
  needsLogin,
  busy,
  onSignup,
  onCancel,
  onRemoveHelper,
}: ShiftTicketProps) {
  const signups = shift.signups ?? [];
  const filled = signups.length;
  const total = shift.requiredSlots;
  const status = slotStatus(filled, total);
  const free = Math.max(0, total - filled);
  const over = isPast(shift.endTime);

  return (
    <article
      style={{ '--i': index } as React.CSSProperties}
      className={cn(
        'relative grid animate-fade-up stagger grid-cols-[5.25rem_1fr] rounded-card border bg-surface shadow-inset-hi transition-[border-color,box-shadow] duration-300 sm:grid-cols-[7rem_1fr]',
        isMine
          ? 'border-accent/60 bg-[linear-gradient(135deg,rgb(var(--accent)/0.10),transparent_55%)] shadow-glow'
          : 'border-line hover:border-line-strong',
        over && 'opacity-60'
      )}
    >
      {/* Zeit-Abriss */}
      <div className="relative flex flex-col items-center justify-center border-r border-dashed border-line-strong px-2 py-5 text-center sm:items-start sm:px-5 sm:text-left">
        <span className="tabular font-mono text-xl font-semibold tracking-tight text-fg sm:text-2xl">
          {fmtTime(shift.startTime)}
        </span>
        <span className="tabular font-mono text-xs text-fg-subtle">bis {fmtTime(shift.endTime)}</span>
        <span className="mt-2 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-fg-muted">
          {fmtDuration(shift.startTime, shift.endTime)}
        </span>
        {/* Perforations-Kerben oben und unten */}
        <span aria-hidden className={cn('absolute -right-[9px] -top-px size-[18px] -translate-y-1/2 -rotate-45 rounded-full border border-transparent bg-canvas', isMine ? 'border-b-accent/60 border-l-accent/60' : 'border-b-line border-l-line')} />
        <span aria-hidden className={cn('absolute -bottom-px -right-[9px] size-[18px] translate-y-1/2 -rotate-45 rounded-full border border-transparent bg-canvas', isMine ? 'border-r-accent/60 border-t-accent/60' : 'border-r-line border-t-line')} />
      </div>

      <div className="flex min-w-0 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{shift.category}</Badge>
          {shift.minAge ? <Badge tone="warning">ab {shift.minAge} Jahren</Badge> : null}
          {isMine && (
            <Badge tone="success">
              <Check /> Du bist dabei
            </Badge>
          )}
        </div>

        <div>
          <h3 className="text-lg font-bold leading-snug tracking-tight text-fg">{shift.title}</h3>
          {shift.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-fg-muted">{shift.description}</p>
          )}
        </div>

        {signups.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Eingetragen">
            {signups.map((s) => (
              <li
                key={s.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 pl-1 pr-3 text-[13px] font-medium text-fg"
              >
                <Avatar name={s.displayName} size="sm" className="size-6 text-[9px]" />
                {s.displayName}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => onRemoveHelper(s.id, s.displayName)}
                    aria-label={`${s.displayName} austragen`}
                    className="-mr-1.5 ml-0.5 rounded-full p-1 text-fg-subtle transition hover:bg-danger/10 hover:text-danger-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div className="min-w-0">
            <SlotMeter filled={filled} total={total} />
            <p
              className={cn(
                'mt-1.5 text-xs font-semibold',
                status === 'full' ? 'text-success-ink' : status === 'last' ? 'text-warning-ink' : 'text-fg-muted'
              )}
            >
              <span className="tabular">
                {filled}/{total}
              </span>{' '}
              · {STATUS_TEXT[status](free)}
            </p>
          </div>

          {!over &&
            (isMine ? (
              <Button variant="danger" size="sm" onClick={onCancel} loading={busy}>
                <UserMinus /> Austragen
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onSignup}
                loading={busy}
                disabled={status === 'full'}
                variant={status === 'full' ? 'secondary' : 'primary'}
                className="max-sm:w-full"
              >
                {status === 'full' ? 'Voll' : needsLogin ? <><Lock /> Anmelden &amp; eintragen</> : 'Eintragen'}
              </Button>
            ))}
        </div>
      </div>
    </article>
  );
}
