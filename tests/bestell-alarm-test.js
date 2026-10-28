// BESTELL-ALARM (28.10.2026). Ibo: "siehst du das rote, muss das sein?"
//  - Die rote Karte meldete beim Umschalten auf "Gestern" eine Bestellung vom
//    Vortag als "Neue Bestellung" (gemessen in der Vorschau).
//  - Sie doppelte den Vollbild-Alarm.
//  - Der Vollbild-Alarm war noch der alte, nicht der Entwurf.
// Der Test FUEHRT die Funktionen aus.
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
// ---- 1. Nur frische Bestellungen loesen die Karte aus ----
var r = fn('updateOrderStats');
t('Karte nur fuer Bestellungen der letzten 15 Minuten', /var _frischAb = Date\.now\(\) - 15 \* 60000;/.test(r) && /_t >= _frischAb && typeof showNewOrderAlert === 'function'/.test(r), '');

// ---- 2. Kleine Karte nur, wenn der Vollbild-Alarm AUS ist ----
var gezeigt = 0, aus = '0';
var dok = { getElementById: function (id) { return id === 'dashboardView' ? {} : null; }, createElement: function () { gezeigt++; return { style: {}, querySelector: function () { return null; } }; }, head: { appendChild: function () {} }, body: { appendChild: function () {} } };
var Karte = new Function('document', 'window', 'localStorage', 'currentAdmin', 'setTimeout', fn('showNewOrderAlert') + '; return showNewOrderAlert;')(
    dok, { _alertedOrderIds: {}, getComputedStyle: function () { return { display: 'block' }; } }, { getItem: function () { return aus; } }, { isAdmin: true }, function () {});
Karte({ id: 'a', order_number: '1' });
t('Vollbild-Alarm an -> keine zusaetzliche Karte', gezeigt === 0, gezeigt);
aus = '1'; Karte({ id: 'b', order_number: '2' });
t('Vollbild-Alarm aus -> Karte als Ersatz', gezeigt > 0, gezeigt);
t('Karte im neuen Stil (dunkelgruen/gold, nicht rot-orange)', !/linear-gradient\(135deg,#ef4444,#f97316\)/.test(fn('showNewOrderAlert')) && /background:#00251e;color:#fff;border:2px solid #ffd54f;/.test(fn('showNewOrderAlert')), '');

// ---- 3. Vollbild-Alarm wie der Entwurf ----
var angehaengt = [], status = 'received', weg = 0;
var dok2 = { getElementById: function (id) { return id === 'newOrderAlarmOverlay' && angehaengt.length && !weg ? { remove: function () { weg++; }, getAttribute: function () { return 'o1'; } } : null; },
    createElement: function () { return { setAttribute: function () {}, style: {} }; }, body: { appendChild: function (e) { angehaengt.push(e); } } };
var code = ['_alarmEsc', 'kinSym', 'schnellZeiten', 'showNewOrderAlarm', 'dismissNewOrderAlarm', 'bestellAlarmStatus', 'bestellAlarmAnnehmen'].map(fn).join('\n');
var A = new Function('APP_DATA', 'document', 'localStorage', 'window', 'setInterval', 'clearInterval', 'setTimeout', 'schnellAnnehmen', 'zahlartKurz', 'dashboardOrders', 'showDashboardSection',
    'var KIN_SYM = { druck: "" }; var _orderAlarmInterval = null, _orderAlarmCount = 0; function bestellAlarmFuellen() {} function bestellAlarmSeit() {} function vorbereitungsMinuten() { return 0; }\n'
    + code + '; return { zeigen: showNewOrderAlarm, annehmen: bestellAlarmAnnehmen };')(
    { restaurants: [] }, dok2, { getItem: function () { return null; } }, { APP_DATA: { restaurants: [] } }, function () { return 1; }, function () {}, function () {},
    async function () {}, function (p) { return p === 'cash' ? 'Bar' : p; },
    [{ get id() { return 'o1'; }, get status() { return status; } }], function () {});
A.zeigen({ id: 'o1', order_number: '1043', order_type: 'pickup', customer_name: '<b>X</b>', total: 27.5, payment_method: 'cash' });
var h = angehaengt[0] && angehaengt[0].innerHTML || '';
t('Nummer gross, Art, Summe, Zahlart', /<b>#1043<\/b>/.test(h) && /ABHOLUNG/.test(h) && /27,50 €/.test(h) && />Bar</.test(h), h.slice(0, 300));
t('Name wird entschaerft', !/<b>X<\/b>/.test(h) && /&lt;b&gt;X/.test(h), '');
t('ein Tipp auf die Minuten nimmt an (15/20/30 bei Abholung)', (h.match(/onclick="bestellAlarmAnnehmen\('o1', (15|20|30)\)"/g) || []).length === 3, '');
t('Bon drucken und Ablehnen … (mit Nachfrage in rejectOrder)', /printKitchenBon\('o1'\)/.test(h) && /bestellAlarmAblehnen\('o1'\)/.test(h), '');
(async function () {
    await A.annehmen('o1', 20);
    t('Annehmen hat nicht geklappt (noch "neu") -> Alarm bleibt offen', weg === 0, weg);
    status = 'accepted';
    await A.annehmen('o1', 20);
    t('angenommen -> Alarm zu', weg === 1, weg);
    // ---- 4. Der Tischruf bleibt unberuehrt ----
    t('der Tischruf-Alarm ruft nichts vom Bestell-Alarm auf', fn('zeigeTischRuf').indexOf('bestellAlarm') < 0, '');
    t('… der Bestell-Alarm reicht die Gerichte nach', /bestellAlarmFuellen\(oid, 0\);/.test(fn('showNewOrderAlarm')), '');
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})();
