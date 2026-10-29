'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@schichtplan/ui';
import { useCommandPalette } from './CommandContext';

export function CommandPaletteButton({ className }: { className?: string }) {
  const { open } = useCommandPalette();
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Befehlsmenü und Suche öffnen (Cmd+K)"
      title={`Befehlsmenü und Suche (${isMac ? '⌘K' : 'Ctrl+K'})`}
      className={cn(
        'group flex items-center gap-2 rounded-full border border-line bg-surface/80 px-2.5 py-1.5 text-xs font-medium text-fg-muted shadow-2xs backdrop-blur-md transition',
        'hover:border-line-strong hover:bg-surface-2 hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent sm:px-3',
        className
      )}
    >
      <Search className="size-3.5 text-fg-subtle transition group-hover:text-fg" />
      <span className="hidden sm:inline">Suchen...</span>
      <kbd className="hidden rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-subtle shadow-2xs group-hover:border-line-strong sm:inline-block">
        {isMac ? '⌘K' : 'Ctrl+K'}
      </kbd>
    </button>
  );
}
