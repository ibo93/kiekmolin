// Kassen-Umsatz: der Wirt trägt abends EINE Zahl ein (datenbank/43).
//
// Ibo, 09.10.2026: "ich will Umsatz sehen jeden Tag für den Gastronomen".
// Die App kennt nur ihre eigenen Bestellungen; ohne Kasse ist "Umsatz heute"
// nur ein Teil. Diese Tests FÜHREN den Code aus (Betrag lesen, Speichern mit
// nachgebautem Server, Monatsrechnung, Tagesmail) -- nicht nur Text suchen.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0, warten = [];
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.search(new RegExp('(^|\\n)\\s*(async )?function ' + name + '\\(')); if (i < 0) throw new Error('fehlt: ' + name); i = H.indexOf('function ' + name + '(', i); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }

// ---- 1. Betrag lesen: deutsche Schreibweise
var B = new Function(fn('kasseBetrag') + '; return kasseBetrag;')();
var faelle = [['1.234,50', 1234.5], ['1.234', 1234], ['12.345.678', null], ['850', 850], ['12,5 €', 12.5], ['12.5', 12.5], ['0', 0],
              ['', null], ['abc', null], ['-5', null], ['12,345', null], ['1000000', null], ['  2.100,00 ', 2100]];
var falsch = faelle.filter(function (f) { return B(f[0]) !== f[1]; });
t('Betrag: "1.234,50" = 1234,50, Tausenderpunkt, Euro-Zeichen; Unsinn/negativ/zu groß = ungültig', !falsch.length, JSON.stringify(falsch.map(function (f) { return [f[0], B(f[0]), 'soll', f[1]]; })));

// ---- 2. Speichern gegen nachgebauten Server
function speicherMit(antwort) {
    var gesehen = {};
    var f = new Function('fetch', 'SUPABASE_URL', 'SUPABASE_KEY', 'kmiToken', fn('kasseSpeichern') + '; return kasseSpeichern;')(
        function (url, o) { gesehen.url = url; gesehen.o = o; return Promise.resolve(antwort); }, 'https://x', 'anon', function () { return 'tok'; });
    return { f: f, gesehen: gesehen };
}
function antwort(status, body) { return { ok: status < 300, status: status, json: function () { return Promise.resolve(body); } }; }
warten.push((async function () {
    var s = speicherMit(antwort(201, [{ id: 'k1', betrag: 1234.5 }]));
    var z = await s.f('r1', '2026-10-09', 1234.5, 'Feier');
    var body = JSON.parse(s.gesehen.o.body);
    t('Speichern: eine Zeile je Tag (on_conflict restaurant_id,tag + merge-duplicates), als Wirt angemeldet',
        /kassen_umsatz\?on_conflict=restaurant_id,tag$/.test(s.gesehen.url) && /resolution=merge-duplicates/.test(s.gesehen.o.headers.Prefer) && /return=representation/.test(s.gesehen.o.headers.Prefer)
        && s.gesehen.o.headers.Authorization === 'Bearer tok' && body.restaurant_id === 'r1' && body.tag === '2026-10-09' && body.betrag === 1234.5 && body.notiz === 'Feier' && z.id === 'k1',
        JSON.stringify({ url: s.gesehen.url, h: s.gesehen.o.headers, body: body }));
    var leer = speicherMit(antwort(201, [])), fehler = '';
    try { await leer.f('r1', '2026-10-09', 5, ''); } catch (e) { fehler = e.message; }
    t('Speichern: leere Antwort (RLS) ist ein Fehler, kein stilles "gespeichert" (Regel 6)', /keine Berechtigung/.test(fehler), fehler || 'kein Fehler');
    var fehlt = speicherMit(antwort(404, { message: 'relation "kassen_umsatz" does not exist' })); fehler = '';
    try { await fehlt.f('r1', '2026-10-09', 5, ''); } catch (e) { fehler = e.message; }
    t('Speichern ohne SQL 43: sagt "datenbank/43 einspielen"', /datenbank\/43/.test(fehler), fehler || 'kein Fehler');
})());

