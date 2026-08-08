// GANZE KETTE, nichts nachgestellt ausser Netlify:
//   echtes Kartenbild -> echter Client-Code aus index.html -> echte
//   Server-Function menu-scan.js -> ECHTER Gemini-Aufruf -> echter Parser.
// Netlify wird nachgebildet, weil es genau die Wand ist, an der der Scanner
// gescheitert ist: 10 Sekunden, danach Schluss.
'use strict';
var fs = require('fs');
// Bilder liegen nicht im Repo. Erst erzeugen:
//   python3 tests/testkarte.py /tmp/karten
// Dann (kostet NICHTS, laeuft ueber den kostenlosen Gemini-Schluessel):
//   GKEY=<gemini-schluessel> KARTEN=/tmp/karten/ node tests/beweis-echt.js
var S = (process.env.KARTEN || '/tmp/karten').replace(/\/?$/, '/');
var HTML = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var PFAD = '/home/user/kiekmolin/netlify/functions/menu-scan.js';
var WAHR = JSON.parse(fs.readFileSync(S + 'wahrheit.json', 'utf8'));
var BILD = 'data:image/jpeg;base64,' + fs.readFileSync(process.argv[2] ? (process.argv[2].indexOf('/') >= 0 ? process.argv[2] : S + process.argv[2]) : S + 'karte.jpg').toString('base64');

var NETLIFY_MS = 10000;
function schlaf(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function n(s) { return String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, ''); }

function schneide(src, name) {
    var i = src.indexOf('async function ' + name + '(');
    if (i < 0) i = src.indexOf('function ' + name + '(');
    var j = src.indexOf('{', i), d = 0;
    for (var k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    throw new Error('nicht gefunden: ' + name);
}

(async function () {
    process.env.GEMINI_API_KEY = process.env.GKEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_VISION_API_KEY;
    delete process.env.MENU_SCAN_PROVIDER;

    var handler = require(PFAD).handler;
    var echterFetch = global.fetch;
    var runden = [];

    global.window = { _lastMenuScanError: null };
    // Der Client ruft /.netlify/functions/menu-scan -- das leiten wir auf den
    // echten Handler um, hinter der 10-Sekunden-Wand. Alles andere (der
    // Gemini-Aufruf des Handlers) geht ECHT ins Netz.
    global.fetch = async function (url, opts) {
        if (String(url).indexOf('/.netlify/functions/menu-scan') < 0) return echterFetch(url, opts);
        var t0 = Date.now();
        var res = await Promise.race([
            handler({ httpMethod: 'POST', body: opts.body }),
            schlaf(NETLIFY_MS).then(function () {
                return { statusCode: 504, body: '{"ok":false,"error":"Task timed out after 10.00 seconds"}', _limit: true };
            })
        ]);
        runden.push({ ms: Date.now() - t0, code: res.statusCode, limit: !!res._limit });
        return { ok: res.statusCode < 400, status: res.statusCode, json: async () => JSON.parse(res.body) };
    };

    var lauf = new Function('BILD', 'return (async function(){' +
        schneide(HTML, 'aiMenuScan') + ';' +
        schneide(HTML, 'scanSeiteKomplett') + ';' +
        schneide(HTML, 'zeileAusItem') + ';' +
        schneide(HTML, 'pruefeSeite') + ';' +
        'var e = await scanSeiteKomplett(BILD, ["Pizzen","Getränke"], null);' +
        'e.pruefung = await pruefeSeite(BILD, e.items, ["Pizzen","Getränke"]);' +
        'return e;})()');

    var t0 = Date.now();
    var erg = await lauf(BILD);
    var ms = Date.now() - t0;

    var items = erg.items;
    var m = (window._scanMeta || [])[0] || {};

    console.log('\n=== GANZE KETTE, ECHTER AUFRUF ===');
    console.log('Bild: ' + (process.argv[2] || 'karte.jpg') + '   Karte: ' + WAHR.length + ' Gerichte');
    console.log('Anbieter: ' + (m.anbieter || '?') + ' / ' + (m.modell || '?') +
                (m.kostenlos ? '  (kostenlos)' : '  (kostenpflichtig)'));
    runden.forEach(function (r, i) {
        console.log('  Runde ' + (i + 1) + ': ' + (r.ms / 1000).toFixed(1) + ' s  HTTP ' + r.code +
                    (r.limit ? '   <-- VON NETLIFY ABGESCHNITTEN' : ''));
    });
    console.log('Gesamtdauer: ' + (ms / 1000).toFixed(1) + ' s');
    var pz = erg.pruefung || {};
    console.log('Zweiter Blick: ' + (pz.korrigiert || 0) + ' korrigiert, ' + (pz.ergaenzt || 0)
                + ' nachgetragen, ' + ((pz.ms || 0) / 1000).toFixed(1) + ' s'
                + (pz.sauber ? '  (ohne Beanstandung)' : ''));

    var nachName = {}; items.forEach(function (i) { nachName[n(i.name)] = i; });
    var gef = 0, pr = 0, kat = 0, nr = 0, fehlt = [];
    WAHR.forEach(function (w) {
        var g = nachName[n(w.name)];
        if (!g) { var k = Object.keys(nachName).find(function (x) { return x.indexOf(n(w.name)) >= 0 || n(w.name).indexOf(x) >= 0; }); if (k) g = nachName[k]; }
        if (!g) { fehlt.push(w.name); return; }
        gef++;
        if (Number(g.price).toFixed(2) === parseFloat(w.preis).toFixed(2)) pr++;
        if (n(g.category) === n(w.kategorie)) kat++;
        if ((g.dish_number || '') === (w.nr || '')) nr++;
    });
    console.log('\nGerichte     : ' + gef + ' / ' + WAHR.length);
    console.log('Preise       : ' + pr + ' / ' + WAHR.length + '   (ohne Preis: ' + items.filter(function (x) { return !x.price; }).length + ')');
    console.log('Kategorien   : ' + kat + ' / ' + WAHR.length);
    console.log('Gerichtnummer: ' + nr + ' / ' + WAHR.length);
    if (fehlt.length) console.log('FEHLEN       : ' + fehlt.join(', '));
    if (erg.fehler) console.log('FEHLER       : ' + erg.fehler);
    console.log('\nProtokoll: ' + erg.protokoll.map(function (r) {
        return 'R' + r.runde + ' ' + r.neu + ' neu / ' + (r.ms / 1000).toFixed(1) + 's / ' + r.status;
    }).join('  |  '));
    console.log('\nErste 3 Zeilen:');
    items.slice(0, 3).forEach(function (i) {
        console.log('  [' + i.category + '] ' + (i.dish_number ? i.dish_number + ' ' : '') + i.name +
                    ' — ' + i.price + ' € — ' + (i.allergens || []).join(',') +
                    (i.additives && i.additives.length ? ' | Zusatz ' + i.additives.join(',') : ''));
    });
})();
