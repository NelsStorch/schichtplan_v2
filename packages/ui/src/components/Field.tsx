'use client';

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

// 16px auf Mobile verhindert das automatische Zoomen von iOS Safari beim Fokussieren.
const control =
  'w-full rounded-field border border-line bg-surface-2 px-4 text-base text-fg sm:text-[15px] ' +
  'placeholder:text-fg-subtle outline-none transition-[border-color,box-shadow,background-color] duration-200 ' +
  'hover:border-line-strong focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, onWheel, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(control, 'h-12', className)}
        {...props}
        onWheel={(e) => {
          // Das Mausrad soll die Seite scrollen, nicht still den Wert eines aktiven Zahlenfelds ändern
          if (props.type === 'number') e.currentTarget.blur();
          onWheel?.(e);
        }}
      />
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(control, 'min-h-24 resize-y py-3 leading-relaxed', className)}
        {...props}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(control, 'h-12 cursor-pointer appearance-none pr-11', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        />
      </div>
    );
  }
);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Genau ein Control (Input/Select/Textarea). id + aria-Attribute werden automatisch gesetzt. */
  children: ReactElement<Record<string, unknown>>;
}

/** Label oben, Hinweis/Fehler unten. Kein Placeholder-als-Label. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const autoId = useId();
  const id = (isValidElement(children) && (children.props.id as string)) || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-fg">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-accent-ink">
            *
          </span>
        )}
      </label>
      {cloneElement(children, {
        id,
        required: required || children.props.required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs leading-relaxed text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {(label || description) && (
        <label htmlFor={id} className={cn('min-w-0', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
          {label && <span className="block text-sm font-semibold text-fg">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-fg-subtle">{description}</span>}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-surface-3 ring-1 ring-inset ring-line-strong',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={cn(
            'size-5 rounded-full bg-white shadow-soft transition-transform duration-300 ease-out-expo',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
