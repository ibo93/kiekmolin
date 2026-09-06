// Prueft die WinOrder-Kassen-Schnittstelle (Pull) -- gegen die zwei Fehler,
// die bei der ersten echten Kassen-Anbindung (Colormetrics-Terminal, 31.08.2026)
// aufgetreten sind:
//
// 1. 401 trotz richtigem Schluessel: Netlify reicht der Funktion den
//    ORIGINAL-Pfad /wo/<restaurant>/<key>/<aktion> durch. Der Parser suchte
//    aber nur nach dem Segment 'winorder' -- Restaurant und Schluessel wurden
//    nie gefunden, jede Abfrage der Kasse prallte ab.
//
// 2. Die Bestell-Flut: dieselben Bestellungen kamen im Minutentakt immer
//    wieder in der Kasse an, bis das Terminal in die Knie ging. Ursache: die
//    Markierung "uebertragen" verliess sich auf SendTrackingStatus -- das
//    schickt WinOrder nicht zuverlaessig. Deshalb gilt jetzt: GetNewOrders
//    markiert SELBST beim Ausliefern, und was nicht markiert werden kann,
//    wird gar nicht erst ausgeliefert. Eine Bestellung, die zweimal kommt,
//    ist hier kein Schoenheitsfehler -- sie wird zweimal gekocht.
//
// Beide Fehler sind hier wieder eingebaut worden (alte Fassung geladen):
// der Test wird damit rot. Quelle der Wahrheit ist das Verhalten des
// Handlers, nicht sein Quelltext.

var KMI = require('path').join(__dirname, '..');
var PF = KMI + '/netlify/functions/winorder.js';

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- Nachgebaute Datenbank -------------------------------------------------
// Zwei offene Bestellungen; PATCH mit winorder_sent_at markiert sie.
var DB = { orders: [], markierenKlappt: true };
var ANFRAGEN = [];

function neueLage() {
    DB.orders = [
        { id: 'o1', order_number: 'B-101', status: 'pending', order_type: 'pickup',
          created_at: '2026-08-31T10:00:00Z', customer_name: 'Max Muster',
          items: [{ name: 'Pizza Salami', quantity: 1, price: 10.5 }],
          subtotal: 10.5, delivery_fee: 0, tip: 0, discount: 0, total: 10.5, payment_method: 'cash' },
        { id: 'o2', order_number: 'B-102', status: 'pending', order_type: 'delivery',
          created_at: '2026-08-31T10:05:00Z', customer_name: 'Erna Beispiel',
          items: [{ name: 'Doener', quantity: 2, price: 13 }],
          delivery_address: { street: 'Musterstr.', house_number: '12', zip: '26506', city: 'Norden' },
          subtotal: 13, delivery_fee: 2.5, tip: 0, discount: 0, total: 15.5, payment_method: 'card' }
    ];
    DB.markierenKlappt = true;
    ANFRAGEN = [];
}

global.fetch = async function (url, opts) {
    url = String(url); opts = opts || {};
    var methode = opts.method || 'GET';
    ANFRAGEN.push(methode + ' ' + url);

    // Restaurant-Stammdaten (Auth-Pruefung)
    if (methode === 'GET' && url.indexOf('/rest/v1/restaurants') >= 0) {
        return { ok: true, status: 200, text: async function () { return ''; },
                 json: async function () { return [{ id: 'r1', name: 'Testhaus', pos_pull_key: 'k1' }]; } };
    }
    // Lebenszeichen-Stempel der Kasse (optional) -> einfach quittieren
    if (methode === 'PATCH' && url.indexOf('/rest/v1/restaurants') >= 0) {
        return { ok: true, status: 200, text: async function () { return ''; }, json: async function () { return []; } };
    }
    // Offene Bestellungen
    if (methode === 'GET' && url.indexOf('/rest/v1/orders') >= 0) {
        var offene = DB.orders.filter(function (o) { return !o.winorder_sent_at; });
        return { ok: true, status: 200, text: async function () { return ''; },
                 json: async function () { return offene; } };
    }
    // Markieren als uebertragen
    if (methode === 'PATCH' && url.indexOf('/rest/v1/orders') >= 0) {
        if (!DB.markierenKlappt) {
            return { ok: false, status: 401, text: async function () { return 'RLS: kein Schreibrecht'; },
                     json: async function () { return {}; } };
        }
        var m = /id=(?:in\.\(([^)]*)\)|eq\.([^&]+))/.exec(url);
        var ids = m ? (m[1] ? m[1].split(',') : [m[2]]) : [];
        ids.map(decodeURIComponent).forEach(function (id) {
            DB.orders.forEach(function (o) { if (o.id === id) o.winorder_sent_at = 'jetzt'; });
        });
        return { ok: true, status: 200, text: async function () { return ''; }, json: async function () { return []; } };
    }
    return { ok: false, status: 404, text: async function () { return 'unbekannt: ' + url; }, json: async function () { return {}; } };
};

