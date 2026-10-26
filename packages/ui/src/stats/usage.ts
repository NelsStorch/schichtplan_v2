/**
 * Anonyme Nutzungsmeldungen aus dem Browser (Kennzahlen: packages/shared/src/stats.ts). Gesammelt
 * im Speicher und gebündelt an /api/stats/ui geschickt: ohne Cookie, ohne Kennung, ohne URL.
 * Wer im Browser «nicht verfolgen» (Global Privacy Control oder Do Not Track) eingestellt hat,
 * schickt gar nichts. Offline bleibt die Warteschlange im Speicher, bis wieder Netz da ist.
 */
import { STATS_UI_MAX_EVENTS, type UiMetricKey, type UsageMetricDim } from '@schichtplan/shared';

const ENDPOINT = '/api/stats/ui';
const SEND_DELAY_MS = 5_000;
const MAX_QUEUE = 100;

type QueuedEvent = { name: UiMetricKey; dim?: string };

const queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

/** Browser will nicht verfolgt werden (GPC oder DNT) */
export function usageOptedOut(): boolean {
  try {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
    return (
      nav.globalPrivacyControl === true ||
      nav.doNotTrack === '1' ||
      nav.msDoNotTrack === '1' ||
      (window as Window & { doNotTrack?: string }).doNotTrack === '1'
    );
  } catch {
    return true;
  }
}

function send() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0 || !navigator.onLine) return;
  while (queue.length > 0) {
    const events = queue.splice(0, STATS_UI_MAX_EVENTS);
    // keepalive: kommt auch beim Schliessen des Tabs noch an. credentials: omit, es geht kein Cookie mit.
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => undefined);
  }
}

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') send();
  });
  window.addEventListener('online', send);
}

/** Eine Nutzung melden, z. B. `trackUi('UI_PDF', 'plan_print')` */
export function trackUi<K extends UiMetricKey>(name: K, ...dim: UsageMetricDim<K> extends never ? [] : [UsageMetricDim<K>]): void {
  if (typeof window === 'undefined' || usageOptedOut()) return;
  listen();
  if (queue.length >= MAX_QUEUE) return;
  queue.push(dim.length ? { name, dim: dim[0] } : { name });
  if (queue.length >= STATS_UI_MAX_EVENTS) send();
  else if (!timer) timer = setTimeout(send, SEND_DELAY_MS);
}
