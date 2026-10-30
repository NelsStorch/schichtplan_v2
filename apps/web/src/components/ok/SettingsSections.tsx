'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@schichtplan/ui';

/** Ab dieser Höhe im Fenster gilt ein Abschnitt als aktuell (unterhalb der klebenden Leisten) */
const SPY_LINE = 170;
/** So lange zählt nach einem Klick der gewählte Abschnitt, auch wenn er oben nicht ankommt */
const CLICK_HOLD_MS = 400;
/** So lange bleibt ein Direktlink am Ziel, wenn weiter oben noch Inhalte nachladen */
const FOLLOW_MS = 1500;

interface SectionsState {
  active: string;
  isOpen: (id: string) => boolean;
  isCollapsible: (id: string) => boolean;
  setOpen: (id: string, open: boolean) => void;
  jumpTo: (id: string) => void;
}

const SectionsContext = createContext<SectionsState | null>(null);

const hashId = () => decodeURIComponent(window.location.hash.slice(1));

/** Sprungleiste und Abschnitte einer langen Seite: aktueller Abschnitt, Ein- und Ausklappen, Direktlinks */
export function SectionsProvider({
  sections,
  collapsed,
  children,
}: {
  sections: readonly string[];
  /** Beim Öffnen der Seite eingeklappt, ausser ein Direktlink zeigt darauf */
  collapsed: readonly string[];
  children: ReactNode;
}) {
  const [closed, setClosed] = useState(() => new Set(collapsed.filter((id) => id !== hashId())));
  const [active, setActive] = useState(sections[0]);
  const heldUntil = useRef(0);

  const setOpen = useCallback((id: string, open: boolean) => {
    setClosed((prev) => {
      if (prev.has(id) !== open) return prev;
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const jumpTo = useCallback(
    (id: string) => {
      // Vor dem Sprung des Browsers aufklappen, sonst stimmt die Zielposition nicht
      flushSync(() => setOpen(id, true));
      heldUntil.current = performance.now() + CLICK_HOLD_MS;
      setActive(id);
    },
    [setOpen]
  );

  // Vor- und Zurück im Browser kann auf einen eingeklappten Abschnitt zeigen
  useEffect(() => {
    const onHashChange = () => setOpen(hashId(), true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setOpen]);

  // Direktlink: Beim Aufruf gibt es das Ziel noch nicht, und weiter oben laden Inhalte nach
  useEffect(() => {
    const target = document.getElementById(hashId());
    if (!target) return;
    const follow = () => target.scrollIntoView();
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(document.body);
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.removeEventListener(type, stop);
    };
    const timer = window.setTimeout(stop, FOLLOW_MS);
    // Wer selbst scrollt, hat Vorrang
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.addEventListener(type, stop, { passive: true });
    return stop;
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (performance.now() < heldUntil.current) return;
      const root = document.documentElement;
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) {
        setActive(sections[sections.length - 1]);
        return;
      }
      const passed = sections.filter((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= SPY_LINE);
      setActive(passed[passed.length - 1] ?? sections[0]);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sections]);

  const value = useMemo<SectionsState>(
    () => ({
      active,
      isOpen: (id) => !closed.has(id),
      isCollapsible: (id) => collapsed.includes(id),
      setOpen,
      jumpTo,
    }),
    [active, closed, collapsed, setOpen, jumpTo]
  );

  return <SectionsContext.Provider value={value}>{children}</SectionsContext.Provider>;
}

/** Sprungleiste: bleibt am PC beim Scrollen sichtbar und zeigt den aktuellen Abschnitt */
export function SectionNav({ sections }: { sections: readonly (readonly [id: string, label: string])[] }) {
  const ctx = useContext(SectionsContext);
  const nav = useRef<HTMLElement>(null);
  const active = ctx?.active;

  useEffect(() => {
    const box = nav.current;
    const chip = box?.querySelector<HTMLElement>('[aria-current]');
    if (!box || !chip) return;
    const left = chip.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollLeft = left - (box.clientWidth - chip.offsetWidth) / 2;
  }, [active]);

  return (
    <nav
      ref={nav}
      data-sticky-bars
      aria-label="Abschnitte"
      className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0 lg:sticky lg:top-16 lg:z-10 lg:-mx-2 lg:flex-nowrap lg:border-b lg:border-line/70 lg:bg-canvas/85 lg:px-2 lg:py-2 lg:backdrop-blur-xl lg:backdrop-saturate-150"
    >
      {sections.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          aria-current={active === id ? 'true' : undefined}
          onClick={() => ctx?.jumpTo(id)}
          className={cn(
            'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition lg:py-1',
            active === id
              ? 'border-accent bg-accent/12 text-accent-ink'
              : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg'
          )}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

/** Ausserhalb der Seite mit Sprungleiste (z. B. im Dialog) ist nichts einklappbar */
export function useSection(id: string) {
  const ctx = useContext(SectionsContext);
  return {
    open: ctx?.isOpen(id) ?? true,
    collapsible: ctx?.isCollapsible(id) ?? false,
    setOpen: (open: boolean) => ctx?.setOpen(id, open),
  };
}

/** Eingeklappt bleibt der Inhalt für die Browsersuche (Ctrl+F) auffindbar und klappt beim Treffer auf */
export function SectionBody({
  id,
  open,
  onFound,
  children,
}: {
  id: string;
  open: boolean;
  onFound: () => void;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const found = useRef(onFound);
  found.current = onFound;

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    if (open) {
      el.removeAttribute('hidden');
      return;
    }
    el.setAttribute('hidden', 'until-found');
    const onBeforeMatch = () => found.current();
    el.addEventListener('beforematch', onBeforeMatch);
    return () => el.removeEventListener('beforematch', onBeforeMatch);
  }, [open]);

  return (
    <div ref={body} id={id} className={cn('space-y-5', open && 'mt-5')}>
      {children}
    </div>
  );
}
