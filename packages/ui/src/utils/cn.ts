import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge muss die eigenen Token-Klassen kennen, sonst verwirft es z. B.
// `text-accent-fg` als vermeintlichen Konflikt mit `text-sm`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs'] }],
      rounded: [{ rounded: ['tile', 'field', 'card'] }],
      shadow: [{ shadow: ['soft', 'lift', 'glow', 'inset-hi'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
