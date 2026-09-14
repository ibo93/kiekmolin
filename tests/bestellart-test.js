// LIEFERUNG, ABHOLUNG, VOR ORT -- DREIMAL DIESELBE FRAGE, DREI ANTWORTEN.
//
// Nach dem card_on_delivery-Fehler am 14.09.2026 nachgesehen, ob es das
// Muster noch woanders gibt. Ja:
//
//   winorder.js     'Lieferung' / 'Vor Ort'    / 'Abholung'
//   order-email.js  'Lieferung' / 'Vor Ort'    / 'Abholung'
//   pos-print.js    'LIEFERUNG' / 'HIER ESSEN' / 'ABHOLUNG'
//   pos-orders.js   gar nicht -- nur der Rohwert
//
// Noch harmlos, weil alles deutsche Woerter sind -- "Vor Ort" in der Mail,
// "HIER ESSEN" auf dem Bon. Genau so harmlos sah card_on_delivery aus,
// bis ein vierter Wert dazukam und drei von vier Stellen ihn nicht
// kannten. Dann stand er roh auf der Rechnung eines Gastes.
//
// Die AUSWAHLKNOEPFE des Gastes bleiben absichtlich draussen: dort steht
// eine Einladung ("Hier essen"), hier eine Bezeichnung.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var B = require(path.join(KMI, 'netlify', 'functions', 'lib', 'bestellart.js'));
var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

console.log('\n-- Die drei Werte --');
t('delivery -> Lieferung', B.text('delivery') === 'Lieferung', B.text('delivery'));
t('pickup   -> Abholung', B.text('pickup') === 'Abholung', B.text('pickup'));
t('dine_in  -> Vor Ort', B.text('dine_in') === 'Vor Ort', B.text('dine_in'));
t('takeaway zaehlt auch als Abholung', B.text('takeaway') === 'Abholung', B.text('takeaway'));
t('Grossschreibung und Leerzeichen stoeren nicht', B.text(' DINE_IN ') === 'Vor Ort', B.text(' DINE_IN '));
t('leer -> Abholung (so war es vorher der letzte Zweig jedes Dreisatzes)',
  B.text('') === 'Abholung' && B.text(null) === 'Abholung');
t('ein unbekannter Wert wird NICHT roh durchgereicht',
  B.text('catering_neu') === 'Abholung', B.text('catering_neu'));
t('lieferung() nur bei delivery',
  B.lieferung('delivery') === true && B.lieferung('pickup') === false && B.lieferung('dine_in') === false);
t('vorOrt() nur bei dine_in',
  B.vorOrt('dine_in') === true && B.vorOrt('delivery') === false);

console.log('\n-- Alle Werte, die die App erzeugt, sind bekannt --');
// Aus dem Quelltext holen, nicht aus dem Gedaechtnis.
var ausApp = (h.match(/setOrderType\('([a-z_]+)'/g) || [])
    .map(function (x) { return x.replace(/setOrderType\('|'/g, ''); });
t('die Umschalter im Checkout wurden gefunden', ausApp.length >= 2, ausApp.join(', '));
var unbekannt = ausApp.filter(function (v) { return !B.bekannt(v); });
t('JEDE Bestellart, die ein Gast waehlen kann, ist der Bibliothek bekannt',
  unbekannt.length === 0, 'nicht bekannt: ' + unbekannt.join(', '));

console.log('\n-- Die vier Ausgaben sprechen mit einer Stimme --');
[['winorder.js', 'die Kasse'], ['order-email.js', 'die Mail'],
 ['pos-print.js', 'der Bon'], ['pos-orders.js', 'die Schnittstelle']].forEach(function (f) {
    var q = fs.readFileSync(path.join(KMI, 'netlify', 'functions', f[0]), 'utf8');
    t(f[1] + ' benutzt lib/bestellart', /require\('\.\/lib\/bestellart'\)/.test(q), 'eigene Liste');
    // Erster Anlauf: (text|lieferung|vorOrt). Die Gegenprobe "Mail nur
    // eingebunden, nicht benutzt" blieb dadurch gruen -- order-email ruft
    // vorOrt() an anderer Stelle ohnehin auf. Geprueft wird jetzt der
    // Aufruf, der die BEZEICHNUNG erzeugt.
    t(f[1] + ' ruft text() auch wirklich auf', /BESTELLART\.text\(/.test(q), 'nur eingebunden');
    t(f[1] + ' hat KEINEN eigenen Dreisatz mehr',
      !/order_type === 'delivery' \? '/.test(q), 'uebersetzt selbst');
});

console.log('\n-- Bon und Mail sagen jetzt dasselbe Wort --');
var V = require(path.join(__dirname, 'bon-vorschau.js'));
var bau = V.ladeBonBauer();
function bonText(typ) {
    return V.alsPapier(bau({ order_number: 'B-1', order_type: typ, total: 9, table_number: '5',
        items: [{ quantity: 1, name: 'Pizza' }] }, 'Pronto')).map(function (z) { return z.text; }).join('\n');
}
t('Bon bei dine_in: VOR ORT -- nicht mehr "HIER ESSEN"',
  /VOR ORT/.test(bonText('dine_in')) && !/HIER ESSEN/.test(bonText('dine_in')), 'altes Wort');
t('Bon bei delivery: LIEFERUNG', /LIEFERUNG/.test(bonText('delivery')));
t('Bon bei pickup: ABHOLUNG', /ABHOLUNG/.test(bonText('pickup')));
t('und es ist dasselbe Wort wie in der Mail, nur gross',
  bonText('dine_in').indexOf(B.text('dine_in').toUpperCase()) >= 0, 'weicht ab');

console.log('\n-- Auslieferung --');
var sw = fs.readFileSync(path.join(KMI, 'sw.js'), 'utf8');
var cm = sw.match(/kmi-shell-v(\d+)/);
t('sw.js hat eine Cache-Nummer', !!cm, 'keine gefunden');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
