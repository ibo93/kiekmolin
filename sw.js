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
// niemand wird mitten in einer Bestellung zwangsweise neu geladen.
//
// NICHT gecacht wird alles unter /rest/v1/ und /.netlify/ -- Bestellungen,
// Reservierungen und KI-Antworten muessen immer frisch sein. Ein gecachter
// Bestellstatus waere schlimmer als eine Sekunde Wartezeit.

// Der Name ist zugleich der Schalter zum Aufraeumen: beim Aktivieren
// wird jeder Speicher geloescht, der anders heisst. Wer ihn hochzaehlt,
// wirft damit die alte, gespeicherte Fassung der App weg.
//
// v3 am 21.08.2026: die Geraete hielten eine Fassung fest, in der die
// Benachrichtigungen noch nicht funktionierten. Ohne dieses Hochzaehlen
// haetten sie sie noch tagelang behalten.
// v4 am 26.08.2026: Der Fix fuer die Reservierungen war seit 16 Uhr
// auf dem Server -- die Wache belegt es, sie reserviert seitdem alle 15
// Minuten erfolgreich. Auf dem Handy des Betreibers ging es trotzdem
// nicht: um 12:13 ging dort noch ein Schreibversuch DIREKT an
// /rest/v1/reservations, also aus der alten App.
//
// Grund: der Service Worker liefert die Huelle aus dem Zwischenspeicher
// und holt die neue Fassung erst im Hintergrund. Der erste Aufruf nach
// einem Deploy zeigt also noch die alte Seite. Wer einmal nachlaedt und
// aufgibt, bleibt auf der alten haengen.
//
// Der Name dieses Zwischenspeichers ist der Schalter: aendert er sich,
// wirft jedes Geraet beim naechsten Aufruf den alten Stand weg. Nach
// einer Aenderung an einem Gaesteweg MUSS er hochgezaehlt werden --
// sonst ist die Reparatur auf dem Server heil und beim Gast nicht.
var CACHE = 'kmi-shell-v21';
var SHELL = '/';
// Nur Dateien, die es sicher gibt. Eine fehlende Datei laesst sonst die
// gesamte Installation scheitern und der Worker uebernimmt nie.
var STATIC = ['/kiek-logo.png', '/icon-192.png'];
// Notausgang, per /?nosw=1 umlegbar -- siehe fetch-Handler unten.
var AUS = false;

// So lange warten wir auf das Netz, bevor die gespeicherte Fassung dran ist.
//
// Drei Sekunden sind der Punkt, an dem ein Ladevorgang aufhoert, sich nach
// "gleich da" anzufuehlen. Kuerzer waere schaedlich: dann bekaeme jeder mit
// mittelmaessigem Empfang staendig die alte Fassung, obwohl die neue nach
// 3,5 Sekunden gekommen waere. Laenger ist genau der Zustand, der gemeldet
// wurde.
var NETZ_GEDULD_MS = 3000;

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

// WAS DIE APP-HUELLE IST -- UND WAS NICHT.
//
// Hier stand: JEDE Navigation ist die Huelle. Das stimmt fuer die
// Adressen der App selbst ("/", "/lapiazza", "/bestellen") -- die
// bedient index.html, und dafuer ist der Zwischenspeicher da.
//
// Es stimmte aber auch fuer jede andere Seite auf derselben Domain. Wer
// /push-check.html aufrief, bekam die App aus dem Zwischenspeicher
// serviert -- die Datei wurde nie geholt. AM 21.08.2026 GENAU DARAN
// GESCHEITERT: die Pruefseite war live, und auf dem Handy kam die
// gewoehnliche Startseite.
//
// Dasselbe traf die erzeugten Google-Seiten: wer /pizzeria-emden.html
// direkt aufrief, sah die App statt der Seite.
//
// Die Regel jetzt: eine Navigation auf einen Pfad, der auf .html endet
// und NICHT index.html ist, gehoert nicht zur Huelle. Sie geht ans
// Netz. Alles ohne Dateiendung bleibt Huelle wie bisher -- das sind
// die Adressen der App.
function istHuelle(req, url) {
    if (url.origin !== self.location.origin) return false;
    var pfad = url.pathname;
    if (pfad === '/' || pfad === '/index.html') return true;
    // Eine echte Datei mit Endung ist nie die Huelle.
    if (/\.html?$/i.test(pfad)) return false;
    return req.mode === 'navigate';
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
        // ZUERST DAS NETZ, Cache nur als Rueckfallebene -- ABER MIT GEDULDSFRIST.
        //
        // Zuerst lief es andersherum: erst die gespeicherte Fassung anzeigen,
        // die neue im Hintergrund nachladen. Das laedt sofort, hat aber einen
        // Haken, der schwerer wiegt: nach einem Deploy sieht man die Aenderung
        // erst beim UEBERNAECHSTEN Laden. Wer testet, weiss dann nie, welche
        // Fassung er vor sich hat -- und haelt eine Verbesserung fuer
        // wirkungslos, weil sie noch gar nicht da ist.
        //
        // Also Netz zuerst. Nur hatte das eine Luecke, und zwar genau die, die
        // gemeldet wurde ("die App laedt so komisch, wenn kein gutes Internet
        // ist"): OHNE Frist wartet der Browser auf ein langsames Netz, bis es
        // ihm reicht -- das koennen dreissig Sekunden weisser Bildschirm sein,
        // waehrend die fertige Seite die ganze Zeit im Cache liegt. "Kein Netz"
        // faengt der catch ab, "schlechtes Netz" fing niemand ab.
        //
        // Jetzt ein Wettlauf: antwortet das Netz binnen NETZ_GEDULD_MS, gilt
        // seine Antwort (kein heimlich alter Stand). Antwortet es nicht,
        // kommt die gespeicherte Fassung auf den Schirm -- und der Abruf
        // laeuft trotzdem weiter und frischt den Cache fuer das naechste Mal
        // auf.
        //
        // Ist NICHTS gespeichert, wird ohne Frist gewartet: dann ist Warten
        // die einzige Moeglichkeit, ueberhaupt etwas zu zeigen.
        event.respondWith((async function () {
            var cache = null;
            try { cache = await caches.open(CACHE); } catch (e) {}

            var gespeichert = null;
            if (cache) { try { gespeichert = await cache.match(SHELL); } catch (e) {} }

            var vomNetz = fetch(req).then(function (res) {
                if (res && res.ok && cache) {
                    // Ohne await, damit die Antwort nicht auf das Schreiben
                    // wartet -- deshalb braucht es BEIDE Absicherungen: try
                    // faengt ein sofortiges Werfen, .catch die abgelehnte
                    // Zusage. Ein Cache-Schreibfehler darf die Seite nie
                    // kippen, und ein Speicher ist irgendwann voll.
                    try { cache.put(SHELL, res.clone()).catch(function () {}); } catch (e) {}
                }
                return res;
            });
            // Der Abruf soll auch dann zu Ende laufen, wenn wir schon
            // geantwortet haben -- sonst bleibt der Cache alt.
            try { event.waitUntil(vomNetz.catch(function () {})); } catch (e) {}

            if (!gespeichert) {
                try {
                    return await vomNetz;
                } catch (e) {
                    return new Response('Offline – bitte Verbindung prüfen.', {
                        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                }
            }

            var rechtzeitig = await Promise.race([
                vomNetz.catch(function () { return null; }),
                new Promise(function (fertig) { setTimeout(function () { fertig(null); }, NETZ_GEDULD_MS); })
            ]);
            return rechtzeitig || gespeichert;
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
