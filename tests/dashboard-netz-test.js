// DASHBOARD-NETZ (28.10.2026). Ibo: "beim dashboard muss alles rein kommen,
// so muss der wirt alles mitbekommen, reservierungen und bestellung".
// Der Test FUEHRT dashboardNetz aus und zaehlt, was gemeldet wird.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) {
    var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name);
    var a = H.lastIndexOf('\n', i) + 1, d = 0, j = H.indexOf('{', i);
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } }
}
var bestellungen = [], reservierungen = [], abfragen = [], gemeldet = [];
var W = { _gastroOnlyRestaurantId: 'r1', getComputedStyle: function () { return { display: 'block' }; } };
var N = new Function('window', 'document', 'fetch', 'currentAdmin', 'kmiToken', 'SUPABASE_URL', 'SUPABASE_KEY', 'handleRealtimeOrder', 'handleRealtimeReservation', 'console',
    'window._kmiGemeldet = {};\nvar _netzBasis = false, _netzLaeuft = false;\n' + [fn('istWacheProbe'), fn('kmiSchonGemeldet'), fn('dashboardNetz')].join('\n') + '; return { netz: dashboardNetz, schon: kmiSchonGemeldet };')(
    W, { getElementById: function () { return {}; } },
    async function (url) { abfragen.push(url); var b = /\/orders\?/.test(url) ? bestellungen : reservierungen; return { ok: true, status: 200, json: async function () { return b; } }; },
    { isAdmin: false, restaurant_id: 'r1' }, function () { return 't'; }, 'https://x', 'k',
    function (p) { gemeldet.push(['o', p.new.id]); }, function (p) { gemeldet.push(['r', p.new.id]); }, { warn: function () {} });

(async function () {
    bestellungen = [{ id: 'alt1', customer_name: 'Alt' }]; reservierungen = [{ id: 'altR', guest_name: 'Alt', source: 'app' }];
    await N.netz();
    t('erster Blick: was schon da war, wird nur gemerkt (kein Alarm)', gemeldet.length === 0, JSON.stringify(gemeldet));
    t('nur das eigene Lokal wird gefragt, nur die letzten 15 Min', abfragen.every(function (u) { return /restaurant_id=eq\.r1/.test(u) && /created_at=gte\./.test(u); }), abfragen.join(' | '));
    bestellungen.push({ id: 'neu1', customer_name: 'Kaya' }, { id: 'probe', customer_name: '[Probe] Gastweg-Wache' });
    reservierungen.push({ id: 'neuR', guest_name: 'Meyer', source: 'app' }, { id: 'tresen', guest_name: 'Tel', source: 'dashboard' }, { id: 'probeR', guest_name: '[Probe] Gastweg-Wache', source: 'app' });
    await N.netz();
    t('neue Bestellung -> gemeldet (gleicher Weg wie Echtzeit)', gemeldet.some(function (g) { return g[0] === 'o' && g[1] === 'neu1'; }), JSON.stringify(gemeldet));
    t('neue Reservierung -> gemeldet', gemeldet.some(function (g) { return g[0] === 'r' && g[1] === 'neuR'; }), JSON.stringify(gemeldet));
    t('Probe der Wache -> nicht gemeldet', !gemeldet.some(function (g) { return /probe/i.test(g[1]); }), JSON.stringify(gemeldet));
    t('selbst am Tresen eingetragen -> nicht gemeldet', !gemeldet.some(function (g) { return g[1] === 'tresen'; }), JSON.stringify(gemeldet));
    var vorher = gemeldet.length;
    await N.netz();
    t('nächste Runde: nichts doppelt', gemeldet.length === vorher, gemeldet.length - vorher);
    t('Merker: zweite Meldung derselben ID wird erkannt', N.schon('o', 'x9') === false && N.schon('o', 'x9') === true, '');

    var ho = fn('handleRealtimeOrder'), hr = fn('handleRealtimeReservation');
    t('Echtzeit-Bestellung prüft den Merker (kein Doppel-Alarm mit dem Netz)', /if \(order\.id && kmiSchonGemeldet\('o', order\.id\)\) return;/.test(ho), '');
    t('Echtzeit-Reservierung: Probe raus + Merker', /istWacheProbe\(reservation\)\) return;/.test(hr) && /kmiSchonGemeldet\('r', reservation\.id\)/.test(hr), '');
    t('Netz läuft alle 15 s auf JEDER Dashboard-Seite (nicht nur Bestellungen)', /setInterval\(dashboardNetz, 15000\)/.test(H) && !/sectionOrders/.test(fn('dashboardNetz')), '');
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
