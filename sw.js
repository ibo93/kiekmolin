// Kiek mol in — Service Worker: Web Push + Caching der App-Huelle.
//
// WARUM CACHING: index.html sind rund 611 KB uebertragene Daten. Ohne Cache
// laedt jeder Besuch sie komplett neu -- am Tisch, im ostfriesischen Funkloch,
// mit dem QR-Code in der Hand sind das mehrere Sekunden weisser Bildschirm.
//
// STRATEGIE fuer die App-Huelle: erst aus dem Cache anzeigen, parallel im
// Hintergrund die neue Fassung holen ("stale-while-revalidate"). Der zweite
// Besuch ist damit praktisch sofort da.
//
// DER HAKEN, ehrlich benannt: der Gast sieht beim ersten Aufruf nach einem
// Deploy noch die vorherige Fassung. Genau deshalb hat netlify.toml fuer
// index.html "no-cache" gesetzt. Statt den Cache wegzulassen und dauerhaft
// langsam zu sein, meldet der Worker eine neue Fassung an die App
// (Nachricht 'neue-version'), die daraufhin einen dezenten Hinweis zeigt --
// niemand wird mitten in einer Bestellung zwangsweise neu geladen.
//
// NICHT gecacht wird alles unter /rest/v1/ und /.netlify/ -- Bestellungen,
// Reservierungen und KI-Antworten muessen immer frisch sein. Ein gecachter
// Bestellstatus waere schlimmer als eine Sekunde Wartezeit.

var CACHE = 'kmi-shell-v1';
var SHELL = '/';
// Nur Dateien, die es sicher gibt. Eine fehlende Datei laesst sonst die
// gesamte Installation scheitern und der Worker uebernimmt nie.
var STATIC = ['/kiek-logo.png', '/icon-192.png'];
// Notausgang, per /?nosw=1 umlegbar -- siehe fetch-Handler unten.
var AUS = false;

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE).then(function (c) {
            // Einzeln, damit eine fehlende Datei nicht alles kippt.
            return Promise.all(STATIC.map(function (u) {
                return c.add(u).catch(function () {});
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                return k === CACHE ? null : caches.delete(k);   // alte Fassungen aufraeumen
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

function istHuelle(req, url) {
    if (req.mode === 'navigate') return true;
    return url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html');
}

async function melde(nachricht) {
    var cl = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cl.forEach(function (c) { try { c.postMessage(nachricht); } catch (e) {} });
}

// Erkennungsmerkmal einer Fassung. Bewusst NICHT der Inhalt selbst: den
// kompletten Text zu vergleichen hiesse, bei jedem Seitenaufruf 1,2 MB
// einzulesen (alte plus neue Fassung) -- teurer als das, was das Caching
// einspart. ETag oder Last-Modified liefert Netlify mit und reicht voellig;
// notfalls die Laenge.
function kennung(res) {
    if (!res || !res.headers) return '';
    return res.headers.get('etag') ||
           res.headers.get('last-modified') ||
           res.headers.get('content-length') || '';
}

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;

    var url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.origin !== self.location.origin) return;                 // fremde Domains: Browser macht das
    if (url.pathname.indexOf('/.netlify/') === 0) return;            // Server-Functions nie cachen
    if (url.pathname.indexOf('/rest/v1/') === 0) return;             // Daten nie cachen

    // NOTAUSGANG: /?nosw=1 einmal aufrufen schaltet das Caching dauerhaft ab
    // (bis /?nosw=0). Falls beim Caching wider Erwarten etwas schiefgeht,
    // braucht es dafuer keinen Deploy und keinen Support-Anruf.
    if (url.searchParams.get('nosw') === '1') { AUS = true; }
    else if (url.searchParams.get('nosw') === '0') { AUS = false; }
    if (AUS) return;

    if (istHuelle(req, url)) {
        event.respondWith((async function () {
            // ALLES hier in try/catch: schlaegt irgendetwas am Cache fehl, muss
            // die Seite trotzdem laden. Ein Worker, der bei einem internen
            // Fehler eine leere Antwort liefert, macht die App unbenutzbar --
            // und zwar bei jedem Gast gleichzeitig.
            try {
                var cache = await caches.open(CACHE);
                var cached = await cache.match(SHELL);

                var netz = fetch(req).then(async function (res) {
                    if (!res || !res.ok) return res;
                    try {
                        var alt = cached ? kennung(cached) : '';
                        var neu = kennung(res);
                        await cache.put(SHELL, res.clone());
                        // Nur melden, wenn sich wirklich etwas geaendert hat --
                        // sonst kaeme bei jedem Laden ein Hinweis.
                        if (alt && neu && alt !== neu) melde({ typ: 'neue-version' });
                    } catch (e) { /* Cache voll o.ae. -- Seite laedt trotzdem */ }
                    return res;
                }).catch(function () { return null; });

                // Cache vorhanden -> sofort anzeigen, Netz laeuft nebenher.
                if (cached) { event.waitUntil(netz); return cached; }
                // Erster Besuch: nichts zu zeigen, also aufs Netz warten.
                var res = await netz;
                if (res) return res;
                return new Response('Offline – bitte Verbindung prüfen.', {
                    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } catch (e) {
                // Letzte Rettung: ganz normal aus dem Netz laden.
                try { return await fetch(req); }
                catch (e2) {
                    return new Response('Offline – bitte Verbindung prüfen.', {
                        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }
            }
        })());
        return;
    }

    // Bilder, Symbole, Schriften: erst Cache, sonst Netz und dabei ablegen.
    // Diese Dateien aendern sich praktisch nie, hier ist Veralten kein Thema.
    if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
        event.respondWith(
            caches.match(req).then(function (hit) {
                return hit || fetch(req).then(function (res) {
                    if (res && res.ok) {
                        var kopie = res.clone();
                        caches.open(CACHE).then(function (c) { c.put(req, kopie); }).catch(function () {});
                    }
                    return res;
                }).catch(function () { return hit; });
            }).catch(function () { return fetch(req); })
        );
    }
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
