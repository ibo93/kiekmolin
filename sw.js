// Service Worker: macht "The Chef" installierbar & offline-fähig + Web Push.
var CACHE = 'thechef-v1';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE)
            .then(function(c){ return c.addAll(SHELL); })
            .catch(function(){})
            .then(function(){ return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys){
            return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
        }).then(function(){ return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function(event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);

    // KI-/Voice-/Scan-Functions nie cachen — immer live.
    if (url.pathname.indexOf('/.netlify/functions/') > -1) {
        event.respondWith(fetch(req).catch(function(){
            return new Response('{"error":"offline"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
        }));
        return;
    }

    // App-Shell: Cache-First, im Hintergrund aktualisieren.
    event.respondWith(
        caches.match(req).then(function(cached){
            var live = fetch(req).then(function(res){
                if (res && res.status === 200 && url.origin === self.location.origin) {
                    var copy = res.clone();
                    caches.open(CACHE).then(function(c){ c.put(req, copy); });
                }
                return res;
            }).catch(function(){ return cached; });
            return cached || live;
        })
    );
});

self.addEventListener('push', function(event) {
    var data = {};
    try {
        if (event.data) data = event.data.json();
    } catch (e) {
        try { data = { title: 'Kiek mol in', body: event.data ? event.data.text() : '' }; }
        catch (e2) { data = {}; }
    }

    var title = data.title || 'Kiek mol in';
    var options = {
        body: data.body || '',
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        tag: data.tag || 'kiekmolin-' + Date.now(),
        renotify: true,
        requireInteraction: data.requireInteraction === true,
        vibrate: data.vibrate || [200, 100, 200, 100, 200],
        data: { url: data.url || '/', type: data.type || 'general', orderId: data.orderId || null },
        actions: data.actions || []
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    var targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientsArr) {
            for (var i = 0; i < clientsArr.length; i++) {
                var c = clientsArr[i];
                try {
                    var u = new URL(c.url);
                    if (u.origin === self.location.origin) {
                        if ('focus' in c) {
                            if ('navigate' in c && targetUrl !== '/') {
                                return c.navigate(targetUrl).then(function() { return c.focus(); });
                            }
                            return c.focus();
                        }
                    }
                } catch (e) {}
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
