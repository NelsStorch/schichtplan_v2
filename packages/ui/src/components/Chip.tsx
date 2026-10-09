import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  count?: number;
}

/** Filter-/Auswahl-Pille. Ausgewählt = invertiert (stärkster Kontrast im System). */
export function Chip({ selected, count, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-10 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold',
        'transition-[background-color,color,border-color,transform] duration-200 ease-out-expo active:scale-[0.97]',
        selected
          ? 'bg-fg text-canvas'
          : 'border border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
        className
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'tabular rounded-full px-1.5 text-xs font-bold',
            selected ? 'bg-canvas/15' : 'bg-surface-3 text-fg-subtle'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Horizontal scrollbare Chip-Leiste (Scroll-Snap auf Mobile, Wrap ab md). */
export function ChipRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        '-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
        className
      )}
      {...props}
    />
  );
}
