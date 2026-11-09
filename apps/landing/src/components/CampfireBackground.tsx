'use client';

import dynamic from 'next/dynamic';

/** Reine Dekoration: erst nach dem ersten Rendern nachladen, damit sie den Seitenaufbau nicht bremst */
export const CampfireBackground = dynamic(
  () => import('./Campfire3DCanvas').then((m) => m.Campfire3DCanvas),
  { ssr: false },
);
