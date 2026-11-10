'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrandLogo } from '@schichtplan/ui';
import { loginUrl } from '@/lib/api';

function RedirectToLogin() {
  const searchParams = useSearchParams();

  useEffect(() => {
    window.location.href = loginUrl(searchParams.get('return_to') || window.location.origin);
  }, [searchParams]);

  return null;
}

export default function LoginPage() {
  return (
    <div className="grain flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-campfire px-4 text-center">
      <BrandLogo size="lg" alt="" className="size-16 animate-pulse" />
      <div>
        <p className="font-display text-2xl font-bold tracking-tight text-fg">Einen Moment</p>
        <p className="mt-1 text-sm text-fg-muted">Du wirst zum Login weitergeleitet.</p>
      </div>
      <Suspense>
        <RedirectToLogin />
      </Suspense>
    </div>
  );
}
