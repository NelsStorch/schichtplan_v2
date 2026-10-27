// Cevi Schichtplan Web Push Service Worker (Landingpage / Profil)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Cevi Schichtplan',
    body: 'Du hast eine neue Benachrichtigung.',
    url: '/profil',
    tag: 'cevi-schichtplan',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/images/cevi-logo.png',
    badge: payload.badge || '/images/cevi-logo.png',
    tag: payload.tag || 'cevi-schichtplan',
    renotify: true,
    data: { url: payload.url || '/profil' },
  };

  event.waitUntil(
    self.registration
      .showNotification(payload.title, options)
      .catch(() => self.registration.showNotification(payload.title, { body: payload.body }))
      .then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
          for (const client of windowClients) {
            client.postMessage({ type: 'CEVI_PUSH_SHOWN', tag: options.tag, title: payload.title });
          }
        })
      )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/profil';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
