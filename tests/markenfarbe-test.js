// JEDER WIRT SEINE FARBE -- UND NIEMAND EINEN UNLESBAREN KNOPF.
//
// Idee von Ibo am 04.09.2026: "das jeder seine eigene farbe benutzen".
//
// Die Gefahr dabei ist nicht Geschmack, sondern Lesbarkeit. Waehlt ein
// Wirt ein helles Gelb, steht weisse Schrift auf Gelb -- und der
// Bestellknopf ist weg. Der Wirt merkt es nicht: er kennt seinen Knopf
// auswendig. Der Gast sieht nur eine Seite, auf der man nichts findet.
//
// Deshalb geht JEDE Farbe durch die Kontrastpruefung (WCAG 2.1, weisse
// Schrift, mindestens 4.5:1). Und wenn wir abdunkeln, wird es GESAGT --
// stillschweigend korrigieren waere Regel 6: es saehe aus, als haette
// der Wirt bekommen, was er wollte.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

var a = h.indexOf('    var MARKE = {');
var e = h.indexOf('window.MARKE = MARKE;');
t('MARKE wurde gefunden', a > 0 && e > a, a + '/' + e);
var MARKE = new Function(h.slice(a, e) + '; return MARKE;')();

// ---- 1. Die Kontrastrechnung selbst ---------------------------------
console.log('\n-- Rechnet die Pruefung richtig? --');
// Bekannte Werte aus der WCAG-Definition.
t('Schwarz auf Weiss ist 21:1', Math.round(MARKE.kontrast('#000000', '#ffffff')) === 21,
  MARKE.kontrast('#000000', '#ffffff'));
t('Weiss auf Weiss ist 1:1', Math.round(MARKE.kontrast('#ffffff', '#ffffff')) === 1,
  MARKE.kontrast('#ffffff', '#ffffff'));
t('die Hausfarbe besteht muehelos', MARKE.kontrast('#003d33', '#ffffff') > 10,
  MARKE.kontrast('#003d33', '#ffffff'));

// ---- 2. Der Fall, um den es geht ------------------------------------
console.log('\n-- Zu helle Farben werden abgedunkelt --');
var gelb = MARKE.lesbar('#ffee00');
t('knalliges Gelb wird nicht durchgelassen', gelb.farbe !== '#ffee00', gelb.farbe);
t('und ist danach lesbar', gelb.kontrast >= 4.5, gelb.kontrast);
t('und es wird als Aenderung gemeldet', gelb.gedunkelt === true, gelb.gedunkelt);

var weiss = MARKE.lesbar('#ffffff');
t('reines Weiss ebenfalls', weiss.kontrast >= 4.5, weiss.kontrast);

// ---- 3. Wer dunkel genug ist, bleibt unangetastet --------------------
console.log('\n-- Dunkle Farben bleiben, wie sie sind --');
['#1d3557', '#8c1c13', '#6d4c1f', '#003d33'].forEach(function (f) {
    var r = MARKE.lesbar(f);
    t(f + ' bleibt unveraendert', r.farbe === f && r.gedunkelt === false, r.farbe + ' / ' + r.gedunkelt);
});

// ---- 4. Unsinn faellt auf die Hausfarbe zurueck ----------------------
console.log('\n-- Was keine Farbe ist --');
['', null, undefined, 'rot', '#12', 'javascript:alert(1)', '#00ff00; background:url(x)'].forEach(function (f) {
    var r = MARKE.lesbar(f);
    t(JSON.stringify(f) + ' -> Hausfarbe', r.farbe === MARKE.STANDARD && r.gueltig === false, r.farbe);
});
t('die Kurzform #abc wird verstanden', MARKE.hex('#abc') === '#aabbcc', MARKE.hex('#abc'));
t('und ohne Raute auch', MARKE.hex('1d3557') === '#1d3557', MARKE.hex('1d3557'));

// Nichts, was aus lesbar() kommt, darf je etwas anderes als eine
// Hex-Farbe sein -- es landet direkt in einem style-Attribut.
console.log('\n-- Nichts Fremdes kommt in den style --');
['#ffee00', 'rot', '#abc', '#00ff00; background:url(x)', '<script>', null].forEach(function (f) {
    var r = MARKE.lesbar(f);
    t('lesbar(' + JSON.stringify(f) + ') gibt reines Hex', /^#[0-9a-f]{6}$/.test(r.farbe), r.farbe);
});

// ---- 5. von() -- was die Seite wirklich benutzt ----------------------
console.log('\n-- Was die Landepage nimmt --');
t('ohne eigene Farbe die Hausfarbe', MARKE.von({}) === MARKE.STANDARD, MARKE.von({}));
t('ohne Restaurant auch', MARKE.von(null) === MARKE.STANDARD, MARKE.von(null));
t('mit eigener Farbe die eigene', MARKE.von({ brand_color: '#1d3557' }) === '#1d3557',
  MARKE.von({ brand_color: '#1d3557' }));
t('mit zu heller Farbe die abgedunkelte',
  MARKE.von({ brand_color: '#ffee00' }) !== '#ffee00', MARKE.von({ brand_color: '#ffee00' }));

// ---- 6. Der Weg durch die App ---------------------------------------
console.log('\n-- Kommt die Farbe ueberhaupt an? --');
t('brand_color steht in BEIDEN Abbildungen',
  (h.match(/brand_color: r\.brand_color \|\| null,/g) || []).length === 2,
  (h.match(/brand_color: r\.brand_color \|\| null,/g) || []).length + ' statt 2');
t('die Landepage setzt --marke', /landing\.style\.setProperty\('--marke', _marke\)/.test(h), 'wird nicht gesetzt');
t('und holt sie ueber MARKE.von', /var _marke = .*MARKE\.von\(rest\)/.test(h), 'nicht gefunden');
t('die Knoepfe benutzen die Variable',
  (h.match(/var\(--marke,#003d33\)/g) || []).length >= 4,
  (h.match(/var\(--marke,#003d33\)/g) || []).length);
t('gespeichert wird mit return=representation',
  /select=id,brand_color[\s\S]{0,400}return=representation/.test(h), 'nicht abgesichert');
t('das Feld wird beim Laden gefuellt', /markeEl\.value = geprueftM\.farbe/.test(h), 'fehlt');
t('es gibt die SQL-Datei dazu',
  fs.existsSync(path.join(KMI, 'datenbank', '24-markenfarbe.sql')), 'fehlt');

// ---- 7. Die Abdunklung muss sichtbar sein ---------------------------
console.log('\n-- Stille Korrektur waere der Fehler --');
t('es gibt einen Hinweiskasten', /id="markeHinweis"/.test(h), 'fehlt');
t('und eine Vorschau, die zeigt was der Gast sieht', /id="markeVorschau"/.test(h), 'fehlt');
t('der Hinweis nennt beide Farben',
  /war zu hell[\s\S]{0,200}Der Gast sieht/.test(h), 'sagt nicht, was daraus wurde');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
