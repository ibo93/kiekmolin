// DER SERVICE WORKER WARTETE OHNE FRIST AUFS NETZ.
//
// WAS GEMELDET WURDE
// ------------------
// "die App laedt so komisch ab und zu wenn kein gutes Internet ist".
//
// WO DAS HERKAM
// -------------
// Die App-Huelle lief nach "Netz zuerst, Cache als Rueckfall". Der Rueckfall
// haengt aber am catch -- und der greift nur, wenn der Abruf FEHLSCHLAEGT.
// Ein langsames Netz schlaegt nicht fehl, es dauert. Also wartete der Browser,
// bis ihm selbst die Geduld ausging: dreissig Sekunden weisser Bildschirm sind
// da moeglich, waehrend die fertige Seite die ganze Zeit im Cache lag.
//
// "Kein Netz" war abgedeckt. "Schlechtes Netz" -- der haeufigere Fall, und
// genau der gemeldete -- war es nicht.
//
// DIE REGEL JETZT
// ---------------
//   * Netz antwortet binnen 3 Sekunden -> seine Antwort gilt.
//   * Es dauert laenger und es gibt eine gespeicherte Fassung
//                               -> gespeicherte Fassung auf den Schirm,
//                                  der Abruf laeuft weiter und frischt auf.
//   * Es gibt nichts Gespeichertes -> warten, ohne Frist. Dann ist Warten
//                                     die einzige Moeglichkeit, ueberhaupt
//                                     etwas zu zeigen.
//
// Warum nicht kuerzer: dann bekaeme jeder mit mittelmaessigem Empfang
// staendig die alte Fassung, obwohl die neue nach 3,5 Sekunden gekommen
// waere. Die Entscheidung von damals -- online nie heimlich alter Stand --
// bleibt fuer alle, deren Netz halbwegs geht.
//
// DIESER TEST FUEHRT DEN WORKER WIRKLICH AUS.
// Kein Suchen im Quelltext: sw.js wird mit einem nachgebauten self, caches
// und fetch geladen, das fetch-Ereignis ausgeloest und angeschaut, WAS
// zurueckkommt und WANN.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var QUELLE = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// ---------------------------------------------------------------------------
// Ein Worker-Umfeld, gerade gross genug
// ---------------------------------------------------------------------------
function starte(einstellung) {
    var lauscher = {};
    var speicher = {};              // Cache-Inhalt: Adresse -> Antwort
    var gewartet = [];              // was per waitUntil weiterlaufen soll

    function Antwort(text, opt) {
        this.text = text;
        this.ok = !opt || opt.status === undefined || opt.status < 400;
        this.status = (opt && opt.status) || 200;
        this.clone = function () { return new Antwort(text, opt); };
    }

    var cache = {
        match: function (u) { return Promise.resolve(speicher[u] || null); },
        put: function (u, r) { speicher[u] = r; return Promise.resolve(); },
        add: function () { return Promise.resolve(); }
    };

    var self_ = {
        location: { origin: 'https://kiekmolin.de' },
        addEventListener: function (name, fn) { lauscher[name] = fn; },
        skipWaiting: function () { return Promise.resolve(); },
        clients: { claim: function () { return Promise.resolve(); } },
        registration: {}
    };

    var umfeld = {
        self: self_,
        caches: {
            open: function () { return Promise.resolve(cache); },
            keys: function () { return Promise.resolve([]); },
            "delete": function () { return Promise.resolve(true); },
            match: function (u) { return Promise.resolve(speicher[u && u.url] || null); }
        },
        fetch: einstellung.fetch,
        Response: Antwort,
        URL: URL,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Promise: Promise,
        console: { log: function () {}, warn: function () {}, error: function () {} }
    };
    umfeld.self.caches = umfeld.caches;
    vm.createContext(umfeld);
    vm.runInContext(QUELLE, umfeld);

    if (einstellung.imCache) speicher['/'] = new Antwort(einstellung.imCache);

    return {
        speicher: speicher,
        gewartet: gewartet,
        Antwort: Antwort,
        // Das fetch-Ereignis ausloesen und die Antwort samt Dauer messen.
        hole: function () {
            var antwort = null;
            var start = Date.now();
            var ereignis = {
                request: { method: 'GET', url: 'https://kiekmolin.de/', mode: 'navigate' },
                respondWith: function (p) { antwort = p; },
                waitUntil: function (p) { gewartet.push(p); }
            };
            lauscher.fetch(ereignis);
            if (!antwort) return Promise.resolve({ text: '(keine Antwort)', dauer: 0 });
            return antwort.then(function (r) {
                return { text: r && r.text, status: r && r.status, dauer: Date.now() - start };
            });
        }
    };
}