delete require.cache[require.resolve(PF)];
var handler = require(PF).handler;

async function abruf(pfad, extra) {
    var ev = Object.assign({ httpMethod: 'GET', path: pfad, queryStringParameters: {} }, extra || {});
    var r = await handler(ev);
    var body = {}; try { body = JSON.parse(r.body || '{}'); } catch (e) {}
    return { code: r.statusCode, body: body,
             bestellungen: (body.OrderList && body.OrderList.Order) || [] };
}

(async function () {

console.log('\n-- Der Pfad, den die Kasse WIRKLICH benutzt --');

neueLage();
var r = await abruf('/wo/r1/k1/GetNewOrders');
t('GetNewOrders ueber /wo/... antwortet 200 (nicht 401 wie am 31.08.)',
  r.code === 200, r.code + ' ' + JSON.stringify(r.body).slice(0, 120));
t('und liefert beide offenen Bestellungen',
  r.bestellungen.length === 2, r.bestellungen.length + ' Bestellungen');
t('als WinOrder-Format mit OrderID',
  r.bestellungen.length === 2 && r.bestellungen[0].OrderID === 'o1',
  JSON.stringify(r.bestellungen[0] || {}).slice(0, 120));

neueLage();
r = await abruf('/.netlify/functions/winorder/r1/k1/GetNewOrders');
t('auch der interne Funktions-Pfad geht weiterhin', r.code === 200 && r.bestellungen.length === 2, r.code);

neueLage();
r = await abruf('/wo/r1/k1/GetNewOrders', { rawUrl: 'https://kiekmolin.de/wo/r1/k1/GetNewOrders' });
t('auch mit rawUrl (so ruft Netlify wirklich auf)', r.code === 200 && r.bestellungen.length === 2, r.code);

console.log('\n-- Der Schluessel schuetzt weiterhin --');

neueLage();
r = await abruf('/wo/r1/FALSCHER-SCHLUESSEL/GetNewOrders');
t('falscher Schluessel: 401', r.code === 401, r.code);
t('und es wird keine einzige Bestellung verraten', r.bestellungen.length === 0, r.bestellungen.length);

neueLage();
r = await abruf('/wo/GetNewOrders');
t('ohne Restaurant und Schluessel: 401', r.code === 401, r.code);

console.log('\n-- Die Flut: jede Bestellung kommt genau EINMAL --');

neueLage();
var erster = await abruf('/wo/r1/k1/GetNewOrders');
var markiert = ANFRAGEN.some(function (a) { return a.indexOf('PATCH') === 0 && a.indexOf('/rest/v1/orders') > 0; });
t('beim Ausliefern wird sofort markiert (nicht erst auf SendTrackingStatus gewartet)',
  erster.bestellungen.length === 2 && markiert, 'markiert=' + markiert);

var zweiter = await abruf('/wo/r1/k1/GetNewOrders');
t('der zweite Abruf eine Minute spaeter ist LEER -- keine Bestellung kommt doppelt',
  zweiter.bestellungen.length === 0, zweiter.bestellungen.length + ' kamen erneut (die Flut vom 31.08.)');

console.log('\n-- Wenn das Markieren nicht klappt, lieber nichts als Dauerschleife --');

neueLage();
DB.markierenKlappt = false;
r = await abruf('/wo/r1/k1/GetNewOrders');
t('Markieren schlaegt fehl -> 200 mit LEERER Liste (nichts ausliefern, was wiederkommen wuerde)',
  r.code === 200 && r.bestellungen.length === 0,
  r.code + ' / ' + r.bestellungen.length + ' ausgeliefert');
t('und die Bestellungen bleiben unmarkiert fuer spaeter erhalten',
  DB.orders.filter(function (o) { return !o.winorder_sent_at; }).length === 2,
  JSON.stringify(DB.orders.map(function (o) { return !!o.winorder_sent_at; })));

console.log('\n' + ok + '/' + n + ' bestanden');
process.exit(ok === n ? 0 : 1);

})().catch(function (e) { console.log('FAIL | Testlauf abgestuerzt: ' + e.message); process.exit(1); });
