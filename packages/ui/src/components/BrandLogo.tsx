'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';
import { ORGANIZATIONS, getOrganization } from '@schichtplan/shared';
import { useOrganizationSlug } from './OrganizationContext';

const FALLBACK = '/images/cevi-logo.svg';
const sizes = { sm: 'size-8', md: 'size-12', lg: 'size-16', xl: 'size-20' };

function resolveDefaultLogo(): string {
  if (typeof window !== 'undefined') {
    return getOrganization(window.location.host).logoUrl;
  }
  return FALLBACK;
}

/** Abteilungs-/Event-Logo mit Fallback aufs Verbands-Logo (Pfadi, Jubla, Verein, Cevi). */
export function BrandLogo({
  className,
  size = 'md',
  logoUrl,
  alt = 'Logo',
}: {
  className?: string;
  size?: keyof typeof sizes;
  logoUrl?: string | null;
  alt?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  // Mit OrganizationProvider kennt schon der Server das Verbands-Logo (kein Umschalten nach der Hydration)
  const orgSlug = useOrganizationSlug();
  const initialFallback = orgSlug ? ORGANIZATIONS[orgSlug].logoUrl : FALLBACK;
  const [fallback, setFallback] = useState(initialFallback);
  const [src, setSrc] = useState(logoUrl || initialFallback);

  useEffect(() => {
    const defaultLogo = orgSlug ? ORGANIZATIONS[orgSlug].logoUrl : resolveDefaultLogo();
    setFallback(defaultLogo);
    setSrc(logoUrl || defaultLogo);
  }, [logoUrl, orgSlug]);

  // Ein Ladefehler vor der Hydration löst onError nie aus: deshalb nach dem Mount nachprüfen.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0 && src !== fallback) setSrc(fallback);
  }, [src, fallback]);

  return (
    <span className={cn('relative inline-flex shrink-0 select-none items-center justify-center', className ?? sizes[size])}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onError={() => src !== fallback && setSrc(fallback)}
        className="size-full object-contain"
      />
    </span>
  );
}

export const CeviLogo = BrandLogo;
