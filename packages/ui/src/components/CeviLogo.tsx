'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';

const FALLBACK = '/images/cevi-logo.svg';
const sizes = { sm: 'size-8', md: 'size-12', lg: 'size-16', xl: 'size-20' };

/** Abteilungs-/Event-Logo mit Fallback aufs offizielle Cevi-Logo (auch bei kaputter URL). */
export function CeviLogo({
  className,
  size = 'md',
  logoUrl,
  alt = 'Cevi Logo',
}: {
  className?: string;
  size?: keyof typeof sizes;
  logoUrl?: string | null;
  alt?: string;
}) {
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
    <span className={cn('relative inline-flex shrink-0 select-none items-center justify-center', className ?? sizes[size])}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onError={() => src !== FALLBACK && setSrc(FALLBACK)}
        className="size-full object-contain"
      />
    </span>
  );
}
