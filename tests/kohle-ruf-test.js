// KOHLE BITTE -- DER HAEUFIGSTE RUF IN EINER SHISHA-BAR.
//
// Gebaut am 06.10.2026 fuer den ersten Shisha-Bar-Kunden. "Bedienung rufen"
// gab es schon (Tisch-QR -> activity_log -> Vollbild-Alarm + Push). Jetzt
// gibt es einen dritten festen Grund: kohle.
//
// WAS SCHIEFGEHEN KANN, UND WIE ES DANN AUSSAEHE
//   - waiter-pending machte aus jedem Grund ausser 'pay' wieder 'service'.
//     Der Kohle-Ruf waere beim Personal als "braucht kurz Hilfe" angekommen
//     -- es kommt jemand mit der Karte statt mit der Kohlezange.
//   - toggleFeature haette 'kohle_ruf' in die Standardregel fallen lassen,
//     und die baut daraus "no_reservations" -- der Wirt schaltet den
//     Kohle-Knopf ein und damit unbemerkt die Reservierungen AUS.
//   - Eine gemeinsame Sperre fuer alle Gruende: wer Kohle gerufen hat,
//     koennte eine Minute lang keine Bedienung rufen.
//   - Der Knopf bei JEDEM Lokal: eine Pizzeria zeigt "Kohle bitte".
//
// Die beiden Server-Funktionen LAUFEN hier, gegen einen nachgebauten
// Server. Kein npm in der CI -- web-push wird abgefangen.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - kohle aus REASONS entfernt
//   - waiter-pending wieder auf "pay sonst service" zurueckgestellt
//   - den kohle_ruf-Zweig in toggleFeature entfernt
//   - die Sperre wieder gemeinsam fuer alle Gruende
//   - den Kohle-Knopf ohne kohleRufAn() eingeblendet
'use strict';
var fs = require('fs');
var path = require('path');
var Module = require('module');
var KMI = path.join(__dirname, '..');
var FN = path.join(KMI, 'netlify', 'functions');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var pushes = [];
var echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return {
        setVapidDetails: function () {},
        sendNotification: async function (sub, payload) { pushes.push(JSON.parse(payload)); }
    };
    return echtLaden.apply(this, arguments);
};
process.env.SUPABASE_SERVICE_KEY = 'test';
process.env.VAPID_PUBLIC = 'pub';
process.env.VAPID_PRIVATE = 'priv';
var WC, WP;
try { WC = require(path.join(FN, 'waiter-call.js')); WP = require(path.join(FN, 'waiter-pending.js')); }
catch (e) { console.log('FAIL | Funktionen laden nicht  -> ' + e.message); process.exit(1); }
Module._load = echtLaden;

var RID = '11111111-2222-3333-4444-555555555555';

