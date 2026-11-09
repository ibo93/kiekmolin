// BLUETOOTH-DRUCK (08.11.2026).
//
// Ibo: "Die Drucker sind teuer die Epson ... lass dich was erfinden mit
// guenstigen Drucker zu arbeiten mit Bluetooth" und "automatisch drucken,
// wenn man die Bestellung annimmt".
//
// In der Bau-Umgebung gibt es kein Bluetooth. Diese Datei baut deshalb einen
// Drucker nach (navigator.bluetooth, GATT, Schreib-Kanal) und laesst den
// echten Code aus index.html dagegen laufen. Gefragt wird vor allem:
// Wie sieht es aus, wenn es kaputt ist?
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
function zeile(re) { var m = re.exec(H); if (!m) throw new Error('fehlt: ' + re); return m[0]; }
function block(start, ende) { var i = H.indexOf(start); if (i < 0) throw new Error('fehlt: ' + start); return H.slice(i, H.indexOf(ende, i) + ende.length); }

function welt(opt) {
    opt = opt || {};
    var speicher = {}, toasts = [], ereignisse = [], geschrieben = [], horcher = {};
    var kanal = {
        properties: { writeWithoutResponse: true, write: true },
        writeValueWithoutResponse: async function (b) {
            if (opt.maxStueck && b.length > opt.maxStueck) throw new Error('GATT operation failed');
            if (opt.kaputt) throw new Error('GATT Server is disconnected');
            geschrieben.push(Array.from(b));
        }
    };
    var geraet = {
        id: 'dev-1', name: opt.name || 'MPT-II',
        gatt: { connect: async function () { if (opt.verweigert) throw new Error('Verbindung abgelehnt'); return { getPrimaryServices: async function () { return [{ getCharacteristics: async function () { return [{ properties: { notify: true } }, kanal]; } }]; } }; } },
        addEventListener: function (e, f) { horcher[e] = f; }
    };
    var nav = opt.ohneBt ? { userAgent: opt.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari' } : {
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
        bluetooth: { requestDevice: async function (o) { welt.anfrage = o; if (opt.abbruch) { var e = new Error('cancel'); e.name = 'NotFoundError'; throw e; } return geraet; },
                     getDevices: async function () { return [geraet]; } }
    };
    var dok = { getElementById: function () { return null; }, body: { appendChild: function () {} }, createElement: function () { return { setAttribute: function () {} }; }, addEventListener: function () {}, visibilityState: 'visible' };
    var ls = { getItem: function (k) { return k in speicher ? speicher[k] : null; }, setItem: function (k, v) { speicher[k] = String(v); } };
    var code = [zeile(/var BT_DIENSTE = \[[\s\S]*?\];/), zeile(/var BT_GEDRUCKT_SCHLUESSEL = [^\n]+/), zeile(/var BT_STUECK_GROSS = [^\n]+/),
        zeile(/var _bt = \{[^\n]+/), zeile(/var BT_PC437 = \{[^\n]+/), zeile(/var BT_ANGENOMMEN = [^\n]+/),
        'var PRINTER_ROLES = [];',
        ['getPrinterSettings', 'savePrinterSettings', 'getPrinterList', 'setPrinterList', 'filterItemsByRole',
         'btMoeglich', 'btNichtMoeglichText', 'btBytes', 'btGedrucktLesen', 'btIstGedruckt', 'btAlsGedrucktMerken', 'btDruckerFuer',
         'btKanalSuchen', 'btAnmelden', 'btVerbinden', 'btWiederAnmelden', 'btAlleBtDrucker', 'btGetrennt', 'btBalken', 'btSchreiben',
         'btDrucken', 'btWarteschlangeAbarbeiten', 'btKuecheNachziehen'].map(fn).join('\n')].join('\n');
    var f = new Function('navigator', 'document', 'localStorage', 'showToast', 'logRestaurantEvent', 'generateESCPOS', 'escapeHtml', 'setTimeout', 'window',
        code + '; return { bt: _bt, moeglich: btMoeglich, nein: btNichtMoeglichText, bytes: btBytes, verbinden: btVerbinden, wieder: btWiederAnmelden, drucken: btDrucken, kueche: btKuecheNachziehen, liste: getPrinterList, setzen: setPrinterList, gedruckt: btIstGedruckt, getrennt: btGetrennt, abarbeiten: btWarteschlangeAbarbeiten, dienste: BT_DIENSTE };');
    var timer = [];
    var api = f(nav, dok, ls, function (m, a) { toasts.push([m, a]); }, function () { ereignisse.push(Array.from(arguments)); },
        function (o) { return '\x1B@BON #' + (o.order_number || o.id) + '\nGrillteller für Jürgen 12,50 €\n'; },
        function (s) { return String(s); }, function (fx, ms) { if (ms < 100) return setTimeout(fx, 0); timer.push([fx, ms]); }, {});
    return { api: api, toasts: toasts, ereignisse: ereignisse, geschrieben: geschrieben, horcher: horcher, opt: opt, timer: timer, geraet: geraet, speicher: speicher };
}
function warte() { return new Promise(function (r) { setTimeout(r, 5); }); }
function text(w) { return w.geschrieben.map(function (b) { return String.fromCharCode.apply(null, b); }).join(''); }

(async function () {
    // ---- geht es auf diesem Geraet? ----
    var W = welt({ ohneBt: true });
    t('iPhone: nicht moeglich, mit klarem Satz statt totem Knopf', W.api.moeglich() === false && /iPhone und iPad/.test(W.api.nein()), W.api.nein());
    t('iPhone: Verbinden versucht nichts, sagt es', (await W.api.verbinden('r1')) === false && /iPhone/.test(W.toasts[0][0]) && W.toasts[0][1] === 'error', JSON.stringify(W.toasts));

    // ---- Bytes ----
    W = welt();
    var b = Array.from(W.api.bytes('\x1B@Jürgen ÄÖÜß 9,50 € „gut“'));
    t('Druckerschrift PC437 wird nach dem Zuruecksetzen gewaehlt (ESC t 0)', b[0] === 0x1B && b[1] === 0x40 && b[2] === 0x1B && b[3] === 0x74 && b[4] === 0x00, b.slice(0, 6));
    t('Umlaute bekommen ihre PC437-Nummer', b.indexOf(0x81) > 0 && b.indexOf(0x8E) > 0 && b.indexOf(0x99) > 0 && b.indexOf(0x9A) > 0 && b.indexOf(0xE1) > 0, b);
    t('Euro -> "EUR", deutsche Anfuehrungszeichen -> "', /9,50 EUR "gut"/.test(String.fromCharCode.apply(null, b)), String.fromCharCode.apply(null, b));
    t('Kein Byte ueber 255 (Uint8)', b.every(function (x) { return x >= 0 && x < 256; }), '');

    // ---- verbinden ----
    t('Abbrechen in der Geraeteliste ist kein Fehler', (await welt({ abbruch: true }).api.verbinden('r1')) === false, '');
    W = welt();
    var v = await W.api.verbinden('r1');
    t('Verbinden: Drucker angemeldet, Name gemerkt', v === true && W.api.bt.verbunden === true && W.api.bt.name === 'MPT-II' && /verbunden: MPT-II/.test(W.toasts[0][0]), JSON.stringify(W.toasts));
    t('Chrome bekommt die Dienste guenstiger Drucker vorher genannt', welt.anfrage.acceptAllDevices === true && welt.anfrage.optionalServices.indexOf('000018f0-0000-1000-8000-00805f9b34fb') >= 0 && welt.anfrage.optionalServices.length >= 6, JSON.stringify(welt.anfrage));
    var l = W.api.liste('r1');
    t('Im Drucker-Verzeichnis dieses Geraets gemerkt (Typ bluetooth, automatisch)', l.length === 1 && l[0].type === 'bluetooth' && l[0].geraet_id === 'dev-1' && l[0].autoprint === true, JSON.stringify(l));
    await W.api.verbinden('r1');
    t('Zweites Verbinden legt keinen zweiten Drucker an', W.api.liste('r1').length === 1, W.api.liste('r1').length);
    t('Horcht auf Verbindungsabbruch', typeof W.horcher.gattserverdisconnected === 'function', '');

    // ---- drucken ----
    var o = { id: 'o1', order_number: '17', restaurant_id: 'r1', status: 'accepted', items: [{ name: 'Grillteller', quantity: 1, price: 12.5 }] };
    var d = await W.api.drucken(o);
    t('Drucken schickt den Bon (Text kommt an)', d === true && /BON #17/.test(text(W)) && /Grillteller/.test(text(W)), text(W));
    var vorher = W.geschrieben.length;
    await W.api.drucken(o);
    t('Automatisch: dieselbe Bestellung nur EINMAL', W.geschrieben.length === vorher, W.geschrieben.length + ' vs ' + vorher);
    await W.api.drucken(o, { manuell: true });
    t('Nachdruck von Hand geht immer', W.geschrieben.length > vorher, '');

    // ---- grosse Stuecke abgelehnt -> 20 Byte ----
    W = welt({ maxStueck: 20 }); await W.api.verbinden('r1');
    var lang = { id: 'o2', order_number: 'X'.repeat(300), items: [] };
    d = await W.api.drucken(lang);
    t('Lehnt der Drucker grosse Stuecke ab: weiter mit 20 Byte, alles kommt an', d === true && W.geschrieben.every(function (s) { return s.length <= 20; }) && text(W).indexOf('X'.repeat(300)) >= 0, W.geschrieben.map(function (s) { return s.length; }).slice(0, 5));

    // ---- Abbruch: Warteschlange, Balken, Meldung ----
    W = welt(); await W.api.verbinden('r1');
    W.horcher.gattserverdisconnected();
    t('Abbruch: als getrennt markiert, Wiederverbinden geplant (2 s)', W.api.bt.verbunden === false && W.timer.length === 1 && W.timer[0][1] === 2000, JSON.stringify(W.timer.map(function (x) { return x[1]; })));
    d = await W.api.drucken({ id: 'o3', order_number: '18', restaurant_id: 'r1' });
    t('Getrennt: Bon geht NICHT verloren, sondern in die Warteschlange', d === false && W.api.bt.warteschlange.length === 1 && W.geschrieben.length === 0, W.api.bt.warteschlange.length);
    await W.api.drucken({ id: 'o3', order_number: '18', restaurant_id: 'r1' });
    t('Dieselbe Bestellung steht nur einmal in der Warteschlange', W.api.bt.warteschlange.length === 1, W.api.bt.warteschlange.length);
    W.timer[0][0](); await warte(); await warte();
    t('Nach dem Wiederverbinden wird die Warteschlange gedruckt', W.api.bt.verbunden === true && W.api.bt.warteschlange.length === 0 && /BON #18/.test(text(W)), text(W));

    W = welt({ kaputt: true }); await W.api.verbinden('r1');
    d = await W.api.drucken({ id: 'o4', order_number: '19', restaurant_id: 'r1' });
    t('Schreiben scheitert: false, Warteschlange, Ereignis print_failed', d === false && W.api.bt.warteschlange.length === 1 && W.ereignisse.length === 1 && W.ereignisse[0][1] === 'print_failed' && /Bluetooth/.test(W.ereignisse[0][2]), JSON.stringify(W.ereignisse));
    t('Gescheiterter Bon gilt NICHT als gedruckt', W.api.gedruckt('o4') === false, '');

    W = welt(); await W.api.verbinden('r1');
    for (var i = 0; i < 3; i++) { W.api.getrennt(); }
    var vor = W.timer.length; W.api.getrennt();
    t('Von selbst hoechstens dreimal neu verbinden, dann bleibt der rote Balken', vor === 3 && W.timer.length === 3, W.timer.length);

    // ---- Kuechen-Display: angenommen auf einem anderen Handy ----
    W = welt(); await W.api.verbinden('r1');
    var jetzt = Date.parse('2026-11-08T19:00:00Z');
    var liste = [
        { id: 'k1', status: 'received', created_at: '2026-11-08T18:59:00Z' },
        { id: 'k2', status: 'accepted', accepted_at: '2026-11-08T18:59:30Z', order_number: '21' },
        { id: 'k3', status: 'preparing', accepted_at: '2026-11-08T18:30:00Z', order_number: '22' },
        { id: 'k4', status: 'ready', accepted_at: '2026-11-08T18:59:50Z', order_number: '23' }
    ];
    var g = W.api.kueche(liste, 'r1', true, jetzt); await warte();
    t('Erster Lauf: nur frisch angenommene (< 3 Min) drucken, offene und fertige nicht', JSON.stringify(g) === '["k2"]', JSON.stringify(g));
    t('Erster Lauf: aeltere gelten als erledigt (kein Nachdrucken des ganzen Abends)', W.api.gedruckt('k3') === true, '');
    liste[0].status = 'accepted'; liste[0].accepted_at = '2026-11-08T19:00:10Z'; liste[0].order_number = '20';
    g = W.api.kueche(liste, 'r1', false, jetzt + 15000); await warte();
    t('Spaeter angenommen (z. B. am Handy des Kellners): wird gedruckt', JSON.stringify(g) === '["k1"]' && /BON #20/.test(text(W)), JSON.stringify(g));
    g = W.api.kueche(liste, 'r1', false, jetzt + 30000);
    t('Naechste Aktualisierung: nichts doppelt', g.length === 0, JSON.stringify(g));
    var W2 = welt();
    t('Ohne Bluetooth-Drucker auf diesem Geraet: Kuechen-Display druckt nichts', W2.api.kueche(liste, 'r1', false, jetzt).length === 0, '');

    // ---- Einbau ----
    t('Verteiler kennt den Typ bluetooth', /p\.type === 'bluetooth'\) \{\s*\/\/[^\n]*\n\s*var okB = await btDrucken\(orderForPrint, \{ manuell: bonType === 'manual' \}\);/.test(H), '');
    t('Kuechen-Display zieht Bluetooth-Druck nach', /btKuecheNachziehen\(orders, restaurantId, !!window\._kdsFirstLoad\)/.test(H), '');
    t('Nachziehen steht VOR dem Umschalten von _kdsFirstLoad', H.indexOf('btKuecheNachziehen(orders, restaurantId') < H.indexOf("window._kdsFirstLoad = false;", H.indexOf('btKuecheNachziehen(orders, restaurantId')), '');
    t('Annehmen druckt weiter automatisch (printKitchenBon)', /if \(autoPrintKitchenBon && !_nurZeit\) \{\s*setTimeout\(function\(\) \{ printKitchenBon\(currentAcceptOrderId\); \}, 500\);/.test(H), '');
    t('Kuechen-Display haelt den Bildschirm wach und gibt ihn beim Schliessen frei', /kinBildschirmWach\(true\);\s*btWiederAnmelden\(\);/.test(H) && /kinBildschirmWach\(false\);/.test(fn('closeKitchenDisplay')), '');
    t('Typ in der Auswahl', /<option value="bluetooth"' \+ typeBT \+ '>Bluetooth \(günstige Drucker, Android-Tablet mit Chrome\)<\/option>/.test(H), '');
    t('Roter Balken: role=alert, oben, ueber allem', /b\.setAttribute\('role', 'alert'\)/.test(fn('btBalken')) && /\.bt-balken \{ position: fixed; top: 0;[^}]*z-index: 30000;/.test(H), '');
    var sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    t('sw.js CACHE hochgezaehlt (mind. v133)', parseInt((/kmi-shell-v(\d+)/.exec(sw) || [])[1], 10) >= 133, '');

    console.log('\n' + ok + '/' + n + ' OK');
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
