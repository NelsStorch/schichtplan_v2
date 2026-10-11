import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

/* ------------------------------------------------------------ ProgressRing */

export interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  /** Farbe des Fortschritts: Akzent oder Erfolg (z. B. wenn voll) */
  tone?: 'accent' | 'success';
  /** Spur-Farbe; auf Fotos/Bannern z. B. `text-white/15` */
  trackClassName?: string;
  className?: string;
}

/** Belegungs-Ring (Nachfolger des "Fortschrittskreises" der Legacy-App). */
export function ProgressRing({
  value,
  max,
  size = 132,
  stroke = 12,
  label,
  sublabel,
  tone = 'accent',
  trackClassName = 'text-fg/10',
  className,
}: ProgressRingProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);

  return (
    <div
      role="img"
      aria-label={`${value} von ${max} belegt`}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={cn('stroke-current', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ '--ring-c': circumference, '--ring-o': offset } as CSSProperties}
          className={cn(
            'animate-ring-fill stroke-current',
            tone === 'success' ? 'text-success' : 'text-accent'
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && <span className="tabular font-display text-3xl font-extrabold leading-none tracking-tight">{label}</span>}
        {sublabel && <span className="mt-1 text-2xs font-semibold uppercase tracking-wider opacity-75">{sublabel}</span>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- SlotMeter */

export type SlotStatus = 'open' | 'last' | 'full';

export function slotStatus(filled: number, total: number): SlotStatus {
  const free = total - filled;
  if (free <= 0) return 'full';
  if (free === 1) return 'last';
  return 'open';
}

/** Plätze als Pips (bis 12), darüber als segmentierter Balken. */
export function SlotMeter({ filled, total, className }: { filled: number; total: number; className?: string }) {
  const status = slotStatus(filled, total);
  const fillClass = status === 'full' ? 'bg-success' : status === 'last' ? 'bg-warning' : 'bg-accent';

  if (total <= 12) {
    return (
      <div aria-hidden className={cn('flex flex-wrap gap-1', className)}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 w-4 rounded-full transition-colors',
              i < filled ? fillClass : 'border border-dashed border-line-strong'
            )}
          />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className={cn('flex h-2.5 w-full max-w-48 gap-0.5', className)}>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={cn('flex-1 rounded-full', i < Math.round((filled / total) * 12) ? fillClass : 'bg-surface-3')}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Avatar */

export function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s/]/gu, '').split(/[\s/]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  highlight,
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-10 text-sm',
        size === 'lg' && 'size-14 text-lg',
        highlight ? 'bg-accent text-accent-fg ring-2 ring-accent/30 ring-offset-2 ring-offset-surface' : 'bg-surface-3 text-fg',
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton animate-shimmer rounded-field', className)} {...props} />;
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-14 text-center',
        className
      )}
    >
      {icon && (
        <div className="mb-5 flex size-16 items-center justify-center rounded-full bg-accent/10 text-accent-ink [&_svg]:size-7">
          {icon}
        </div>
      )}
      <h3 className="font-display text-xl font-bold tracking-tight text-fg">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
