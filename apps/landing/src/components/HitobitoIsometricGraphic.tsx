import { ShieldCheck, UserCheck } from 'lucide-react';
import type { OrganizationConfig } from '@schichtplan/shared';

export function HitobitoIsometricGraphic({
  className = '',
  org,
}: {
  className?: string;
  org?: OrganizationConfig;
}) {
  const authProvider = org?.authProviderName ?? 'Cevi.DB (Hitobito)';
  const unitTerm = org?.unitTerm ?? 'Abteilung';
  const nicknameTerm = org?.nicknameTerm ?? 'Cevi-Name';

  return (
    <div className={`relative flex flex-col gap-3 select-none w-full max-w-md mx-auto py-2 ${className}`}>
      {/* Option 1: Verbands-/Hitobito Login */}
      <div className="rounded-xl border border-line bg-surface/90 p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-3 transition-all hover:border-line-strong">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-lg bg-accent/15 border border-accent/20 flex items-center justify-center shrink-0 text-accent font-bold">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-fg">{authProvider}</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                Für Leitende
              </span>
            </div>
            <p className="text-2xs text-fg-subtle truncate mt-0.5">
              Name, {unitTerm} &amp; Leitungsrolle automatisch verknüpft
            </p>
          </div>
        </div>
        <div className="shrink-0 hidden xs:block sm:block">
          <span className="text-[11px] font-mono text-fg-subtle bg-surface-2 px-2 py-1 rounded-md border border-line">
            1 Klick
          </span>
        </div>
      </div>

      {/* Option 2: Schnellanmeldung ohne Passwort */}
      <div className="rounded-xl border border-line bg-surface/90 p-3.5 sm:p-4 shadow-sm flex items-center justify-between gap-3 transition-all hover:border-line-strong">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-500 font-bold">
            <UserCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs sm:text-sm text-fg">{nicknameTerm} &amp; Geburtsdatum</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                Für Helfer &amp; Eltern
              </span>
            </div>
            <p className="text-2xs text-fg-subtle truncate mt-0.5">
              Kein Passwort, keine App, in 10 Sekunden eingetragen
            </p>
          </div>
        </div>
        <div className="shrink-0 hidden xs:block sm:block">
          <span className="text-[11px] font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
            Ohne Konto
          </span>
        </div>
      </div>
    </div>
  );
}

export const CeviDbIsometricGraphic = HitobitoIsometricGraphic;
export const AuthIsometricGraphic = HitobitoIsometricGraphic;

