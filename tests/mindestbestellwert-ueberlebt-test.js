// DER WERT, DER JEDES ANMELDEN NICHT UEBERLEBTE.
//
// Gemeldet am 04.09.2026: "es uebernimmt die 18 aber dann wenn ich mich
// neu anmelden geht weg."
//
// Damit war klar, was vorher nicht klar war: GESCHRIEBEN wird richtig.
// Das Speichern meldete Erfolg, die Datenbank nahm die 18. Nur nach dem
// naechsten Anmelden stand wieder 0 da.
//
// URSACHE, im Quelltext gefunden, ohne Server:
//
// mapRestaurant() baut aus jeder Datenbank-Zeile ein NEUES Objekt mit
// fester Feldliste. Was dort nicht aufgezaehlt ist, existiert danach
// nicht mehr. min_order_value stand nicht in der Liste.
//
//     delivery_fee:    r.delivery_fee || 0,      <- drin, blieb stehen
//     delivery_radius: r.delivery_radius || 0,   <- drin, blieb stehen
//                                                <- min_order_value fehlte
//
// Also: nach jedem Laden undefined, Number(undefined) || 0 ergibt 0,
// Feld zeigt 0. Bei JEDEM Restaurant -- deshalb "ueberall".
//
// Und der Gast liest aus derselben Liste (currentOrderRestaurant kommt
// aus APP_DATA.restaurants). Der Mindestbestellwert hat also nie
// gegriffen, fuer niemanden.
//
// Warum es monatelang unsichtbar blieb: eine 0 sieht aus wie eine
// Antwort, nicht wie ein Fehler (Regel 6). Und der Nachbar delivery_fee
// blieb stehen -- es sah aus, als funktioniere die Maske.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- 1. mapRestaurant wirklich laufen lassen --------------------------
console.log('-- Was aus einer Datenbank-Zeile wird --');

var a = h.indexOf('function mapRestaurant(r) {');
var e = h.indexOf('\n}\n', a) + 3;
t('mapRestaurant gefunden', a > 0 && e > a, a + '/' + e);

var ctx = {
    _restCoord: function () { return 0; },
    Number: Number, parseFloat: parseFloat, String: String, console: console
};
vm.createContext(ctx);
vm.runInContext(h.slice(a, e), ctx);

// Genau so, wie PostgREST eine Zeile liefert: numeric kommt als Text.
var zeile = {
    id: 'r1', name: 'Pizzeria Pronto Riepe',
    delivery_fee: 3.5, delivery_radius: 10,
    min_order_value: '18.00',
    free_delivery_from: '25.00'
};
var drin = ctx.mapRestaurant(zeile);

t('der Mindestbestellwert ueberlebt das Laden', drin.min_order_value === 18, drin.min_order_value);
t('und er ist eine Zahl, kein Text', typeof drin.min_order_value === 'number', typeof drin.min_order_value);
t('die Liefergebuehr auch (die ging nie verloren)', drin.delivery_fee === 3.5, drin.delivery_fee);
t('der Lieferradius auch', drin.delivery_radius === 10, drin.delivery_radius);
t('free_delivery_from ebenfalls', drin.free_delivery_from === 25, drin.free_delivery_from);

// ---- 2. Der Fall, der es unsichtbar machte ---------------------------
console.log('\n-- Eine echte 0 und ein fehlender Wert sind zweierlei --');

var nullZeile = ctx.mapRestaurant({ id: 'r2', name: 'Ohne', min_order_value: 0 });
t('0 bleibt 0', nullZeile.min_order_value === 0, nullZeile.min_order_value);
t('und nicht undefined', nullZeile.min_order_value !== undefined, 'undefined');

var fehlt = ctx.mapRestaurant({ id: 'r3', name: 'Fehlt' });
t('fehlt die Spalte, wird daraus 0 statt undefined',
  fehlt.min_order_value === 0, fehlt.min_order_value);

// ---- 3. Und der Ladepfad zeigt ihn dann auch -------------------------
console.log('\n-- Was das Feld danach anzeigt --');

var la = h.indexOf("    var minOrderEl = document.getElementById('settingMinOrder');");
var le = h.indexOf('// Wartezeiten laden', la);
var bauA = h.indexOf('function minOrderHinweisBauen(el, lokal, server) {');
var bauE = h.indexOf('window.minOrderLokalVerwerfen = minOrderLokalVerwerfen;');
t('der Ladeabschnitt liess sich finden', la > 0 && le > la, la + '/' + le);

function knoten() {
    return { textContent: '', type: '', onclick: null, style: { display: 'none', cssText: '' },
             kinder: [], appendChild: function (k) { this.kinder.push(k); } };
}
var feld = { value: null }, warn = knoten();
var welt = {
    restId: 'r1',
    restaurant: drin,                       // <- das ECHTE Ergebnis von oben
    document: {
        getElementById: function (id) {
            if (id === 'settingMinOrder')  return feld;
            if (id === 'minOrderNurLokal') return warn;
            return null;
        },
        createElement: knoten
    },
    localStorage: { getItem: function () { return null; } },
    Number: Number, parseFloat: parseFloat
};
welt.window = welt;
vm.createContext(welt);
vm.runInContext(h.slice(bauA, bauE) + '\n' + h.slice(la, le), welt);

t('nach dem Anmelden stehen 18 € im Feld, nicht 0', feld.value === 18, feld.value);
t('und es wird nicht mehr gewarnt', warn.style.display === 'none', warn.style.display);

// ---- 4. Der Gast liest aus derselben Liste ---------------------------
console.log('\n-- Der Gast --');
t('currentOrderRestaurant kommt aus APP_DATA.restaurants',
  /APP_DATA\.restaurants\.find\(function\(r\) \{ return r\.id === order\.restaurant_id; \}\)/.test(h),
  'Herkunft geaendert -- dieser Test muss nachgezogen werden');
t('und der Warenkorb liest min_order_value davon',
  /currentOrderRestaurant\.min_order_value/.test(h), 'liest woanders');

// ---- 5. Beide Karten, nicht nur eine ---------------------------------
console.log('\n-- Es gibt zwei Stellen, die abbilden --');
var karten = (h.match(/min_order_value: r\.min_order_value != null \? Number\(r\.min_order_value\) : 0/g) || []).length;
t('beide Abbildungen fuehren den Wert mit', karten === 2, karten + ' statt 2');

// ---- 6. Die Aenderung erreicht die Geraete ---------------------------
console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var nr = (sw.match(/kmi-shell-v(\d+)/) || [])[1];
t('sw.js steht mindestens auf v13', Number(nr) >= 13, 'v' + nr);

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
