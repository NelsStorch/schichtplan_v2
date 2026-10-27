import { Building2, Globe2, Network, ShieldCheck, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { EVENT_ACCESS_TYPES, accessTypeConfig, type EventAccessType } from '@schichtplan/shared';
import { Badge, type BadgeTone } from '@schichtplan/ui';

/** Icon pro Zugangs-Typ. Neuer Typ in EVENT_ACCESS_TYPES -> hier ein Icon ergänzen. */
const ACCESS_TYPE_ICONS: Record<EventAccessType, LucideIcon> = {
  PUBLIC: Globe2,
  CEVIDB_ALL: ShieldCheck,
  DEPARTMENT: Building2,
  DEPARTMENT_CEVIDB: Building2,
  WHITELIST: Network,
  WHITELIST_CEVIDB: Network,
};

export const ACCESS_TYPE_INFO = (Object.keys(EVENT_ACCESS_TYPES) as EventAccessType[]).map((key) => ({
  key,
  ...EVENT_ACCESS_TYPES[key],
  icon: ACCESS_TYPE_ICONS[key] ?? Users,
}));

export function accessTypeIcon(type: EventAccessType): LucideIcon {
  return ACCESS_TYPE_ICONS[type] ?? Users;
}

export function AccessTypeBadge({
  type,
  leadersOnly,
  tone = 'neutral',
}: {
  type: EventAccessType;
  leadersOnly?: boolean;
  tone?: BadgeTone;
}) {
  const info = accessTypeConfig(type);
  const Icon = accessTypeIcon(type);
  return (
    <Badge tone={tone}>
      <Icon /> {info.short}
      {leadersOnly && (
        <>
          <span aria-hidden>·</span>
          <UsersRound /> Leitende
        </>
      )}
    </Badge>
  );
}

export const BANNER_PRESETS = [
  { name: 'Chilbi & Festzelt', url: '/images/banners/chilbi.svg' },
  { name: 'Sommerlager', url: '/images/banners/sola.svg' },
  { name: 'Lagerfeuer & Wald', url: '/images/banners/lagerfeuer.svg' },
  { name: 'Grill & Festwirtschaft', url: '/images/banners/grill.svg' },
  { name: 'Hütte & Berge', url: '/images/banners/huette.svg' },
  { name: 'Waldweihnacht & Winter', url: '/images/banners/weihnachten.svg' },
];
