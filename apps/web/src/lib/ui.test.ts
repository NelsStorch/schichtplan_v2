import { describe, expect, it } from 'vitest';
import { cn } from '@schichtplan/ui';

describe('UI cn utility', () => {
  it('kombiniert Klassen und löst Tailwind-Konflikte auf', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('unterstützt bedingte Klassen und ignoriert falsy Werte', () => {
    const isVisible = true;
    const isDisabled = false;
    expect(cn('base-class', isVisible && 'visible-class', isDisabled && 'disabled-class', null, undefined)).toBe(
      'base-class visible-class'
    );
  });

  it('behält benutzerdefinierte Schichtplan-Tokens wie rounded-tile und shadow-soft', () => {
    expect(cn('rounded-card', 'rounded-tile')).toBe('rounded-tile');
    expect(cn('shadow-soft', 'shadow-glow')).toBe('shadow-glow');
    expect(cn('text-2xs', 'font-bold')).toBe('text-2xs font-bold');
  });
});
