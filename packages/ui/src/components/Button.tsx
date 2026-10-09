import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const base =
  'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold select-none ' +
  'transition-[transform,background-color,border-color,color,box-shadow,filter] duration-200 ease-out-expo ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg shadow-glow hover:brightness-110',
  secondary: 'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
  outline: 'border border-line-strong text-fg hover:bg-surface-2',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/25 bg-danger/10 text-danger-ink hover:bg-danger/15',
  inverse: 'bg-fg text-canvas hover:opacity-90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] [&_svg]:size-4',
  md: 'h-11 px-5 text-sm [&_svg]:size-[18px]',
  lg: 'h-13 px-7 text-[15px] [&_svg]:size-5',
  icon: 'size-11 [&_svg]:size-5',
  'icon-sm': 'size-9 [&_svg]:size-4',
};

/** Klassen für Links, die wie Buttons aussehen sollen (z. B. next/link). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, disabled, className, children, type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
});
