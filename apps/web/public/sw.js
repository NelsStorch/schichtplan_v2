// Cevi Schichtplan PWA Service Worker
// Offline-Fähigkeit für Meine Schichten, Schichten-Übersicht und Check-in QR-Code (rein Lesezugriff)

const CACHE_NAME = 'schichtplan-offline-v1';

const STATIC_PRECACHE = [
  '/',
  '/meine-schichten',
  '/manifest.json',
  '/favicon.ico',
  '/images/cevi-logo.svg',
  '/images/cevi-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Whitelist für Read-Only API Endpunkte, die offline verfügbar sein sollen
const READ_ONLY_API_PATTERNS = [
  /^\/api\/shifts\/my/,
  /^\/api\/calendar\/token/,
  /^\/api\/events/,
  /^\/api\/departments/,
  /^\/api\/auth\/me/,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_PRECACHE).catch((err) => {
          console.warn('[SW] Precache failed for some assets:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // STRENG: Nur GET-Anfragen cachen. Keinerlei Mutationen (POST, PUT, DELETE, PATCH).
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // Nur Anfragen an denselben Ursprung cachen
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. Statische Assets (Next.js Bundles, Fonts, Icons, Bilder) -> Cache First mit Background-Update
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico'
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 2. Read-Only API Endpunkte & Check-in QR-Codes -> Network First mit Fallback auf Cache
  const isReadApi = READ_ONLY_API_PATTERNS.some((pattern) => pattern.test(url.pathname));
  if (isReadApi) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) {
              // Header anhängen, damit der Client weiss, dass Daten aus dem Offline-Cache stammen
              const headers = new Headers(cached.headers);
              headers.set('X-From-Cache', '1');
              return new Response(cached.body, {
                status: cached.status,
                statusText: cached.statusText,
                headers,
              });
            }
            return new Response(
              JSON.stringify({ error: 'Offline - keine gecachten Daten verfügbar', offline: true }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 3. Seiten-Navigation & Next.js RSC-Payloads -> Network First mit Fallback auf Cache
  const isNavigate = req.mode === 'navigate';
  const isRsc = url.searchParams.has('_rsc');

  if (isNavigate || isRsc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            // Wenn Navigation fehlschlägt, auf gecachte Meine-Schichten oder Startseite zurückfallen
            if (isNavigate) {
              return caches.match('/meine-schichten').then((fallback) => {
                if (fallback) return fallback;
                return caches.match('/');
              });
            }
            return new Response('Offline', { status: 503 });
          });
        })
    );
  }
});
