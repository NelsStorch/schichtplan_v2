'use client';

import type { ReactNode } from 'react';
import type { EventDetails, MyShift } from '@/lib/types';
import type { EventDto } from '@schichtplan/shared';
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
  closeOnSelect?: boolean;
  onSelect: () => void | Promise<void>;
}

export interface CommandQuickAction {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  onClick: () => void | Promise<void>;
}

export interface CommandPreviewShiftSignup {
  id: string;
  displayName: string;
  userId?: string | null;
  attendance?: 'PRESENT' | 'EXCUSED' | 'NO_SHOW' | null;
  isSelf?: boolean;
}

export interface CommandPreviewShift {
  id: string;
  title: string | null;
  startTime: string;
  endTime: string;
  requiredSlots: number;
  category?: string | null;
  description?: string | null;
  signups?: CommandPreviewShiftSignup[];
}

export interface CommandPreviewData {
  type: 'EVENT' | 'SHIFT' | 'PERSON' | 'ACTION';
  event?: EventDetails | EventDto | null;
  shift?: CommandPreviewShift | null;
  person?: {
    id?: string;
    name: string;
    ceviName?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    stufen?: string[];
    shifts?: {
      id: string;
      title: string;
      time: string;
      category?: string | null;
      attendance?: 'PRESENT' | 'EXCUSED' | 'NO_SHOW' | null;
      signupId?: string;
    }[];
  } | null;
  eventStats?: {
    totalSlots: number;
    filledSlots: number;
    freeSlots: number;
    totalShifts: number;
    shiftsWithGaps: number;
    helpersCount: number;
  };
  details?: { label: string; value: string | ReactNode }[];
  quickActions?: CommandQuickAction[];
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
  closeOnSelect?: boolean;
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
  onSelectShift?: (shiftId: string) => void;
  onPrintPlan?: () => void;
  onReloadEvent?: () => void | Promise<void>;
}
