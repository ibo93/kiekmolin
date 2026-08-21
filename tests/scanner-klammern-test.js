// Prueft, dass der Menuescanner die Kennzeichnung von der Karte auch dann
// mitnimmt, wenn sie im Namen oder in der Beschreibung stehen geblieben ist.
//
// GEMESSEN, NICHT VERMUTET
//
// Von 554 Gerichten hatten 16 Allergene. Zwei Karten mit 133 und 142
// Gerichten standen auf glatt null -- beide nach dem Einbau der
// Allergen-Auswertung eingelesen, und beide DRUCKEN die Kennzeichnung.
//
// Der Parser gefuettert mit typischen Zeilen zeigte zwei Ursachen:
//
//   "12|Pizza Salami (1,2,a,c)|Tomate|9.50|Pizzen|||"  -> Allergene weg
//   "12|Pizza Salami|Tomate|9.50|Pizzen|a,c|1,2"        -> GERICHT weg
//
// Der erste Fall kostet die Kennzeichnung und laesst den Gast ein Gericht
// namens "Pizza Salami (1,2,a,c)" lesen. Der zweite kostet das ganze
// Gericht -- still, mitten in einer Karte mit 140 Positionen.

var KMI = require('path').join(__dirname, '..');
var K = require(KMI + '/netlify/functions/lib/scan-kern.js');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function lies(zeile) {
    var items = K.normalizeItems(K.parseAntwort(zeile));
    return items[0] || null;
}

console.log('\n-- Was vorher schon ging, geht weiter --');

var a = lies('12|Pizza Salami|Tomate, Kaese, Salami|9.50|Pizzen|gluten,milch|1,2|s');
t('Codes in den eigenen Feldern', a && a.allergens.join(',') === 'gluten,milch' && a.additives.join(',') === '1,2',
  JSON.stringify(a));
t('Name und Beschreibung unberuehrt', a.name === 'Pizza Salami' && a.description === 'Tomate, Kaese, Salami');

var b = lies('12|Pizza Salami|Tomate|9.50|Pizzen|a,c|1,2|');
t('Buchstaben werden uebersetzt (a=gluten, c=eier)', b.allergens.join(',') === 'gluten,eier', JSON.stringify(b.allergens));

console.log('\n-- Sieben Felder kosten kein Gericht mehr --');

var c = lies('12|Pizza Salami|Tomate|9.50|Pizzen|a,c|1,2');
t('das Gericht kommt an', c !== null, 'null');
t('mit Preis', c && c.price === 9.5, c && c.price);
t('und mit den Allergenen', c && c.allergens.join(',') === 'gluten,eier', c && c.allergens);

// Sechs Felder sind wirklich unvollstaendig -- da fehlt mehr als die Merkmale.
t('sechs Felder bleiben abgewiesen', K.parseAntwort('12|Pizza|Tomate|9.50|Pizzen|a,c').length === 0);

console.log('\n-- Klammern, die im Text stehen geblieben sind --');

[['im Namen', '12|Pizza Salami (1,2,a,c)|Tomate, Kaese|9.50|Pizzen|||'],
 ['in der Beschreibung', '12|Pizza Salami|Tomate, Kaese (1,2,a,c)|9.50|Pizzen|||']].forEach(function (f) {
    var r = lies(f[1]);
    t('Klammer ' + f[0] + ': Allergene werden gerettet',
      r && r.allergens.join(',') === 'gluten,eier', r && r.allergens);
    t('Klammer ' + f[0] + ': Zusatzstoffe werden gerettet',
      r && r.additives.join(',') === '1,2', r && r.additives);
    t('Klammer ' + f[0] + ': der Text ist sie los',
      r && r.name.indexOf('(') < 0 && r.description.indexOf('(') < 0,
      r && (r.name + ' / ' + r.description));
});

var d = lies('12|Pizza Salami|Tomate, Kaese (1,2,a,c)|9.50|Pizzen|||');
t('kein haengendes Komma und kein doppeltes Leerzeichen',
  d.description === 'Tomate, Kaese', '"' + d.description + '"');

var e = lies('12|Pizza Salami (a)|Tomate|9.50|Pizzen|c|1|');
t('Feld UND Klammer werden zusammengelegt',
  e.allergens.indexOf('gluten') >= 0 && e.allergens.indexOf('eier') >= 0, e.allergens);
t('nichts doppelt', e.allergens.length === 2, e.allergens);

console.log('\n-- Klammern, die bleiben muessen --');

// Der gefaehrliche Teil: zu gierig gefasst, und aus "(0,33 l)" wird ein
// Zusatzstoff, aus "(hausgemacht)" verschwindet ein Hinweis.
[['hausgemacht', '12|Pizza|Tomate (hausgemacht)|9.50|Pizzen|||', 'Tomate (hausgemacht)'],
 ['Flaschengroesse', '|Cola|Flasche (0,33 l)|3.20|Getränke|||', 'Flasche (0,33 l)'],
 ['scharf', '12|Pizza|Salami (scharf)|9.50|Pizzen|||', 'Salami (scharf)'],
 ['Herkunft', '12|Steak|Rind (Argentinien)|24.50|Fleisch|||', 'Rind (Argentinien)']].forEach(function (f) {
    var r = lies(f[1]);
    t('"(' + f[0] + ')" bleibt stehen', r && r.description === f[2], r && '"' + r.description + '"');
    t('"(' + f[0] + ')" wird nicht zu einem Code',
      r && r.allergens.length === 0 && r.additives.length === 0,
      r && (r.allergens + ' / ' + r.additives));
});

console.log('\n-- Es bleibt beim Nicht-Raten --');

// Die Regel im Prompt gilt unveraendert: nur was auf der Karte steht. Eine
// Beschreibung ohne Kennzeichnung ergibt weiterhin nichts -- auch wenn
// "Kaese" drinsteht.
var f2 = lies('12|Pizza Salami|Tomate, Kaese, Sahne, Weizenmehl|9.50|Pizzen|||');
t('aus Zutaten wird kein Allergen geraten', f2.allergens.length === 0, f2.allergens);

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
