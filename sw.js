const CACHE = 'dsc-v8';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});
self.addEventListener('push', event => {
  let data = {};

  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || 'DiegoSportCoach';

  const options = {
    body: data.body || 'Er is een nieuwe melding.',
    data: {
      url: data.url || '/diegosportcoach-app/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(
      event.notification.data.url || '/diegosportcoach-app/'
    )
  );
});self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .catch(() => caches.match(event.request))
  );
});
