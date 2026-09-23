// DiegoSportCoach Service Worker
// Verse appbestanden + pushmeldingen

const APP_URL =
  'https://diegosportcoachleiden.github.io/diegosportcoach-app/';

// --------------------------------------------------
// INSTALL
// --------------------------------------------------

self.addEventListener('install', () => {
  // Nieuwe service worker direct activeren
  self.skipWaiting();
});

// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Oude caches van eerdere versies verwijderen
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(cacheName =>
          caches.delete(cacheName)
        )
      );

      // Meteen controle over geopende app krijgen
      await self.clients.claim();
    })()
  );
});

// --------------------------------------------------
// FETCH
// --------------------------------------------------

self.addEventListener('fetch', event => {
  const request = event.request;

  // Alleen GET-verzoeken behandelen
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Alleen bestanden van onze eigen app behandelen
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request, {
      cache: 'no-store'
    }).catch(() => {
      // Alleen als internet niet beschikbaar is:
      // kijken of de browser zelf nog iets beschikbaar heeft.
      return caches.match(request);
    })
  );
});

// --------------------------------------------------
// PUSHMELDINGEN
// --------------------------------------------------

self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: 'DiegoSportCoach',
      body: event.data ? event.data.text() : ''
    };
  }

  const title =
    data.title || 'DiegoSportCoach';

  const options = {
    body:
      data.body ||
      'Er is een nieuwe melding van DiegoSportCoach.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: {
      url: data.url || APP_URL
    }
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

// --------------------------------------------------
// KLIK OP PUSHMELDING
// --------------------------------------------------

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url || APP_URL;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // App staat al open
      for (const client of clientList) {
        if ('focus' in client) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }

      // App staat nog niet open
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
