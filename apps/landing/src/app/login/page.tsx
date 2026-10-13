'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getLoginUrl } from '@schichtplan/shared';

function RedirectContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const returnTo = searchParams.get('return_to') || window.location.origin;
    window.location.href = getLoginUrl(returnTo);
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
      <div className="animate-pulse flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
        <span>Weiterleitung zum zentralen Login...</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
          Laden...
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}
