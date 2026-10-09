import type { HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'outline' | 'glass';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  accent: 'bg-accent/12 text-accent-ink',
  success: 'bg-success/12 text-success-ink',
  warning: 'bg-warning/14 text-warning-ink',
  danger: 'bg-danger/12 text-danger-ink',
  outline: 'border border-line-strong text-fg-muted',
  // Für Text auf Fotos/Bannern: eigene Scrim-Fläche statt transparentem Hintergrund
  glass: 'border border-white/15 bg-black/45 text-white backdrop-blur-md',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

export function Badge({ tone = 'neutral', size = 'sm', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-semibold [&_svg]:shrink-0',
        size === 'sm' ? 'h-6 px-2.5 text-xs [&_svg]:size-3.5' : 'h-8 px-3.5 text-[13px] [&_svg]:size-4',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
