// DiegoSportCoach Service Worker
// Verse appbestanden + pushmeldingen

const APP_URL =
  'https://diegosportcoachleiden.github.io/diegosportcoach-app/';

// --------------------------------------------------
// INSTALL
// --------------------------------------------------

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(cacheName =>
          caches.delete(cacheName)
        )
      );

      await self.clients.claim();
    })()
  );
});

// --------------------------------------------------
// FETCH
// --------------------------------------------------

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request, {
      cache: 'no-store'
    }).catch(() => {
      return caches.match(request);
    })
  );
});

// --------------------------------------------------
// PUSHMELDINGEN
// --------------------------------------------------

self.addEventListener('push', event => {
  let title = 'DiegoSportCoach';
  let body =
    'Er is een nieuwe melding van DiegoSportCoach.';
  let targetUrl = APP_URL;

  if (event.data) {
    try {
      const data = event.data.json();

      if (
        data &&
        typeof data === 'object'
      ) {
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
    body: body,

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

// --------------------------------------------------
// KLIK OP PUSHMELDING
// --------------------------------------------------

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
