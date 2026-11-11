'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Share2, UserCheck } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import type { OrganizationConfig } from '@schichtplan/shared';

/** Die drei Schritte mit einer Linie, die sich beim Scrollen zeichnet (am Handy senkrecht) */
export function StepsTimeline({ org }: { org?: OrganizationConfig } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const unitTerm = org?.unitTerm ?? 'Abteilung';
  const authProvider = org?.slug === 'verein' ? 'Konto' : (org?.authProviderShort ?? 'Cevi.DB');

  const steps = [
    {
      icon: CalendarPlus,
      title: 'Anlass erfassen',
      text: 'Das OK legt Schichten an: wann, was zu tun ist und wie viele Leute es braucht. Mit einer Vorlage vom Vorjahr geht das in Minuten.',
    },
    {
      icon: Share2,
      title: 'Link teilen',
      text: `Den Link per WhatsApp, Mail oder Flyer verschicken. Ihr bestimmt, wer sich eintragen darf: alle, nur eure ${unitTerm} oder einzelne Stufen.`,
    },
    {
      icon: UserCheck,
      title: 'Alle tragen sich ein',
      text: `Helfer*innen wählen ihre Schicht selbst, auch Eltern und Ehemalige ohne ${authProvider}. Das OK sieht sofort, wo noch Lücken sind.`,
    },
  ];

  const [reached, setReached] = useState(steps.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const { top, height } = container.getBoundingClientRect();
      const viewport = window.innerHeight;
      // Beginnt, wenn die Liste ins Bild kommt, und endet, wenn sie im oberen Drittel steht
      const progress = Math.min(1, Math.max(0, (viewport * 0.85 - top) / (viewport * 0.25 + height)));
      container.style.setProperty('--progress', String(progress));
      setReached(Math.ceil(progress * steps.length));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative mt-10 [--progress:1]">
      <div
        className="absolute left-[7px] top-2 bottom-2 w-0.5 overflow-hidden rounded-full bg-line md:left-2 md:right-2 md:top-[7px] md:bottom-auto md:h-0.5 md:w-auto"
        aria-hidden="true"
      >
        <div className="absolute inset-0 origin-top bg-gradient-to-b from-accent to-amber-500 [transform:scaleY(var(--progress))] md:origin-left md:bg-gradient-to-r md:[transform:scaleX(var(--progress))]" />
      </div>

      <ol className="grid grid-cols-1 gap-6 pl-8 md:grid-cols-3 md:pl-0 md:pt-8">
        {steps.map((step, index) => (
          <li key={step.title} className="relative">
            <span
              className={`absolute -left-8 top-6 size-4 rounded-full border-2 transition-colors duration-300 md:left-0 md:-top-8 ${
                index < reached ? 'border-accent bg-accent' : 'border-line-strong bg-canvas'
              }`}
              aria-hidden="true"
            />
            <Reveal delay={index * 120} className="h-full rounded-card border border-line bg-surface/80 p-6 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-accent/12 text-accent-ink">
                  <step.icon className="size-5" />
                </span>
                <span className="font-mono text-xs font-bold text-fg-subtle">Schritt {index + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-xl font-bold text-fg">{step.title}</h3>
              <p className="mt-2 text-sm text-fg-muted leading-relaxed">{step.text}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}