// ---- 3. Laden
warten.push((async function () {
    var q = '';
    var L = new Function('supabaseGet', fn('kasseLaden') + '; return kasseLaden;')(function (tab, query) { q = tab + '?' + query; return Promise.resolve([{ tag: '2026-10-01', betrag: '800.00', notiz: null }, { tag: '2026-10-03', betrag: '1234.50', notiz: 'Feier' }]); });
    var m = await L('r1', '2026-10-01', '2026-10-31');
    t('Laden: Tag -> Betrag als Zahl, nur dieses Lokal und dieser Zeitraum', m['2026-10-01'].betrag === 800 && m['2026-10-03'].betrag === 1234.5 && m['2026-10-03'].notiz === 'Feier'
        && /^kassen_umsatz\?restaurant_id=eq\.r1&tag=gte\.2026-10-01&tag=lte\.2026-10-31/.test(q), q + ' ' + JSON.stringify(m));
})());

// ---- 4. Monatsbericht: App + Kasse = Gesamt, je Tag
var M = new Function(['umsatzTag', 'umsatzProTag', 'mbRechnen'].map(fn).join('\n') + '; return mbRechnen;')();
var orders = [{ created_at: '2026-10-01T10:00:00Z', total: 30, status: 'completed' }, { created_at: '2026-10-02T10:00:00Z', total: 20, status: 'completed' }];
var mit = M('2026-10', { orders: orders, reservierungen: [], kasse: { '2026-10-01': { betrag: 800 }, '2026-10-03': { betrag: 1234.5 } } }, '2026-10-03');
t('Monatsbericht: je Tag App, Kasse, Gesamt; Tag ohne Eintrag = null (nicht 0)', mit.tage[0].kasse === 800 && mit.tage[0].gesamt === 830 && mit.tage[1].kasse === null && mit.tage[1].gesamt === 20 && mit.tage[2].gesamt === 1234.5, JSON.stringify(mit.tage));
t('Monatsbericht: Summen App / Kasse / Gesamt, Zahl der eingetragenen Tage', mit.summe === 50 && mit.kasse === 2034.5 && mit.gesamt === 2084.5 && mit.kasseTage === 2, JSON.stringify({ s: mit.summe, k: mit.kasse, g: mit.gesamt, kt: mit.kasseTage }));
var ohne = M('2026-10', { orders: orders, reservierungen: [], kasse: null, kasseFehler: 'Kassen-Umsatz noch nicht eingerichtet (datenbank/43 einspielen) – der Bericht zeigt nur die App.' }, '2026-10-03');
t('Monatsbericht ohne SQL 43: Kasse = null und Hinweis, nicht still 0 (Regel 6)', ohne.kasse === null && ohne.gesamt === 50 && /datenbank\/43/.test(ohne.kasseFehler), JSON.stringify({ k: ohne.kasse, f: ohne.kasseFehler }));
var mbh = fn('mbHtml');
t('Monatsbericht-Tabelle zeigt Spalten Kasse und Gesamt, und den Hinweis bei Fehler', /<th[^>]*>Kasse<\/th><th[^>]*>Gesamt<\/th>/.test(mbh) && /mb-kasse-fehler/.test(mbh) && /davon Kasse/.test(mbh), '');
t('monatsberichtLaden lädt die Kasse mit und meldet, wenn sie fehlt', /daten\.kasse = await kasseLaden\(rid,/.test(fn('monatsberichtLaden')) && /daten\.kasseFehler = /.test(fn('monatsberichtLaden')), '');

// ---- 5. Startseite + Tagesabschluss
t('Startkarte: Gesamt = App + Kasse, Zeile "App … · Kasse …", Knopf zum Eintragen', /dashRevenue\.textContent = \(heute\.summe \+ \(kh \|\| 0\)\)/.test(H) && /'App ' \+ heute\.summe\.toFixed\(0\) \+ ' € · Kasse '/.test(H) && /id="dashKasseBtn"/.test(H) && /kasseDialog\(_gRestId, _heuteTag/.test(H), '');
t('Startkarte ohne SQL 43: Knopf sagt "datenbank/43 einspielen" statt nichts zu tun', /if \(kf && \/404\|kassen_umsatz\/\.test\(kf\)\) \{ showToast\('Kassen-Umsatz ist noch nicht eingerichtet: datenbank\/43/.test(H), '');
var dc = fn('openDayCloseReport');
t('Tagesabschluss: lädt Kasse, zeigt Gesamt und "App … · Kasse …", Knopf öffnet Dialog und danach neu', /await kasseLaden\(restaurantId, today, today\)/.test(dc) && /\(revenue \+ \(kasseHeute \? kasseHeute\.betrag : 0\)\)/.test(dc) && /' · Kasse ' \+ \(kasseHeute \?/.test(dc) && /kasseDialog\(restaurantId, today, kasseHeute, function \(\) \{ openDayCloseReport\(restaurantId\); \}\)/.test(dc), '');
t('Dialog: ungültiger Betrag wird gemeldet, nicht gespeichert', /if \(b === null\) \{ m\.textContent = 'Bitte einen Betrag eintragen/.test(fn('kasseDialog')), '');

// ---- 6. SQL
var S = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '43-push-angebote-kasse.sql'), 'utf8');
t('SQL 43: kassen_umsatz eine Zeile je Lokal+Tag, Betrag geprüft, RLS nur eigene Häuser', /unique \(restaurant_id, tag\)/.test(S) && /check \(betrag >= 0 and betrag < 1000000\)/.test(S) && /alter table public\.kassen_umsatz enable row level security/.test(S) && /using\s+\(restaurant_id in \(select public\.kmi_meine_haeuser\(\)\)/.test(S), '');

// ---- 7. Tagesmail (daily-report) mit nachgebautem Supabase + Resend
async function tagesmail(kasseAntwort, ordersListe) {
    process.env.RESEND_API_KEY = 'x'; process.env.SUPABASE_SERVICE_KEY = 'x';
    var p = require.resolve('../netlify/functions/daily-report.js'); delete require.cache[p];
    var mails = [], alt = global.fetch, w = console.warn; console.warn = function () {};
    global.fetch = function (url, o) {
        if (/api\.resend\.com/.test(url)) { mails.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); }
        var tab = url.split('/rest/v1/')[1].split('?')[0];
        var daten = { restaurants: [{ id: 'r1', name: 'Haus', email: 'a@b.de' }], orders: ordersListe, reservations: [] }[tab];
        if (tab === 'kassen_umsatz') return Promise.resolve(kasseAntwort);
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(daten); } });
    };
    try { await require(p).handler(); } finally { global.fetch = alt; console.warn = w; }
    return mails;
}
warten.push((async function () {
    var o = [{ restaurant_id: 'r1', total: 40, status: 'completed', order_type: 'pickup', items: [] }];
    var m1 = await tagesmail(antwort(200, [{ restaurant_id: 'r1', betrag: '960.00', notiz: 'Feier' }]), o);
    t('Tagesmail: Gesamt 1.000 € im Betreff, "davon App" und "davon Kasse" mit Notiz', m1.length === 1 && /1000,00 €/.test(m1[0].subject) && /davon App.*40,00 €/.test(m1[0].html) && /davon Kasse.*960,00 €.*Feier/.test(m1[0].html), JSON.stringify(m1.map(function (m) { return m.subject; })));
    var m2 = await tagesmail(antwort(200, []), o);
    t('Tagesmail: nichts eingetragen -> "Kasse noch nicht eingetragen"', m2.length === 1 && /Umsatz heute \(App\)/.test(m2[0].html) && /noch nicht eingetragen/.test(m2[0].html), m2[0] && m2[0].html.slice(0, 200));
    var m3 = await tagesmail(antwort(404, {}), o);
    t('Tagesmail ohne SQL 43: Mail geht trotzdem raus, ohne Kassen-Zeile', m3.length === 1 && !/Kasse/.test(m3[0].html) && /40,00 €/.test(m3[0].subject), m3.length);
    var m4 = await tagesmail(antwort(200, [{ restaurant_id: 'r1', betrag: '500', notiz: null }]), []);
    t('Tagesmail: nur Kasse, keine App-Bestellung -> trotzdem eine Mail', m4.length === 1 && /500,00 €/.test(m4[0].subject), m4.length);
})());

Promise.all(warten).then(function () {
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
}).catch(function (e) { console.error(e); process.exit(1); });
