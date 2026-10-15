// The Chef – Service Worker. Wird beim Build gestempelt (werkzeug/sw-plugin.ts):
// VERSION ändert sich mit JEDER Änderung an einer App-Datei. Nichts von Hand hochzählen.
const VERSION = '__VERSION__';
const CACHE = 'thechef-' + VERSION;
const APP = __DATEIEN__;
const SPRACHEN = ['/sprachen/de.json', '/sprachen/tr.json', '/sprachen/ku.json', '/sprachen/ar.json', '/sprachen/en.json', '/sprachen/ckb.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...APP, ...SPRACHEN])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => n.startsWith('thechef-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase & Co. nie cachen
  // Seite selbst: Netz zuerst (damit ein Deploy sofort ankommt), offline aus dem Cache.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
    return;
  }
  // Sprachdateien: sofort aus dem Cache, im Hintergrund aktualisieren (Korrekturen kommen an).
  if (url.pathname.startsWith('/sprachen/')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const alt = await c.match(e.request);
      const neu = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => alt);
      return alt || neu;
    }));
    return;
  }
  // Gebaute Dateien haben einen Hash im Namen: Cache zuerst.
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

// ─────────────────────────────── Push
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { titel: 'The Chef', text: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titel || 'The Chef', {
    body: d.text || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    data: { ziel: d.ziel || '#/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ziel = (e.notification.data && e.notification.data.ziel) || '#/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
    for (const c of liste) { if ('focus' in c) { c.navigate('/' + ziel); return c.focus(); } }
    return self.clients.openWindow('/' + ziel);
  }));
});
