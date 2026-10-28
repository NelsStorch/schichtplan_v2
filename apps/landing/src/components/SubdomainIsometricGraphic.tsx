import React from 'react';
import { Lock, Globe, ExternalLink, Calendar, Users } from 'lucide-react';
import { CeviLogo } from './CeviLogo';

export function SubdomainIsometricGraphic({ className = '' }: { className?: string }) {
  return (
    <div className={`relative select-none w-full max-w-md mx-auto py-2 ${className}`}>
      {/* Mockup Browser Window */}
      <div className="rounded-xl border border-line bg-surface/90 shadow-sm overflow-hidden transition-all hover:border-line-strong">
        {/* Browser Top Bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-surface-2/70 text-2xs text-fg-subtle">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="size-2.5 rounded-full bg-red-500/70" />
            <span className="size-2.5 rounded-full bg-amber-500/70" />
            <span className="size-2.5 rounded-full bg-emerald-500/70" />
          </div>
          {/* Address Bar */}
          <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-line text-2xs font-mono text-fg truncate">
            <Lock className="size-2.5 text-emerald-500 shrink-0" />
            <span className="text-accent font-semibold shrink-0">illnau</span>
            <span className="text-fg-subtle truncate">.cevi-schichtplan.ch</span>
          </div>
        </div>

        {/* Browser Content Preview */}
        <div className="p-3.5 sm:p-4 bg-surface space-y-3">
          {/* Department Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-line/60">
            <div className="flex items-center gap-2">
              <CeviLogo className="size-6 shrink-0" />
              <div>
                <div className="font-display text-xs font-bold text-fg">Cevi Illnau-Effretikon</div>
                <div className="text-[10px] text-fg-subtle">Offizielle Schichtplanung</div>
              </div>
            </div>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-bold text-accent-ink border border-accent/20">
              Aktiv
            </span>
          </div>

          {/* Mini Event Preview Cards */}
          <div className="grid grid-cols-2 gap-2 text-2xs">
            <div className="rounded-lg border border-line bg-surface-2/60 p-2">
              <div className="font-semibold text-fg truncate">Chilbi 2026</div>
              <div className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1">
                <Calendar className="size-2.5" />
                <span>28 Schichten</span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface-2/60 p-2">
              <div className="font-semibold text-fg truncate">Sommerlager</div>
              <div className="text-[10px] text-fg-subtle mt-0.5 flex items-center gap-1">
                <Users className="size-2.5" />
                <span>Küche &amp; Aufbau</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
