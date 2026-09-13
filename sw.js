// Service worker: cache-first app shell so the snail can be looked after
// offline. Cache names are prefixed per game: everything on snails.se shares
// one origin.
const VERSION = 'snailstory-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/life.js',
  './js/diary.js',
  './js/view.js',
  './js/fmt.js',
  './js/i18n.js',
  './js/config.js',
  './js/supa.js',
  './js/push.js',
  './js/game/snails.js',
  './js/game/cosmetics.js',
  './js/game/themes.js',
  './js/game/audio.js',
  './js/game/rng.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('snailstory-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ---------- Web Push ----------
// The reminders the game scheduled with the server: hatching, the birthdays,
// the day it sealed itself in, and the end. One tag per kind, so a birthday
// never buries a 'it has sealed up'.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Snail Story', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || 'snailstory',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

// Tapping it should bring the terrarium forward, not open a second tab.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes('/snailstory/') && 'focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