(async function () {

console.log('\n-- 1. waiter-call: der Grund kommt beim Personal an --');
async function rufe(grund) {
    pushes = [];
    var log = null;
    global.fetch = async function (url, init) {
        if (/activity_log/.test(url) && init && init.method === 'POST') { log = JSON.parse(init.body); return { ok: true, status: 201 }; }
        if (/restaurants\?id=eq\./.test(url)) return { ok: true, json: async function () { return [{ name: 'Shisha Lounge' }]; } };
        if (/push_subscriptions/.test(url)) return { ok: true, json: async function () { return [{ id: 's1', endpoint: 'e', p256dh_key: 'p', auth_key: 'a' }]; } };
        return { ok: true, json: async function () { return []; } };
    };
    var r = await WC.handler({ httpMethod: 'POST', body: JSON.stringify({ restaurant_id: RID, table: 5, reason: grund }) });
    return { antwort: JSON.parse(r.body), log: log, push: pushes[0] || null };
}
var k = await rufe('kohle');
t('Kohle-Ruf wird angenommen', k.antwort.ok === true, k.antwort);
t('im Protokoll steht der Grund "kohle"', !!k.log && k.log.metadata && k.log.metadata.reason === 'kohle', k.log && k.log.metadata);
t('und der Satz sagt, was gebraucht wird', !!k.log && /möchte neue Kohle/.test(k.log.message), k.log && k.log.message);
t('der Push hat den Titel "Neue Kohle"', !!k.push && k.push.title === 'Neue Kohle', k.push);
var s = await rufe('service');
t('Bedienung rufen bleibt wie es war', !!s.log && s.log.metadata.reason === 'service' && /braucht kurz Hilfe/.test(s.log.message), s.log && s.log.message);
var x = await rufe('<b>Freitext</b>');
t('ein unbekannter Grund wird zu "service" -- kein Freitext aufs Personal-Handy',
  !!x.log && x.log.metadata.reason === 'service' && x.log.message.indexOf('<b>') < 0, x.log && x.log.message);

console.log('\n-- 2. waiter-pending: der Grund bleibt beim Nachfragen erhalten --');
global.fetch = async function () {
    return { ok: true, json: async function () { return [
        { id: 1, metadata: { table: 5, reason: 'kohle' }, created_at: '2026-10-06T20:00:00Z' },
        { id: 2, metadata: { table: 6, reason: 'pay' },   created_at: '2026-10-06T20:00:01Z' },
        { id: 3, metadata: { table: 7, reason: 'service' }, created_at: '2026-10-06T20:00:02Z' },
        { id: 4, metadata: { table: 8, reason: 'unsinn' }, created_at: '2026-10-06T20:00:03Z' }
    ]; } };
};
var p = JSON.parse((await WP.handler({ httpMethod: 'GET', queryStringParameters: { restaurant: RID } })).body);
var g = (p.rufe || []).map(function (r) { return r.grund; });
t('kohle bleibt kohle', g[0] === 'kohle', g);
t('pay bleibt pay', g[1] === 'pay', g);
t('service bleibt service', g[2] === 'service', g);
t('Unbekanntes wird service', g[3] === 'service', g);

console.log('\n-- 3. Im Browser --');
var H = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
function schneide(kopf) {
    var a = H.indexOf(kopf); if (a < 0) return '';
    var i = H.indexOf('{', a), tiefe = 0;
    for (var j = i; j < H.length; j++) { if (H[j] === '{') tiefe++; else if (H[j] === '}') { tiefe--; if (!tiefe) return H.slice(a, j + 1); } }
    return '';
}
var kohleRufAn = new Function(schneide('function kohleRufAn(') + '; return kohleRufAn;')();
t('Lokal mit kohle_ruf -> Knopf', kohleRufAn({ features: ['kohle_ruf'] }) === true, null);
t('Lokal ohne -> kein Knopf', kohleRufAn({ features: ['preorder'] }) === false, null);
t('ohne features / ohne Lokal -> kein Knopf', kohleRufAn({}) === false && kohleRufAn(null) === false, null);

// callWaiter laufen lassen: je Grund eine eigene Sperre.
var aufrufe = [], meldungen = [];
var cw = new Function('fetch', 'showToast', 'currentOrderRestaurant', 'window',
    'var _waiterCallLast = {};\n' + schneide('async function callWaiter(') + '; return callWaiter;')(
    async function (u, init) { aufrufe.push(JSON.parse(init.body).reason); return { json: async function () { return { ok: true }; } }; },
    function (m) { meldungen.push(m); },
    { id: RID, features: ['kohle_ruf'] },
    { _qrTableNumber: 5 });
await cw('kohle', null);
await cw('service', null);
await cw('kohle', null);
t('Kohle und gleich danach Bedienung: beide gehen raus', aufrufe[0] === 'kohle' && aufrufe[1] === 'service', aufrufe);
t('zweimal Kohle in einer Minute: der zweite wird gebremst', aufrufe.length === 2, aufrufe);
t('der Gast liest beim Kohle-Ruf von Kohle, nicht von "Bedienung"', /Kohle ist unterwegs zu Tisch 5/.test(meldungen[0] || ''), meldungen[0]);

console.log('\n-- 4. Knoepfe nur, wo eingeschaltet --');
t('Speisekarte: Kohle-Knopf nur am Tisch UND wenn das Lokal es will',
  /_kBtn\.style\.display = \(_showWaiter && kohleRufAn\(appRest\)\) \? 'inline-flex' : 'none';/.test(H), null);
t('Bestaetigung: nur wenn das Lokal es will',
  /_ocKohle\.style\.display = kohleRufAn\(currentOrderRestaurant\) \? 'inline-flex' : 'none';/.test(H), null);
t('beide Knoepfe stehen von Haus aus auf unsichtbar',
  /id="menuKohleBtn"[^>]*style="display:none;/.test(H) && /id="ocKohleBtn"[^>]*style="display:none;/.test(H), null);

console.log('\n-- 5. Der Schalter des Wirts --');
var tf = schneide('async function toggleFeature(');
var iKohle = tf.indexOf("} else if (feature === 'kohle_ruf') {"), iSonst = tf.indexOf("var flagName = feature === 'ordering' ? 'no_ordering' : 'no_reservations';");
t('kohle_ruf hat einen eigenen Zweig', iKohle > 0, iKohle);
t('und der steht VOR der Standardregel -- sonst wuerden die Reservierungen ausgeschaltet',
  iKohle > 0 && iSonst > iKohle, { kohle: iKohle, standard: iSonst });
t('der Schalter zeigt den Zustand beim Laden', /kohleRufToggle\.classList\.remove\('off'\)/.test(schneide('function updateFeatureToggles(')), null);

console.log('\n-- 6. Beim Personal --');
var zr = schneide('function zeigeTischRuf(');
t('Kohle hat ein eigenes Symbol', /kohle \? 'local_fire_department'/.test(zr), null);
t('und einen eigenen Satz', /Der Gast möchte neue Kohle/.test(zr), null);
t('rufen mehrere Tische, steht dabei, welcher Kohle will', /kohle \? ' \(Kohle\)'/.test(zr), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
})();
