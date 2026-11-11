'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../utils/cn';
import { Button } from './Button';
import { Dialog } from './Dialog';

/* ------------------------------------------------------------------ Toasts */

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);

const toastIcon = {
  success: <CheckCircle2 className="size-5 text-success-ink" />,
  error: <AlertTriangle className="size-5 text-danger-ink" />,
  info: <Info className="size-5 text-accent-ink" />,
};

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = ++nextId.current;
      setToasts((all) => [...all.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === 'error' ? 7000 : 4500);

      // Falls ein nativer <dialog> (Top Layer) aktiv ist, befördert showPopover() die Toasts darüber
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          const el = containerRef.current;
          if (el && typeof el.showPopover === 'function') {
            try {
              if (el.matches?.(':popover-open')) {
                el.hidePopover();
              }
              el.showPopover();
            } catch {
              // Browser ohne Popover-API ignorieren
            }
          }
        });
      }
    },
    [dismiss]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof el.showPopover !== 'function') return;
    if (toasts.length === 0) {
      try {
        if (el.matches?.(':popover-open')) {
          el.hidePopover();
        }
      } catch {
        // Ignorieren
      }
    }
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Mobile über der Tab-Leiste, Desktop unten rechts. popover="manual" hebt Toasts in den Top-Layer über native <dialog> */}
      <div
        ref={containerRef}
        popover="manual"
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-toast flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:items-end',
          'm-0 border-0 bg-transparent p-0 overflow-visible'
        )}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-card border border-line bg-surface/95 p-4 shadow-lift backdrop-blur-xl"
          >
            <span className="mt-0.5 shrink-0">{toastIcon[t.tone ?? 'success']}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Meldung schliessen"
              className="-m-1 rounded-full p-1 text-fg-subtle transition hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ----------------------------------------------------------- Bestätigungen */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** Cooldown in Sekunden, während dem der Bestätigen-Button gesperrt ist (z. B. 7) */
  countdownSeconds?: number;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);
/** Ersatz für window.confirm(): `if (await confirm({...})) ...` */
export const useConfirm = () => useContext(ConfirmContext);

function ConfirmDialog({
  options,
  onSettle,
}: {
  options: ConfirmOptions;
  onSettle: (value: boolean) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(options.countdownSeconds ?? 0);

  useEffect(() => {
    const initial = options.countdownSeconds ?? 0;
    setSecondsLeft(initial);
    if (initial <= 0) return;

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [options]);

  const isLocked = secondsLeft > 0;
  const baseLabel = options.confirmLabel ?? 'Bestätigen';
  const label = isLocked ? `${baseLabel} (${secondsLeft}s)` : baseLabel;

  return (
    <Dialog
      open
      onClose={() => onSettle(false)}
      size="sm"
      title={options.title}
      description={options.description}
      icon={options.tone === 'danger' ? <AlertTriangle /> : <Info />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onSettle(false)}>
            {options.cancelLabel ?? 'Abbrechen'}
          </Button>
          <Button
            variant={options.tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => onSettle(true)}
            disabled={isLocked}
            autoFocus={!isLocked}
          >
            {label}
          </Button>
        </>
      }
    />
  );
}

function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(undefined);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options !== null && (
        <ConfirmDialog options={options} onSettle={settle} />
      )}
    </ConfirmContext.Provider>
  );
}

/** Einmal im Root-Layout einbinden: stellt Toasts und Bestätigungsdialoge bereit. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}

/* ---------------------------------------------------------------- Callout */

export function Callout({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'bg-accent/8 border-accent/20 [&_.ico]:text-accent-ink',
    success: 'bg-success/8 border-success/25 [&_.ico]:text-success-ink',
    warning: 'bg-warning/10 border-warning/25 [&_.ico]:text-warning-ink',
    danger: 'bg-danger/8 border-danger/25 [&_.ico]:text-danger-ink',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn('flex gap-3 rounded-field border p-4 text-sm', styles, className)}
    >
      <Icon className="ico mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 leading-relaxed text-fg-muted">
        {title && <p className="font-semibold text-fg">{title}</p>}
        {children}
      </div>
    </div>
  );
}
