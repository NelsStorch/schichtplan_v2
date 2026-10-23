'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, errorMessage } from '@/lib/api';
import { usePortal } from '@/lib/portal';
import type { EventDetails } from '@/lib/types';

/** Auswahl, die von «Helfende» oder «Schichten» an «Nachrichten» übergeben wird */
export type MessageDraft =
  | { target: 'PEOPLE'; userIds: string[]; label: string }
  | { target: 'SHIFTS'; shiftIds: string[]; label: string };

export interface OkPermissions {
  /** Sieht den OK-Bereich: Abteilungsleitung, Planung, OK, globale Admins */
  canManage: boolean;
  /** Anlass-Einstellungen und OK-Team: Abteilungsleitung (inkl. globale Admins) und OK-Leitung */
  canEditSettings: boolean;
  /** Anlass löschen: nur Abteilungsleitung (inkl. globale Admins), nicht die OK-Leitung */
  canDeleteEvent: boolean;
  roleLabel: string;
}

export interface OkStats {
  totalSlots: number;
  filledSlots: number;
  freeSlots: number;
  percentFilled: number;
  helperCount: number;
  openShiftCount: number;
}

interface OkState {
  slug: string;
  base: string;
  event: EventDetails | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  permissions: OkPermissions;
  stats: OkStats;
  messageDraft: MessageDraft | null;
  setMessageDraft: (draft: MessageDraft | null) => void;
}

const OkContext = createContext<OkState | null>(null);

export function computeStats(event: EventDetails | null): OkStats {
  const shifts = event?.shifts ?? [];
  const totalSlots = shifts.reduce((sum, s) => sum + s.requiredSlots, 0);
  const filledSlots = shifts.reduce((sum, s) => sum + Math.min(s.signups?.length ?? 0, s.requiredSlots), 0);
  const helpers = new Set<string>();
  for (const s of shifts) for (const su of s.signups ?? []) helpers.add(su.userId || su.guestName || su.id);
  return {
    totalSlots,
    filledSlots,
    freeSlots: Math.max(0, totalSlots - filledSlots),
    percentFilled: totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0,
    helperCount: helpers.size,
    openShiftCount: shifts.filter((s) => (s.signups?.length ?? 0) < s.requiredSlots).length,
  };
}

/** Lädt den Anlass einmal für alle Seiten des OK-Bereichs */
export function OkProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const { user, isDeptAdmin, isPlanner, loading: portalLoading } = usePortal();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<MessageDraft | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api<EventDetails>(`/api/events/${slug}`);
      setEvent(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'Anlass nicht gefunden' : errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const permissions = useMemo<OkPermissions>(() => {
    const organizer = user ? event?.organizers?.find((o) => o.userId === user.id) : undefined;
    const isGlobalAdmin = Boolean(user?.isGlobalAdmin);
    const canEditSettings = Boolean(isDeptAdmin || isGlobalAdmin || organizer?.role === 'OK_LEAD');
    const canManage = Boolean(isDeptAdmin || isPlanner || isGlobalAdmin || organizer);
    const roleLabel = organizer
      ? organizer.role === 'OK_LEAD'
        ? 'OK-Leitung'
        : 'OK-Mitglied'
      : isDeptAdmin || isGlobalAdmin
        ? 'Abteilungsleitung'
        : isPlanner
          ? 'Planung'
          : '';
    const canDeleteEvent = Boolean(isDeptAdmin || isGlobalAdmin);
    return { canManage, canEditSettings, canDeleteEvent, roleLabel };
  }, [user, event, isDeptAdmin, isPlanner]);

  const stats = useMemo(() => computeStats(event), [event]);

  return (
    <OkContext.Provider
      value={{
        slug,
        base: `/events/${slug}/ok`,
        event,
        loading: loading || portalLoading,
        error,
        reload,
        permissions,
        stats,
        messageDraft,
        setMessageDraft,
      }}
    >
      {children}
    </OkContext.Provider>
  );
}

export function useOk() {
  const ctx = useContext(OkContext);
  if (!ctx) throw new Error('useOk() braucht <OkProvider>');
  return ctx;
}

/** Für Seiten innerhalb des Layouts: dort ist der Anlass bereits geladen */
export function useOkEvent() {
  const ctx = useOk();
  if (!ctx.event) throw new Error('useOkEvent() vor dem Laden des Anlasses');
  return { ...ctx, event: ctx.event };
}
