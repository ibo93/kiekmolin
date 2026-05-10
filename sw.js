// Falls deployed sw.js andere Logik hat, push-event handler unten reinmergen, nicht ersetzen.
// Minimaler Service Worker fuer Web Push (kein eigenes Caching, damit nichts mit
// existierender Netlify-sw.js kollidiert).

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
    // Browser-Standard-Verhalten — nichts abfangen
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
