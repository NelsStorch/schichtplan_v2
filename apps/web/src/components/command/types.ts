'use client';

import type { ReactNode } from 'react';
import type { EventDetails, MyShift } from '@/lib/types';
import type { EventDto, ShiftDto } from '@schichtplan/shared';
import type { BadgeTone } from '@schichtplan/ui';

export type CommandSection =
  | 'RECENT'     // Zuletzt verwendete Befehle & Anlässe
  | 'CONTEXT'    // Aktueller Anlass / aktuelle Ansicht
  | 'ACTIONS'    // Schnellausführung & Aktionen
  | 'EVENTS'     // Anlässe der Abteilung
  | 'SHIFTS'     // Schichten & Aufgaben
  | 'PEOPLE'     // Helfende & Kontakte
  | 'NAVIGATION' // Seiten & Bereiche
  | 'HELP'       // Tastaturkürzel & Hilfe
  | 'SYSTEM';    // Darstellung, Einstellungen & Logout

export interface CommandSubAction {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  shortcut?: string;
  keywords?: string[];
  onSelect: () => void | Promise<void>;
}

export interface CommandPreviewData {
  type: 'EVENT' | 'SHIFT' | 'PERSON' | 'ACTION';
  event?: EventDetails | EventDto | null;
  shift?: ShiftDto | null;
  person?: {
    name: string;
    ceviName?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    stufen?: string[];
  } | null;
  details?: { label: string; value: string | ReactNode }[];
}

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon: ReactNode;
  badge?: string;
  badgeTone?: BadgeTone;
  section: CommandSection;
  onSelect: () => void | Promise<void>;
  subActions?: CommandSubAction[];
  preview?: CommandPreviewData;
}

export interface CommandContextData {
  event?: EventDetails | EventDto | null;
  slug?: string | null;
  isOkArea?: boolean;
  shifts?: MyShift[];
  onOpenShiftForm?: () => void;
  onOpenAssignModal?: () => void;
  onPrintPlan?: () => void;
}
