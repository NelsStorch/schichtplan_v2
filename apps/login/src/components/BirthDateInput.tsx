'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Calendar } from 'lucide-react';
import { Input, cn } from '@schichtplan/ui';

export function formatDisplayDate(digits: string): string {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
}

export function isoToDisplay(iso: string): string {
  if (!iso?.includes('-')) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export function digitsToIso(digits: string): string | null {
  if (digits.length !== 8) return null;
  const d = parseInt(digits.slice(0, 2), 10);
  const m = parseInt(digits.slice(2, 4), 10);
  const y = parseInt(digits.slice(4, 8), 10);
  const currentYear = new Date().getFullYear();
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > currentYear) return null;

  const dateObj = new Date(y, m - 1, d);
  if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface BirthDateInputProps {
  id?: string;
  value: string; // ISO-Format: YYYY-MM-DD
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

/**
 * Optimierte Geburtsdatum-Eingabe:
 * - Schnelles Tippen im Schweizer Format TT.MM.JJJJ mit automatischer Formatierung
 * - Nativer Kalender-Picker optional über Kalender-Symbol
 * - Zuverlässige Validierung gegen Kalendertage und Schaltjahre
 */
export const BirthDateInput = forwardRef<HTMLInputElement, BirthDateInputProps>(
  function BirthDateInput(
    {
      id,
      value,
      onChange,
      required,
      disabled,
      autoFocus,
      className,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedBy,
    },
    ref
  ) {
    const textInputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => textInputRef.current as HTMLInputElement);

    const [display, setDisplay] = useState(() => isoToDisplay(value));

    // Externe Wertänderungen synchronisieren (z. B. Formular-Reset)
    useEffect(() => {
      if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        setDisplay(isoToDisplay(value));
      } else if (!value) {
        setDisplay('');
      }
    }, [value]);

    const handleTextChange = useCallback(
      (rawText: string) => {
        // Falls ein ISO-Datum (z. B. durch Copy-Paste oder Autofill) eingefügt wurde
        const isoMatch = rawText.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const digits = isoMatch
          ? `${isoMatch[3]}${isoMatch[2]}${isoMatch[1]}`
          : rawText.replace(/\D/g, '').slice(0, 8);

        const formatted = formatDisplayDate(digits);
        setDisplay(formatted);

        const iso = digitsToIso(digits);
        onChange(iso ?? '');
      },
      [onChange]
    );

    // Verhindert das Hängenbleiben bei Backspace hinter einem Punkt (.):
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        const input = e.currentTarget;
        const { selectionStart, selectionEnd, value: currentVal } = input;
        if (selectionStart === selectionEnd && selectionStart !== null && selectionStart > 0) {
          const charBefore = currentVal[selectionStart - 1];
          if (charBefore === '.') {
            e.preventDefault();
            const newVal = currentVal.slice(0, selectionStart - 2) + currentVal.slice(selectionStart);
            handleTextChange(newVal);
          }
        }
      }
    };

    const openCalendar = () => {
      const picker = pickerRef.current;
      if (!picker) return;
      try {
        if ('showPicker' in picker && typeof (picker as any).showPicker === 'function') {
          (picker as any).showPicker();
        } else {
          picker.focus();
        }
      } catch {
        picker.focus();
      }
    };

    return (
      <div className="relative">
        <Input
          ref={textInputRef}
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="TT.MM.JJJJ"
          value={display}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="bday"
          maxLength={10}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn('pr-11 font-mono tracking-wide', className)}
        />

        {/* Verstecktes natives Datumsfeld für den System-Kalenderpicker */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          max={new Date().toISOString().slice(0, 10)}
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val);
            if (val) setDisplay(isoToDisplay(val));
          }}
          className="pointer-events-none absolute right-3 top-1/2 -z-10 size-0 opacity-0"
        />

        <button
          type="button"
          onClick={openCalendar}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-fg-subtle transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Kalender öffnen"
        >
          <Calendar className="size-4" />
        </button>
      </div>
    );
  }
);
