'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CommandContextData, CommandItem } from './types';

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  contextData: CommandContextData;
  registerContextData: (data: Partial<CommandContextData>) => () => void;
  activeSubActionItem: CommandItem | null;
  setActiveSubActionItem: (item: CommandItem | null) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextData, setContextData] = useState<CommandContextData>({});
  const [activeSubActionItem, setActiveSubActionItem] = useState<CommandItem | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setActiveSubActionItem(null);
  }, []);
  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) setActiveSubActionItem(null);
      return !prev;
    });
  }, []);

  const registerContextData = useCallback((data: Partial<CommandContextData>) => {
    setContextData((prev) => ({ ...prev, ...data }));
    return () => {
      setContextData((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(data) as (keyof CommandContextData)[]) {
          if (next[key] === data[key]) {
            delete next[key];
          }
        }
        return next;
      });
    };
  }, []);

  // Globaler Keyboard-Shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      contextData,
      registerContextData,
      activeSubActionItem,
      setActiveSubActionItem,
    }),
    [isOpen, open, close, toggle, contextData, registerContextData, activeSubActionItem]
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error('useCommandPalette muss innerhalb von <CommandPaletteProvider> verwendet werden.');
  }
  return ctx;
}
