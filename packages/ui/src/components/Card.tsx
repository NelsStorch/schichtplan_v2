import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` hebt die Karte mit Schatten ab – nur wenn echte Hierarchie besteht. */
  variant?: 'flat' | 'raised' | 'sunken';
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'flat', interactive, className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-card border',
        variant === 'flat' && 'border-line bg-surface shadow-inset-hi',
        variant === 'raised' && 'border-line bg-surface shadow-lift shadow-inset-hi',
        variant === 'sunken' && 'border-transparent bg-surface-2',
        interactive &&
          'transition-[transform,border-color,box-shadow] duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift',
        className
      )}
      {...props}
    />
  );
});
