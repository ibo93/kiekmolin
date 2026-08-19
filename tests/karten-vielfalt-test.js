// GEHT DAS AUCH BEI ANDEREN KARTEN?
//
// Bis hierher war alles an genau EINER Karte gemessen (Pronto Pronto, Riepe).
// Das beantwortet die Frage nicht, die zählt: funktioniert es bei jeder
// Karte, die ein Gastronom bringt?
//
// Diese Datei prüft fünf Karten in verschiedenen Layouts. Sie sind mit
// Chromium als echte PDFs gedruckt und dann mit pdf.js 2.16.105 gelesen --
// derselben Fassung, die im Browser läuft. tests/daten/proben/karten.json
// ist diese Ausgabe, unverändert. Die zugehörigen PDFs liegen daneben.
//
// Die Wahrheit ist bekannt, weil die Karten hier erzeugt wurden -- sie ist
// keine nachträgliche Behauptung.
//
// Drei Fehler haben diese fünf Karten aufgedeckt, die an der großen Karte
// nie aufgefallen wären:
//   1. "mindestens 20 Wörter" und "mindestens 300 Zeichen" sperrten jede
//      kleine Karte aus. Ein Cafe mit acht Gerichten bekam "kein Text im
//      PDF" -- obwohl der Text vollständig da war.
//   2. "mindestens 5 Wörter an einer Spaltenkante": auf einer dreispaltigen
//      Karte mit sieben Gerichten hat eine Spalte nur vier Einträge. Alle
//      Kanten bis auf eine fielen weg, drei Spalten klebten zusammen.
//   3. Eine rechtsbündige Preisspalte sieht aus wie eine Textspalte. Wer
//      dort trennt, reisst Name und Preis auseinander -- übrig bleibt ein
//      Preis ohne Gericht.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var KARTEN = JSON.parse(fs.readFileSync(KMI + '/tests/daten/proben/karten.json', 'utf8'));

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var F = new Function(vorspann + '\n' + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems',
    '_nrWert', 'sortiereNachNummer'].map(schneide).join('\n')
    + '; return { pdfSeiteZuText: pdfSeiteZuText, parseKartenText: parseKartenText,'
    + ' pdfGerichteZuItems: pdfGerichteZuItems, sortiereNachNummer: sortiereNachNummer };')();

// Derselbe Ablauf wie leseKartePdf in der App.
function lies(seiten) {
    var texte = seiten.map(function (s) { return F.pdfSeiteZuText(s.items, s.w); }).filter(Boolean);
    if (!texte.length) return null;
    var kopf = null;
    texte.forEach(function (txt) {
        var k = txt.split('\n').filter(function (z) { return z.slice(0, 3) === '## '; })
                   .map(function (z) { return z.slice(3).trim(); });
        kopf = (kopf === null) ? k : kopf.filter(function (x) { return k.indexOf(x) >= 0; });
    });
    if (texte.length > 1 && kopf && kopf.length) {
        texte = texte.map(function (txt) {
            return txt.split('\n').filter(function (z) {
                return !(z.slice(0, 3) === '## ' && kopf.indexOf(z.slice(3).trim()) >= 0);
            }).join('\n');
        });
    }
    var g = [], lk = '';
    texte.forEach(function (txt) {
        var teil = F.parseKartenText(txt, lk);
        if (teil.length) lk = teil[teil.length - 1].kat;
        g = g.concat(teil);
    });
    return F.sortiereNachNummer(F.pdfGerichteZuItems(g));
}

KARTEN.forEach(function (karte) {
    var w = karte.wahrheit;
    var items = lies(karte.seiten);
    var vor = '[' + karte.name + '] ';

    t(vor + 'wird ueberhaupt gelesen', !!items && items.length > 0, items ? '0 Gerichte' : 'kein Text erkannt');
    if (!items || !items.length) return;

    t(vor + w.gerichte + ' Gerichte', items.length === w.gerichte, items.length);

    var kats = [];
    items.forEach(function (i) { if (kats.indexOf(i.category) < 0) kats.push(i.category); });
    t(vor + 'Kategorien: ' + w.kategorien.join(' | '),
      JSON.stringify(kats) === JSON.stringify(w.kategorien), kats.join(' | '));

    t(vor + 'kein Gericht ohne Preis',
      items.every(function (i) { return i.price > 0; }),
      (items.filter(function (i) { return !i.price; })[0] || {}).name);
    t(vor + 'kein Preis als Gericht gelandet',
      !items.some(function (i) { return /^\s*\d{1,3}[.,]\d{2}/.test(i.name); }),
      (items.filter(function (i) { return /^\s*\d{1,3}[.,]\d{2}/.test(i.name); })[0] || {}).name);
    t(vor + 'keine Fuellpunkte im Namen',
      !items.some(function (i) { return /\.{3,}|…/.test(i.name); }),
      (items.filter(function (i) { return /\.{3,}|…/.test(i.name); })[0] || {}).name);

    (w.proben || []).forEach(function (p) {
        var g = items.filter(function (i) { return i.name === p.name; })[0];
        if (!g) { t(vor + '"' + p.name + '" ist da', false, 'fehlt'); return; }
        if (p.nr !== undefined) t(vor + p.name + ': Nummer ' + p.nr, g.dish_number === p.nr, g.dish_number);
        if (p.preis !== undefined) t(vor + p.name + ': Preis ' + p.preis, g.price === p.preis, g.price);
        if (p.kat !== undefined) t(vor + p.name + ': unter "' + p.kat + '"', g.category === p.kat, g.category);
        if (p.besch !== undefined) t(vor + p.name + ': Zutaten', g.description === p.besch, '"' + g.description + '"');
        if (p.groessen !== undefined) {
            var ist = g.sizes ? g.sizes.map(function (x) { return x.name; }) : null;
            t(vor + p.name + ': Größen ' + JSON.stringify(p.groessen),
              JSON.stringify(ist) === JSON.stringify(p.groessen), JSON.stringify(ist));
        }
        if (p.allergene) t(vor + p.name + ': Allergene',
            JSON.stringify(g.allergens) === JSON.stringify(p.allergene), JSON.stringify(g.allergens));
        if (p.zusatz) t(vor + p.name + ': Zusatzstoffe',
            JSON.stringify(g.additives) === JSON.stringify(p.zusatz), JSON.stringify(g.additives));
    });
});

// --- Die drei Schwellen, die kleine Karten aussperrten ---------------------
t('keine Untergrenze von 20 Woertern mehr', /items\.length < 4\) return null/.test(H));
t('kein Mindestmass von 300 Zeichen mehr',
  /return text\.trim\(\) \? text : null/.test(H) && !/text\.length > 300/.test(H));
t('ein einziges Gericht reicht als Beweis', /if \(gerichte\.length < 1\)/.test(H));
t('Spaltenkante braucht keine 5 Woerter mehr', /Math\.max\(2, staerkste \* 0\.55\)/.test(H));
t('Preisspalten werden als solche erkannt und nicht getrennt',
  /function nurPreise/.test(H) && /preise \/ dort\.length >= 0\.8/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
