const APP_URL = '/diegosportcoach-app/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('push', event => {
  let data = {};

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (error) {
    console.error('Pushbericht kon niet worden gelezen:', error);
  }

  const title =
    data.title || 'DiegoSportCoach';

  const options = {
    body:
      data.body || 'Er is een nieuwe melding.',
    data: {
      url:
        data.url || APP_URL
    }
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url || APP_URL;

  event.waitUntil(
    (async () => {
      const clientList =
        await clients.matchAll({
          type: 'window',
          includeUncontrolled: true
        });

      for (const client of clientList) {
        if (
          'focus' in client &&
          client.url.includes('/diegosportcoach-app/')
        ) {
          await client.focus();

          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }

          return;
        }
      }

      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request, {
      cache: 'no-store'
    }).catch(() => caches.match(event.request))
  );
});
