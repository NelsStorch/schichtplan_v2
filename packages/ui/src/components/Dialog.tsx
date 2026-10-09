'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Kleines Icon/Logo links vom Titel */
  icon?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  className?: string;
}

const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * Natives <dialog> (Fokus-Falle, ESC, Top-Layer gratis).
 * Mobile: Bottom-Sheet vom unteren Rand. Ab `sm`: zentrierter Dialog.
 * Inhalt wird nur gerendert, solange der Dialog offen ist (Formulare starten frisch).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  size = 'md',
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Hintergrund-Scroll sperren, solange offen
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        'z-sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-card border border-b-0 border-line bg-surface p-0 text-fg shadow-lift',
        'backdrop:bg-[rgb(12_10_9/0.65)] backdrop:backdrop-blur-sm open:animate-sheet-up',
        'sm:m-auto sm:max-h-[86dvh] sm:rounded-card sm:border-b sm:open:animate-scale-in',
        widths[size],
        className
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          {/* Griff als visueller Hinweis auf das Sheet (nur Mobile) */}
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          <header className="flex items-start gap-3 px-5 pb-4 pt-4 sm:px-7 sm:pt-6">
            {icon && (
              <div className="flex size-11 shrink-0 items-center justify-center rounded-tile bg-accent/12 text-accent-ink [&_svg]:size-5">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="font-display text-xl font-bold tracking-tight text-fg">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schliessen"
              className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-full text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-7 sm:pb-6">
            {children}
          </div>
          {footer && (
            <footer className="flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-end sm:px-7 sm:pb-5 [&>*]:w-full sm:[&>*]:w-auto">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
