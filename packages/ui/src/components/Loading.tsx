import type { HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/* ----------------------------------------------------------------- Spinner */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const spinnerSizes: Record<SpinnerSize, string> = {
  xs: 'size-3 border-[1.5px]',
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-10 border-[3px]',
};

/**
 * Einheitlicher Lade-Ring. Übernimmt die Textfarbe (`currentColor`),
 * bei reduzierter Bewegung pulsiert er statt zu drehen.
 */
export function Spinner({
  size = 'sm',
  className,
  label,
}: {
  size?: SpinnerSize;
  className?: string;
  /** Beschriftung für Screenreader; ohne Angabe ist der Ring dekorativ. */
  label?: string;
}) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent motion-reduce:animate-pulse',
        spinnerSizes[size],
        className
      )}
    />
  );
}

/* -------------------------------------------------------------- PageLoader */

export interface PageLoaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Text unter dem Ring. */
  label?: string;
  /** Füllt den ganzen Viewport statt nur den umgebenden Bereich. */
  fullscreen?: boolean;
}

/** Zentrierte Ladeanzeige für Seiten und grosse Bereiche. */
export function PageLoader({ label = 'Lädt …', fullscreen, className, ...props }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-accent',
        fullscreen ? 'min-h-dvh' : 'min-h-[40vh]',
        className
      )}
      {...props}
    >
      <Spinner size="lg" />
      <span className="text-sm text-fg-muted">{label}</span>
    </div>
  );
}
