// Service Worker: cached die App-Shell, damit der Tracker auch offline lädt.
// KI-Aufrufe (/api/*) gehen immer ans Netz.

const CACHE = 'fitcoach-v22';


const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/config.js',
  '/js/state.js',
  '/js/theme.js',
  '/js/speech.js',
  '/js/calc.js',
  '/js/foods.js',
  '/js/onboarding.js',
  '/js/tracker.js',
  '/js/scan.js',
  '/js/progress.js',
  '/js/workout.js',
  '/js/backup.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API- und Daten-Aufrufe nie cachen
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/.netlify/')
  ) {
    return;
  }

  // Navigation: Netz zuerst (frische index.html), Cache als Offline-Fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Statische Dateien: Cache zuerst, Netz als Fallback (und nachcachen)
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
    )
  );
});
