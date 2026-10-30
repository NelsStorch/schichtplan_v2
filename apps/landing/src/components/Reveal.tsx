'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Phase = 'static' | 'hidden' | 'visible';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Verzögerung in ms, greift nur ab Tablet: Am Handy steht jedes Element einzeln im Bild */
  delay?: number;
}

/** Blendet einen Block beim ersten Erscheinen im Bild ein */
export function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Startet sichtbar: Ohne JavaScript bleibt der Inhalt lesbar
  const [phase, setPhase] = useState<Phase>('static');

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Was beim Laden schon im Bild oder darüber liegt, bleibt sichtbar
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    setPhase('hidden');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPhase('visible');
        observer.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const phaseClass = {
    static: '',
    hidden: 'opacity-0 print:opacity-100',
    visible: 'animate-fade-up md:[animation-delay:var(--reveal-delay)]',
  }[phase];

  return (
    <div
      ref={ref}
      className={`${className} ${phaseClass}`}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
