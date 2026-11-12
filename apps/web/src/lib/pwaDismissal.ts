import { getRootDomain } from '@schichtplan/shared';

export const PWA_STORAGE_KEY = 'schichtplan.pwa_install_dismissed';
export const PWA_COOKIE_KEY = 'schichtplan_pwa_dismissed';
export const PWA_SESSION_KEY = 'schichtplan.pwa_dismissed_session';
export const PWA_DISMISS_DAYS = 14;

/**
 * Prüft, ob der Installations-Hinweis kürzlich (innert 14 Tagen) oder in der
 * aktuellen Browser-Sitzung weggedrückt wurde.
 * 
 * Sucht in:
 * 1. sessionStorage (dieser Tab / diese Sitzung)
 * 2. Cookie (domain-weit über alle Subdomains wie *.cevi-schichtplan.ch)
 * 3. localStorage (origin-spezifisch)
 */
export function isPwaPromptDismissed(now = Date.now()): boolean {
  if (typeof window === 'undefined') return true;

  // 1. SessionStorage
  try {
    if (window.sessionStorage?.getItem(PWA_SESSION_KEY) === '1') {
      return true;
    }
  } catch {}

  const maxAgeMs = PWA_DISMISS_DAYS * 24 * 60 * 60 * 1000;

  // 2. Cookie (wirkt über alle Subdomains)
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${PWA_COOKIE_KEY}=([0-9]+)`));
      if (match) {
        const ts = Number(match[1]);
        if (Number.isFinite(ts) && now - ts < maxAgeMs) {
          return true;
        }
      }
    }
  } catch {}

  // 3. LocalStorage
  try {
    const raw = window.localStorage?.getItem(PWA_STORAGE_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && now - ts < maxAgeMs) {
        return true;
      }
    }
  } catch {}

  return false;
}

/**
 * Speichert die Ausblendung für 14 Tage:
 * - im Cookie mit Domain `.rootDomain` (damit es auf allen Abteilungs-Subdomains gilt)
 * - im localStorage als Backup
 * - im sessionStorage für die aktuelle Sitzung
 */
export function dismissPwaPrompt(now = Date.now()): void {
  if (typeof window === 'undefined') return;

  // SessionStorage
  try {
    window.sessionStorage?.setItem(PWA_SESSION_KEY, '1');
  } catch {}

  // LocalStorage
  try {
    window.localStorage?.setItem(PWA_STORAGE_KEY, String(now));
  } catch {}

  // Cookie über alle Subdomains
  try {
    if (typeof document !== 'undefined') {
      const maxAgeSec = PWA_DISMISS_DAYS * 24 * 60 * 60;
      const root = getRootDomain(window.location.hostname);
      const isLocal = root === 'localhost' || root === '127.0.0.1' || root.endsWith('.localhost');
      const domainAttr = isLocal ? '' : `; domain=.${root}`;
      document.cookie = `${PWA_COOKIE_KEY}=${now}; max-age=${maxAgeSec}; path=/${domainAttr}; SameSite=Lax`;
    }
  } catch {}
}
