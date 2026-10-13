import { Lock, ShieldCheck, Users, Zap, type LucideIcon } from 'lucide-react';
import type { SignupMode } from '@schichtplan/shared';
import { Badge, type BadgeTone } from '@schichtplan/ui';

export const SIGNUP_MODE_INFO: Record<SignupMode, { label: string; short: string; description: string; icon: LucideIcon }> = {
  NAME_ONLY: {
    label: 'Chilbi-Modus',
    short: 'Nur Cevi-Name',
    description: 'Eintragen nur mit Cevi-Name, ohne Passwort. Ideal für Chilbi und grosse Helfer-Anlässe.',
    icon: Zap,
  },
  OPEN: {
    label: 'Offen für alle',
    short: 'Offen',
    description: 'Helfer:innen tragen sich mit Konto oder einfach mit ihrem Cevi-Namen ein.',
    icon: Users,
  },
  LOGIN_REQUIRED: {
    label: 'Login nötig',
    short: 'Mit Konto',
    description: 'Eintragen nur mit Konto (Cevi.DB, E-Mail oder Cevi-Name-Profil).',
    icon: Lock,
  },
  CEVIDB_ONLY: {
    label: 'Nur Cevi.DB',
    short: 'Cevi.DB',
    description: 'Nur verifizierte Cevi.DB-Konten. Für interne Lager und Kurse.',
    icon: ShieldCheck,
  },
};

export function SignupModeBadge({ mode, tone = 'neutral' }: { mode: SignupMode; tone?: BadgeTone }) {
  const info = SIGNUP_MODE_INFO[mode] ?? SIGNUP_MODE_INFO.OPEN;
  const Icon = info.icon;
  return (
    <Badge tone={tone}>
      <Icon /> {info.label}
    </Badge>
  );
}

export const BANNER_PRESETS = [
  { name: 'Chilbi & Festzelt', url: '/images/banners/chilbi.svg' },
  { name: 'Sommerlager', url: '/images/banners/sola.svg' },
  { name: 'Lagerfeuer & Wald', url: '/images/banners/lagerfeuer.svg' },
  { name: 'Grill & Festwirtschaft', url: '/images/banners/grill.svg' },
  { name: 'Hütte & Berge', url: '/images/banners/huette.svg' },
];
