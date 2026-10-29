'use client';

const RECENT_KEY = 'schichtplan.recent_commands';
const MAX_RECENT = 6;

export function getRecentCommandIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordRecentCommand(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  // System- oder Hilfe-Commands nicht in History aufnehmen
  if (id.startsWith('help-') || id === 'clear-recent') return;
  try {
    const current = getRecentCommandIds().filter((item) => item !== id);
    const updated = [id, ...current].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearRecentCommands(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {}
}
