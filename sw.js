// DiegoSportCoach Service Worker
// Altijd de nieuwste appbestanden gebruiken + pushmeldingen

const APP_URL =
  'https://diegosportcoachleiden.github.io/diegosportcoach-app/';

self.addEventListener('install', event => {
  // Nieuwe service worker direct activeren
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Alle oude caches verwijderen
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(cacheName =>
          caches.delete(cacheName)
        )
      );

      // Meteen controle krijgen over geopende app
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // Alleen GET-verzoeken behandelen
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Supabase/CDN/etc. gewoon normaal laten lopen
  if (url.origin !== self.location.origin) {
    return;
  }

  // Voor onze eigen appbestanden:
  // altijd eerst rechtstreeks van internet halen.
  event.respondWith(
    fetch(request, {
      cache: 'no-store'
    }).catch(() => {
      // Alleen als internet niet beschikbaar is
      // eventueel bestaande browsercache proberen.
      return caches.match(request);
    })
  );
});

self.addEventListener('push', event => {
  let title = 'DiegoSportCoach';

  let body =
    'Er is een nieuwe melding van DiegoSportCoach.';

  let targetUrl = APP_URL;

  if (event.data) {
    try {
      const data = event.data.json();

      if (data && typeof data === 'object') {
        if (data.title) {
          title = String(data.title);
        }

        if (data.body) {
          body = String(data.body);
        }

        if (data.url) {
          targetUrl = String(data.url);
        }
      }
    } catch (jsonError) {
      try {
        const text = event.data.text();

        if (text) {
          body = text;
        }
      } catch (textError) {
        console.error(
          'Pushbericht kon niet worden gelezen:',
          textError
        );
      }
    }
  }

  const options = {
    body,

    icon:
      'https://diegosportcoachleiden.github.io/diegosportcoach-app/icon-192.png',

    badge:
      'https://diegosportcoachleiden.github.io/diegosportcoach-app/icon-192.png',

    data: {
      url: targetUrl
    },

    tag: 'diegosportcoach-push',

    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

self.addEventListener(
  'notificationclick',
  event => {
    event.notification.close();

    const targetUrl =
      event.notification.data?.url ||
      APP_URL;

    event.waitUntil(
      (async () => {
        const clientList =
          await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
          });

        for (const client of clientList) {
          if (
            client.url.startsWith(APP_URL) &&
            'focus' in client
          ) {
            if ('navigate' in client) {
              await client.navigate(targetUrl);
            }

            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(
            targetUrl
          );
        }
      })()
    );
  }
);
