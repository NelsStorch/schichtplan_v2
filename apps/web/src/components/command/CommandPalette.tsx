'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Command,
  CornerDownLeft,
  HelpCircle,
  Mail,
  Phone,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Avatar, Badge, SlotMeter, cn } from '@schichtplan/ui';
import { useCommandPalette } from './CommandContext';
import { HighlightText } from './HighlightText';
import { clearRecentCommands } from './recentCommands';
import { useCommandItems } from './useCommandItems';
import type { CommandItem, CommandSubAction } from './types';

export function CommandPalette() {
  const { isOpen, close, activeSubActionItem, setActiveSubActionItem } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [subQuery, setSubQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSubIndex, setSelectedSubIndex] = useState(0);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const subListRef = useRef<HTMLDivElement>(null);

  const { items, groupedSections, prefixMode, cleanQuery } = useCommandItems(query);

  // Gefilterte Sub-Aktionen, falls Inspector aktiv ist
  const filteredSubActions = useMemo(() => {
    if (!activeSubActionItem?.subActions) return [];
    const q = subQuery.trim().toLowerCase();
    if (!q) return activeSubActionItem.subActions;
    return activeSubActionItem.subActions.filter((sub) => {
      const matchTitle = sub.title.toLowerCase().includes(q);
      const matchKw = sub.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchTitle || matchKw;
    });
  }, [activeSubActionItem, subQuery]);

  // Dialog öffnen / schliessen
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      setQuery('');
      setSubQuery('');
      setSelectedIndex(0);
      setSelectedSubIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Scroll lock wenn offen
  useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prev;
    };
  }, [isOpen]);

  // Auswahl bei Suchänderung zurücksetzen
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setSelectedSubIndex(0);
  }, [subQuery]);

  // Wenn SubAction-Modus betreten wird, Fokus ins Sub-Input setzen
  useEffect(() => {
    if (activeSubActionItem) {
      setSubQuery('');
      setSelectedSubIndex(0);
      setTimeout(() => subInputRef.current?.focus(), 30);
    } else {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [activeSubActionItem]);

  // Automatisch ins Sichtfeld scrollen
  useEffect(() => {
    if (!isOpen) return;
    if (activeSubActionItem) {
      const el = subListRef.current?.querySelector(`[data-index="${selectedSubIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    } else {
      const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, selectedSubIndex, activeSubActionItem, isOpen]);

  // Tastatursteuerung
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Wenn Sub-Aktionsmodus aktiv ist
    if (activeSubActionItem) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredSubActions.length > 0) {
          setSelectedSubIndex((prev) => (prev + 1) % filteredSubActions.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredSubActions.length > 0) {
          setSelectedSubIndex((prev) => (prev - 1 + filteredSubActions.length) % filteredSubActions.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const action = filteredSubActions[selectedSubIndex];
        if (action) {
          action.onSelect();
          close();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActiveSubActionItem(null);
      } else if (e.key === 'Backspace' && subQuery === '') {
        e.preventDefault();
        setActiveSubActionItem(null);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (filteredSubActions.length > 0) {
          setSelectedSubIndex((prev) => (prev + 1) % filteredSubActions.length);
        }
      }
      return;
    }

    // Präfix mit Backspace entfernen, wenn cleanQuery leer ist
    if (e.key === 'Backspace' && cleanQuery === '' && prefixMode !== 'ALL') {
      e.preventDefault();
      setQuery('');
      return;
    }

    // Haupt-Palette Navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % items.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current) {
        current.onSelect();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current?.subActions && current.subActions.length > 0) {
        setActiveSubActionItem(current);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const currentItem = items[selectedIndex];
  const hasSubActions = Boolean(currentItem?.subActions && currentItem.subActions.length > 0);

  let flatIndexCounter = 0;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (activeSubActionItem) {
          setActiveSubActionItem(null);
        } else {
          close();
        }
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          close();
        }
      }}
      className={cn(
        'z-sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-b-0 border-line bg-surface p-0 text-fg shadow-lift',
        'backdrop:bg-[rgb(12_10_9/0.65)] backdrop:backdrop-blur-sm open:animate-sheet-up',
        'sm:m-auto sm:max-h-[82dvh] sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl sm:rounded-2xl sm:border sm:open:animate-scale-in'
      )}
    >
      <div className="flex h-full max-h-[inherit] flex-col" onKeyDown={handleKeyDown}>
        {/* Mobile Pull-Griff */}
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />

        {/* =========================================================================
            HEADER-SUCHLEISTE (Hauptsuche oder Sub-Aktions-Inspektor)
        ========================================================================= */}
        {activeSubActionItem ? (
          <div className="border-b border-line bg-surface-2/60 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
              <button
                type="button"
                onClick={() => setActiveSubActionItem(null)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent-ink transition hover:bg-surface-3"
              >
                <ArrowLeft className="size-3.5" /> Zurück
              </button>
              <ChevronRight className="size-3.5 text-fg-subtle" />
              <div className="flex items-center gap-1.5 truncate text-fg">
                <span className="truncate">{activeSubActionItem.title}</span>
                <span className="rounded bg-accent/15 px-1.5 py-0.2 text-[10px] font-bold uppercase text-accent-ink">
                  Aktionen
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2.5">
              <Search className="size-4 shrink-0 text-fg-subtle" />
              <input
                ref={subInputRef}
                type="text"
                value={subQuery}
                onChange={(e) => setSubQuery(e.target.value)}
                placeholder={`Aktion für «${activeSubActionItem.title}» wählen...`}
                className="w-full bg-transparent text-sm font-medium text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              {subQuery && (
                <button
                  type="button"
                  onClick={() => setSubQuery('')}
                  className="rounded p-1 text-fg-subtle hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <Search className="size-5 shrink-0 text-fg-subtle" />

            {/* Präfix-Tag Indicator (@, #, :, ?) */}
            {prefixMode !== 'ALL' && (
              <Badge tone="accent" className="shrink-0 text-xs font-semibold">
                {prefixMode === 'PEOPLE' && '@ Helfende'}
                {prefixMode === 'EVENTS' && '# Anlässe'}
                {prefixMode === 'SHIFTS' && ': Schichten'}
                {prefixMode === 'HELP' && '? Hilfe'}
              </Badge>
            )}

            <input
              ref={inputRef}
              type="text"
              value={prefixMode === 'ALL' ? query : cleanQuery}
              onChange={(e) => {
                const val = e.target.value;
                if (prefixMode === 'PEOPLE') setQuery(`@${val}`);
                else if (prefixMode === 'EVENTS') setQuery(`#${val}`);
                else if (prefixMode === 'SHIFTS') setQuery(`:${val}`);
                else if (prefixMode === 'HELP') setQuery(`?${val}`);
                else setQuery(val);
              }}
              placeholder={
                prefixMode === 'PEOPLE'
                  ? 'Person oder Helfer suchen...'
                  : prefixMode === 'EVENTS'
                    ? 'Anlass suchen...'
                    : prefixMode === 'SHIFTS'
                      ? 'Schicht oder freie Plätze suchen...'
                      : 'Befehl tippen oder nach Anlässen, Schichten (@, #, :) suchen...'
              }
              className="w-full bg-transparent text-sm font-medium text-fg placeholder:text-fg-subtle focus:outline-none sm:text-base"
            />

            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-full p-1 text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
                aria-label="Suchfeld leeren"
              >
                <X className="size-4" />
              </button>
            ) : (
              <div className="hidden items-center gap-1.5 sm:flex">
                <span className="text-2xs text-fg-subtle">Tippe</span>
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
                  ?
                </kbd>
                <span className="text-2xs text-fg-subtle">für Hilfe</span>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            SPLIT-VIEW: LISTE LINKS + DETAIL-VORSCHAU RECHTS (DESKTOP)
        ========================================================================= */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* BEFEHLSLISTE */}
          <div
            ref={activeSubActionItem ? subListRef : listRef}
            className="flex-1 overflow-y-auto px-2 py-2 sm:px-3 sm:py-3 scroll-smooth"
          >
            {activeSubActionItem ? (
              // SUB-AKTIONEN-LISTE
              filteredSubActions.length === 0 ? (
                <div className="py-12 text-center text-sm text-fg-muted">
                  Keine passende Aktion für «{subQuery}» gefunden.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredSubActions.map((sub, idx) => {
                    const isSelected = idx === selectedSubIndex;
                    return (
                      <button
                        key={sub.id}
                        data-index={idx}
                        type="button"
                        onClick={() => {
                          sub.onSelect();
                          close();
                        }}
                        onMouseEnter={() => setSelectedSubIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition',
                          isSelected
                            ? 'bg-surface-2 text-fg shadow-2xs ring-1 ring-accent/30'
                            : 'text-fg-muted hover:bg-surface-2/60 hover:text-fg'
                        )}
                      >
                        <div
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-lg transition',
                            isSelected ? 'bg-accent/15 text-accent-ink' : 'bg-surface-3 text-fg-subtle'
                          )}
                        >
                          {sub.icon || <ArrowRight className="size-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-fg">
                            <HighlightText text={sub.title} query={subQuery} />
                          </div>
                          {sub.subtitle && (
                            <div className="text-2xs text-fg-subtle">
                              <HighlightText text={sub.subtitle} query={subQuery} />
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-1.5 text-2xs font-semibold text-accent-ink">
                            <span>Ausführen</span>
                            <CornerDownLeft className="size-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              // HAUPT-BEFEHLSLISTE MIT SEKTIONEN
              items.length === 0 ? (
                <div className="py-12 text-center text-sm text-fg-muted">
                  Keine Befehle oder Ergebnisse für «{query}» gefunden.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedSections.map((group) => (
                    <div key={group.section} className="space-y-1">
                      <div className="flex items-center justify-between px-3 py-1">
                        <span className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">
                          {group.label}
                        </span>
                        {group.section === 'RECENT' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearRecentCommands();
                              setQuery(' ');
                              setTimeout(() => setQuery(''), 10);
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium text-fg-subtle hover:text-danger-ink"
                            title="Verlauf leeren"
                          >
                            <Trash2 className="size-3" /> Verlauf leeren
                          </button>
                        )}
                      </div>

                      {group.items.map((item) => {
                        const itemFlatIndex = flatIndexCounter++;
                        const isSelected = itemFlatIndex === selectedIndex;
                        const itemHasSubActions = Boolean(item.subActions && item.subActions.length > 0);

                        return (
                          <div
                            key={item.id}
                            data-index={itemFlatIndex}
                            className={cn(
                              'group flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition cursor-pointer',
                              isSelected
                                ? 'bg-surface-2 text-fg shadow-2xs ring-1 ring-accent/30'
                                : 'text-fg-muted hover:bg-surface-2/60 hover:text-fg'
                            )}
                            onClick={() => item.onSelect()}
                            onMouseEnter={() => setSelectedIndex(itemFlatIndex)}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div
                                className={cn(
                                  'flex size-8 shrink-0 items-center justify-center rounded-lg transition',
                                  isSelected ? 'bg-accent/15 text-accent-ink' : 'bg-surface-3 text-fg-subtle'
                                )}
                              >
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={cn('truncate font-medium text-fg', isSelected && 'font-semibold')}>
                                    <HighlightText text={item.title} query={cleanQuery} />
                                  </span>
                                  {item.badge && (
                                    <Badge
                                      tone={item.badgeTone || 'neutral'}
                                      className="shrink-0 text-[10px] px-1.5 py-0"
                                    >
                                      {item.badge}
                                    </Badge>
                                  )}
                                </div>
                                {item.subtitle && (
                                  <p className="truncate text-2xs text-fg-subtle">
                                    <HighlightText text={item.subtitle} query={cleanQuery} />
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Rechte Seite: Aktions-Hinweise oder Sub-Aktionen-Button */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {itemHasSubActions && (
                                <button
                                  type="button"
                                  title="Unteraktionen öffnen (Tab)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveSubActionItem(item);
                                  }}
                                  className={cn(
                                    'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold transition',
                                    isSelected
                                      ? 'bg-accent/15 text-accent-ink hover:bg-accent/25'
                                      : 'text-fg-subtle hover:bg-surface-3 hover:text-fg opacity-0 group-hover:opacity-100'
                                  )}
                                >
                                  <span>Aktionen</span>
                                  <kbd className="rounded border border-line bg-surface px-1 py-0 font-mono text-[9px]">
                                    ⇥
                                  </kbd>
                                </button>
                              )}

                              {isSelected && (
                                <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline-block">
                                  ↵
                                </kbd>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* =========================================================================
              DETAIL-VORSCHAU-PANEL (NUR DESKTOP: >= LG)
          ========================================================================= */}
          {!activeSubActionItem && currentItem && (
            <aside className="hidden lg:flex w-80 shrink-0 flex-col justify-between border-l border-line bg-surface-2/30 p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">
                    {currentItem.section}
                  </span>
                  {currentItem.badge && (
                    <Badge tone={currentItem.badgeTone || 'neutral'} size="sm">
                      {currentItem.badge}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-accent/12 text-accent-ink mb-2">
                    {currentItem.icon}
                  </div>
                  <h3 className="font-display text-base font-bold text-fg leading-snug">{currentItem.title}</h3>
                  {currentItem.subtitle && <p className="text-xs text-fg-muted">{currentItem.subtitle}</p>}
                </div>

                {/* Spezifische Detail-Inhalte je nach Typ */}
                {currentItem.preview?.type === 'SHIFT' && currentItem.preview.shift && (
                  <div className="space-y-3 rounded-xl border border-line bg-surface p-3.5 text-xs">
                    <div>
                      <div className="text-2xs font-semibold text-fg-subtle uppercase tracking-wider mb-1">
                        Besetzung
                      </div>
                      <SlotMeter
                        filled={currentItem.preview.shift.signups?.length || 0}
                        total={currentItem.preview.shift.requiredSlots}
                      />
                    </div>
                  </div>
                )}

                {currentItem.preview?.type === 'PERSON' && currentItem.preview.person && (
                  <div className="space-y-3 rounded-xl border border-line bg-surface p-3.5 text-xs">
                    <div className="flex items-center gap-3">
                      <Avatar name={currentItem.preview.person.name} size="md" />
                      <div>
                        <div className="font-semibold text-fg">{currentItem.preview.person.name}</div>
                        {currentItem.preview.person.ceviName && (
                          <div className="text-2xs text-accent-ink font-bold">
                            «{currentItem.preview.person.ceviName}»
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {currentItem.preview?.details && currentItem.preview.details.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-line bg-surface p-3.5 text-xs">
                    {currentItem.preview.details.map((d, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="text-fg-subtle">{d.label}:</span>
                        <span className="font-semibold text-fg text-right truncate max-w-[150px]">{d.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vorschau-Footer Aktionen */}
              <div className="space-y-2 border-t border-line/70 pt-3">
                <button
                  type="button"
                  onClick={() => currentItem.onSelect()}
                  className="flex w-full items-center justify-between rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-accent/90"
                >
                  <span>Ausführen</span>
                  <CornerDownLeft className="size-3.5" />
                </button>

                {hasSubActions && (
                  <button
                    type="button"
                    onClick={() => setActiveSubActionItem(currentItem)}
                    className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface-2"
                  >
                    <span>Unteraktionen ({currentItem.subActions?.length})</span>
                    <span className="font-mono text-[10px] text-accent-ink font-bold">⇥ Tab</span>
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* =========================================================================
            FOOTER-TASTATURHINWEISE (INTERAKTIV & DESKTOP/MOBILE)
        ========================================================================= */}
        <footer className="border-t border-line/70 bg-surface-2/40 px-4 py-2 text-2xs text-fg-subtle sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {activeSubActionItem ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-line bg-surface px-1 py-0 font-mono text-[10px]">↵</kbd>
                    <span>Ausführen</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-line bg-surface px-1 py-0 font-mono text-[10px]">Esc</kbd>
                    <span>Zurück</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSubActionItem(null)}
                  className="font-medium text-accent-ink hover:underline sm:hidden"
                >
                  Zurück zur Liste
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-line bg-surface px-1 py-0 font-mono text-[10px]">↵</kbd>
                    <span>Auswählen</span>
                  </span>

                  {hasSubActions && (
                    <span className="flex items-center gap-1 text-accent-ink font-medium">
                      <kbd className="rounded border border-accent/40 bg-accent/15 px-1 py-0 font-mono text-[10px] text-accent-ink">
                        ⇥ Tab
                      </kbd>
                      <span>Aktionen ({currentItem?.subActions?.length})</span>
                    </span>
                  )}

                  <span className="hidden items-center gap-1 sm:flex">
                    <kbd className="rounded border border-line bg-surface px-1 py-0 font-mono text-[10px]">Esc</kbd>
                    <span>Schliessen</span>
                  </span>
                </div>

                {hasSubActions && (
                  <button
                    type="button"
                    onClick={() => setActiveSubActionItem(currentItem)}
                    className="font-medium text-accent-ink hover:underline sm:hidden"
                  >
                    Aktionen öffnen (⇥)
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
