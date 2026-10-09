'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function RedirectContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const returnTo = searchParams.get('return_to') || window.location.origin;

    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      window.location.href = `http://localhost:3002/?return_to=${encodeURIComponent(returnTo)}`;
    } else {
      const parts = hostname.split('.');
      const rootDomain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
      window.location.href = `${protocol}//login.${rootDomain}/?return_to=${encodeURIComponent(returnTo)}`;
    }
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
