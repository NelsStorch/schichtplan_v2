'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

const FALLBACK = '/images/cevi-logo.svg';

const sizeClasses: Record<string, string> = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
};

/** Abteilungs-/Event-Logo mit Fallback aufs offizielle Cevi-Logo (auch bei kaputter URL). */
export function CeviLogo({
  className,
  size = 'md',
  logoUrl,
  alt = 'Cevi Logo',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  logoUrl?: string | null;
  alt?: string;
  rounded?: string;
}) {
  const sizeClass = className || sizeClasses[size] || 'w-12 h-12';
  const ref = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState(logoUrl || FALLBACK);

  useEffect(() => {
    setSrc(logoUrl || FALLBACK);
  }, [logoUrl]);

  // Ein Ladefehler vor der Hydration löst onError nie aus: deshalb nach dem Mount nachprüfen.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0 && src !== FALLBACK) setSrc(FALLBACK);
  }, [src]);

  return (
    <div className={`${sizeClass} relative flex items-center justify-center shrink-0 select-none overflow-hidden`}>
      <img
        ref={ref}
        src={src}
        alt={alt}
        onError={() => src !== FALLBACK && setSrc(FALLBACK)}
        className="w-full h-full object-contain drop-shadow-md"
      />
    </div>
  );
}

/** onError-Handler für einfache <img>-Logos: wechselt einmalig aufs Cevi-Logo. */
export function fallbackToCeviLogo(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (!img.src.endsWith(FALLBACK)) img.src = FALLBACK;
}