function spaeteAntwort(text, ms, Antwort) {
    return function () {
        return new Promise(function (fertig) {
            setTimeout(function () {
                fertig({ ok: true, status: 200, text: text, clone: function () { return this; } });
            }, ms);
        });
    };
}

(async function () {
    // ---- 1. Schnelles Netz: die frische Fassung gewinnt --------------------
    (function () {})();
    var a = starte({ imCache: 'ALT', fetch: spaeteAntwort('NEU', 50) });
    var r1 = await a.hole();
    t('schnelles Netz: die frische Fassung kommt auf den Schirm',
      r1.text === 'NEU', r1.text + ' nach ' + r1.dauer + ' ms');
    t('und sie wird fuer das naechste Mal gespeichert',
      a.speicher['/'] && a.speicher['/'].text === 'NEU',
      a.speicher['/'] && a.speicher['/'].text);

    // ---- 2. DER GEMELDETE FALL: langsames Netz -----------------------------
    // Zehn Sekunden Antwortzeit. Vorher haette der Gast zehn Sekunden auf
    // einen weissen Bildschirm geschaut, obwohl die Seite im Cache lag.
    var b = starte({ imCache: 'ALT', fetch: spaeteAntwort('NEU', 10000) });
    var r2 = await b.hole();
    t('langsames Netz: die gespeicherte Fassung kommt statt weissem Bildschirm',
      r2.text === 'ALT', r2.text);
    t('und zwar nach etwa drei Sekunden, nicht nach zehn',
      r2.dauer >= 2800 && r2.dauer < 4200, r2.dauer + ' ms');

    // Der Abruf laeuft weiter -- sonst bliebe der Cache fuer immer alt.
    await Promise.all(b.gewartet);
    t('der Abruf laeuft weiter und frischt den Cache auf',
      b.speicher['/'] && b.speicher['/'].text === 'NEU',
      b.speicher['/'] && b.speicher['/'].text);

    // ---- 3. Gar kein Netz ---------------------------------------------------
    var c = starte({ imCache: 'ALT', fetch: function () { return Promise.reject(new Error('kein Netz')); } });
    var r3 = await c.hole();
    t('kein Netz: die gespeicherte Fassung, und zwar sofort',
      r3.text === 'ALT' && r3.dauer < 1000, r3.text + ' nach ' + r3.dauer + ' ms');

    // ---- 4. Nichts gespeichert ---------------------------------------------
    // Hier darf NICHT nach drei Sekunden aufgegeben werden: es gibt nichts zu
    // zeigen, warten ist die einzige Moeglichkeit.
    var d = starte({ imCache: null, fetch: spaeteAntwort('NEU', 5000) });
    var r4 = await d.hole();
    t('ohne gespeicherte Fassung wird gewartet, statt aufzugeben',
      r4.text === 'NEU' && r4.dauer > 4000, r4.text + ' nach ' + r4.dauer + ' ms');

    // ---- 5. Nichts gespeichert UND kein Netz -------------------------------
    var e = starte({ imCache: null, fetch: function () { return Promise.reject(new Error('kein Netz')); } });
    var r5 = await e.hole();
    t('ohne alles kommt eine ehrliche Meldung, kein Absturz',
      r5.status === 503 && /Offline/.test(r5.text), r5.status + ' ' + r5.text);

    // ---- 6. Die Frist steht als Zahl mit Begruendung im Code ----------------
    t('die Geduldsfrist ist benannt und begruendet',
      /var NETZ_GEDULD_MS = 3000;/.test(QUELLE) && /Drei Sekunden sind der Punkt/.test(QUELLE));
    t('und warum sie nicht kuerzer ist, steht dabei',
      /Kuerzer waere schaedlich/.test(QUELLE));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
