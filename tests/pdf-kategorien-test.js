// PDF-Karte: Kategorien so übernehmen, wie sie gedruckt sind.
//
// Ibo, 07.10.2026: "auch kategorie besser lesen so annehmen".
//
// Gemessen am selben Tag mit echten PDFs (Chromium druckt, pdf.js 2.16.105
// liest): von acht üblichen Arten, eine Überschrift zu setzen, erkannte der
// Leser ZWEI -- größer, oder fett bei normal gesetzten Gerichten. Bei
// Großbuchstaben, anderer Schrift, Farbe, Unterstreichung und bei fett
// gesetzten Gerichten landeten alle Gerichte unter dem Restaurantnamen.
//
// tests/daten/proben/ueberschriften.json ist die unveränderte Ausgabe von
// pdf.js für diese Karten (erzeugt wie werkzeug/pdf-karte-messen.js). Dazu
// eine Gegenprobe: eine Ein-Wort-Zutat unter jedem Gericht ist KEINE
// Kategorie (früher wurden "Salami"/"Thunfisch" so zu 55 Kategorien).
'use strict';
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var F = new Function(vorspann + '\n' + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems', '_nrWert', 'sortiereNachNummer']
    .map(schneide).join('\n') + '; return { pdfSeiteZuText: pdfSeiteZuText, parseKartenText: parseKartenText,'
    + ' pdfGerichteZuItems: pdfGerichteZuItems, sortiereNachNummer: sortiereNachNummer };')();
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function lies(seiten) {
    var g = [], lk = '';
    seiten.map(function (s) { return F.pdfSeiteZuText(s.items, s.w); }).filter(Boolean).forEach(function (txt) {
        var teil = F.parseKartenText(txt, lk); if (teil.length) lk = teil[teil.length - 1].kat; g = g.concat(teil);
    });
    return F.sortiereNachNummer(F.pdfGerichteZuItems(g));
}
var KARTEN = JSON.parse(fs.readFileSync(KMI + '/tests/daten/proben/ueberschriften.json', 'utf8'));
var GROSS = { 'GROSSBUCHSTABEN, normal': 1, 'GROSSBUCHSTABEN fett, Gerichte fett': 1 };
KARTEN.forEach(function (k) {
    var items = lies(k.seiten);
    var kats = [];
    items.forEach(function (i) { if (kats.indexOf(i.category) < 0) kats.push(i.category); });
    if (k.name === 'Ein-Wort-Zutat unter jedem Gericht') {
        t('[' + k.name + '] eine Kategorie "Pizza", 5 Gerichte', kats.length === 1 && kats[0] === 'Pizza' && items.length === 5, kats.join(' / '));
        t('[' + k.name + '] "Klassisch" bleibt Beschreibung', items[0] && items[0].description === 'Klassisch', items[0] && items[0].description);
        return;
    }
    var soll = GROSS[k.name] ? ['PIZZA', 'PASTA', 'SALATE'] : ['Pizza', 'Pasta', 'Salate'];
    t('[' + k.name + '] Kategorien wie gedruckt: ' + soll.join(' / '), JSON.stringify(kats) === JSON.stringify(soll), kats.join(' / '));
    t('[' + k.name + '] 5 Gerichte, keins unter dem Restaurantnamen',
      items.length === 5 && !items.some(function (i) { return /Imbiss/.test(i.category); }), items.length + ' ' + kats.join(' / '));
    var sp = items.filter(function (i) { return i.name === 'Spaghetti Bolognese'; })[0];
    t('[' + k.name + '] die Überschrift hängt nicht als Zutat am Gericht davor',
      !items.some(function (i) { return /\b(Pasta|Salate|PASTA|SALATE)\b/.test(i.description); }) && sp && sp.category === soll[1],
      JSON.stringify(items.map(function (i) { return i.description; })));
});

// Spaltenköpfe bleiben Größennamen, keine Kategorie (Pronto: "KLEIN GROSS").
var SEITEN = JSON.parse(fs.readFileSync(KMI + '/tests/daten/pronto-pdfjs.json', 'utf8'));
var pronto = lies(SEITEN);
t('Pronto Pronto: weiterhin 142 Gerichte', pronto.length === 142, pronto.length);
t('Pronto Pronto: "KLEIN GROSS" wird keine Kategorie', !pronto.some(function (i) { return /KLEIN|GROSS/.test(i.category); }), '');
var p1 = pronto.filter(function (i) { return i.dish_number === '1'; })[0] || {};
t('Pronto Pronto: Nr. 1 hat weiter klein/groß', JSON.stringify((p1.sizes || []).map(function (x) { return x.name; })) === '["klein","groß"]', JSON.stringify(p1.sizes));

console.log(n === ok ? '\nAlle ' + n + ' Tests bestanden.' : '\n' + (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.');
process.exit(n === ok ? 0 : 1);
