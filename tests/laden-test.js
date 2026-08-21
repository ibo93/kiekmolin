// Die zwei Fehler, an denen es im Betrieb hängengeblieben ist -- beide
// unsichtbar, beide tödlich.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var Module = require('module');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = h.indexOf('async function ' + name + '(');
    if (i < 0) i = h.indexOf('function ' + name + '(');
    var j = h.indexOf('{', i), d = 0;
    for (var k = j; k < h.length; k++) { if (h[k] === '{') d++; else if (h[k] === '}') { d--; if (!d) return h.slice(i, k + 1); } }
    throw new Error(name);
}

// --- Nachgebauter Browser: ein Script braucht Zeit zum Laden --------------
function browser() {
    var tags = [];
    var doc = {
        head: { appendChild: function (s) { tags.push(s); setTimeout(function () {
            s._geladen = true; if (s.onload) s.onload(); }, 20); } },
        querySelector: function (sel) {
            var m = /src="([^"]+)"/.exec(sel);
            return tags.filter(function (s) { return s.src === m[1]; })[0] || null;
        },
        createElement: function () { return { dataset: {}, set src(v) { this._src = v; }, get src() { return this._src; } }; }
    };
    return { doc: doc, tags: tags };
}

var b = browser();
var lauf = new Function('document', 'setTimeout',
    schneide('_lazyLoadScript').replace('function _lazyLoadScript', 'var _skriptWartet={}; function _lazyLoadScript')
    + '; return _lazyLoadScript;')(b.doc, setTimeout);

(async function () {
    // DER FEHLER: zweiter Aufruf, während das Script noch lädt.
    var reihenfolge = [];
    await new Promise(function (fertig) {
        lauf('https://x/pdf.js', function () { reihenfolge.push('erster'); });
        lauf('https://x/pdf.js', function () { reihenfolge.push('zweiter'); fertig(); });
    });
    t('zweiter Aufrufer wartet, statt sofort "fertig" zu melden',
      reihenfolge.length === 2 && reihenfolge[0] === 'erster',
      JSON.stringify(reihenfolge));
    t('das Script wird nur EINMAL eingehaengt', b.tags.length === 1, b.tags.length + ' Tags');

    // Nach dem Laden meldet der nächste Aufruf sofort.
    var sofort = false;
    lauf('https://x/pdf.js', function () { sofort = true; });
    t('nach dem Laden meldet der naechste Aufruf sofort', sofort === true, 'kam nicht');

    // --- Quelltext-Zusagen -------------------------------------------------
    t('pdfTextSeiten gibt nicht mehr auf, wenn pdf.js noch laedt',
      /pdfjsLib = await ladePdfJs\(\)/.test(h));
    t('pdf.js wird VOR Tesseract geladen (pdf.js ist der gute Weg)',
      h.indexOf('function loadOCRLibs') > 0
      && /ladePdfJs\(\)\.then\(function \(\) \{\s*_lazyLoadScript\('https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract/.test(h));
    t('Ladefehler blockiert nicht ewig', /s\.onerror = function \(\)/.test(h));

    // --- Tischrufe kommen über den Server, nicht direkt aus der Datenbank --
    t('Dashboard fragt waiter-pending, nicht activity_log direkt',
      /functions\/waiter-pending\?restaurant=/.test(h)
      && !/activity_type=eq\.waiter_call/.test(h));

    var PF = KMI + '/netlify/functions/waiter-pending.js';
    var RID = '11111111-2222-3333-4444-555555555555';
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    delete require.cache[require.resolve(PF)];
    var gefragt = '';
    global.fetch = async function (u) {
        gefragt = String(u);
        return { ok: true, json: async function () {
            return [{ id: 'a1', metadata: { table: 7, reason: 'pay' }, created_at: '2026-08-08T20:00:00Z' }];
        } };
    };
    var hd = require(PF).handler;
    var r = await hd({ httpMethod: 'GET', queryStringParameters: { restaurant: RID } });
    var a = JSON.parse(r.body);
    t('waiter-pending liefert Tisch und Grund',
      a.ok === true && a.rufe[0].tisch === 7 && a.rufe[0].grund === 'pay', JSON.stringify(a));
    t('waiter-pending liest mit dem Dienstschluessel (an RLS vorbei)',
      /activity_type=eq\.waiter_call/.test(gefragt) && /target_id=eq\./.test(gefragt), gefragt);
    t('nichts Aelteres als 10 Minuten',
      /created_at=gt\./.test(gefragt)
      && Date.now() - new Date(decodeURIComponent(/created_at=gt\.([^&]+)/.exec(gefragt)[1])).getTime() <= 10 * 60 * 1000 + 5000,
      gefragt);

    r = await hd({ httpMethod: 'GET', queryStringParameters: { restaurant: RID, seit: '2020-01-01T00:00:00Z' } });
    t('ein weit zurueckliegendes "seit" reisst das Fenster nicht auf',
      Date.now() - new Date(decodeURIComponent(/created_at=gt\.([^&]+)/.exec(gefragt)[1])).getTime() <= 10 * 60 * 1000 + 5000,
      gefragt);

    r = await hd({ httpMethod: 'GET', queryStringParameters: { restaurant: 'nein' } });
    t('ohne gueltige Restaurant-ID gibt es nichts', r.statusCode === 400, r.statusCode);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
