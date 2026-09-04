// "BITTE OHNE" -- EINGETRAGEN STATT GERATEN.
//
// Ibo am 04.09.2026: "bei gerichte die zur verfuegung sind ohne
// einfuegen damit der gast nicht soviel schreibt nur eintippt -- das
// hatten wir gehabt irgendwie geht das nicht".
//
// Er hat recht: es GAB die Kaestchen. Sie erschienen nur, wenn die
// BESCHREIBUNG wie eine Zutatenliste aussah -- mindestens drei Teile,
// mit Komma getrennt, gross geschrieben, kein Punkt mittendrin.
//
//     "Gyros, Tzatziki, Pommes, Salat"        -> Kaestchen
//     "Unser Gyros mit hausgemachtem Tzatziki" -> nichts
//
// Und wenn nichts kam, stand nirgends warum. Ein Wirt, der die Regel
// nicht kennt, haelt es fuer kaputt (Regel 6).
//
// Jetzt kann er die Zutaten eintragen. Steht dort etwas, wird nicht mehr
// geraten. Steht nichts, bleibt alles wie vorher -- kein Gericht
// verliert seine Kaestchen.
//
// Gespeichert in additives als "ohne:Gyros,Tzatziki", genau wie die
// Gerichtnummer als "nr:37". Kein neues Datenbankfeld.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

// ---- Die Leser herausschneiden und laufen lassen -----------------------
function schnipsel(von, bis) {
    var a = h.indexOf(von);
    if (a < 0) return '';
    var e = h.indexOf(bis, a);
    return e < 0 ? '' : h.slice(a, e + bis.length);
}
var qMark = schnipsel("var ADDITIVE_MARKIERUNGEN", "window.istMarkierung = istMarkierung;");
var qZut  = schnipsel("function zutatenEingetragen", "window.zutatenEingetragen = zutatenEingetragen;");
var qZus  = schnipsel("function zusatzstoffeVon", "window.zusatzstoffeVon = zusatzstoffeVon;");

t('die Bausteine wurden gefunden', qMark.length > 50 && qZut.length > 100 && qZus.length > 80,
  [qMark.length, qZut.length, qZus.length].join('/'));

var ctx = { window: {}, console: console, ZUSATZSTOFFE: { '1': 'Farbstoff', '2': 'Konservierungsstoff' } };
vm.createContext(ctx);
vm.runInContext(qMark + '\n' + qZut + '\n' + qZus, ctx);

console.log('\n-- 1. Eingetragene Zutaten werden gelesen --');

t('eine Liste kommt zurueck',
  JSON.stringify(ctx.zutatenEingetragen({ additives: ['ohne:Gyros,Tzatziki,Pommes'] }))
    === JSON.stringify(['Gyros', 'Tzatziki', 'Pommes']),
  JSON.stringify(ctx.zutatenEingetragen({ additives: ['ohne:Gyros,Tzatziki,Pommes'] })));
t('Leerzeichen um die Kommas stoeren nicht',
  JSON.stringify(ctx.zutatenEingetragen({ additives: ['ohne: Gyros ,  Tzatziki '] }))
    === JSON.stringify(['Gyros', 'Tzatziki']));
t('neben der Gerichtnummer gefunden',
  ctx.zutatenEingetragen({ additives: ['nr:37', '1', 'ohne:Zwiebeln'] }).length === 1);
t('ohne Eintrag kommt eine leere Liste',
  ctx.zutatenEingetragen({ additives: ['nr:37', '1'] }).length === 0);
t('ohne additives auch', ctx.zutatenEingetragen({}).length === 0);
t('und ohne Gericht stuerzt nichts ab',
  ctx.zutatenEingetragen(null).length === 0 && ctx.zutatenEingetragen(undefined).length === 0);

console.log('\n-- 2. UND DER GAST SIEHT ES NICHT ALS ZUSATZSTOFF --');

// Das ist die Stolperstelle, vor der der Kommentar im Code warnt: das
// Feld additives traegt zweierlei. Wer es roh anzeigt, schreibt dem Gast
// "ohne:Gyros,Tzatziki" unter die Allergene.
var zus = ctx.zusatzstoffeVon({ additives: ['nr:37', 'ohne:Gyros,Tzatziki', '1'] });
t('die Markierungen sind aus den Zusatzstoffen raus',
  zus.join('|') === 'Farbstoff', zus.join('|'));
t('echte Zusatzstoffe bleiben', ctx.zusatzstoffeVon({ additives: ['1', '2'] }).length === 2);
t('die Markierungen stehen an EINER Stelle',
  /var ADDITIVE_MARKIERUNGEN = \['nr:', 'ohne:'\];/.test(h));
t('und der Filter benutzt sie', /!istMarkierung\(a\)/.test(h));

console.log('\n-- 3. Eingetragenes schlaegt Geratenes --');

var qWeg = schnipsel('function zutatenZumWeglassen', '\n}\n');
t('zutatenZumWeglassen fragt zuerst das Eingetragene',
  qWeg.indexOf('zutatenEingetragen') < qWeg.indexOf('item.description'),
  qWeg.slice(0, 300));
t('und kehrt dann sofort zurueck', /if \(eigen\.length\) return eigen;/.test(qWeg));
t('das Raten aus der Beschreibung bleibt als Rueckfall',
  /Sonst wie bisher: aus der Beschreibung lesen/.test(qWeg));

console.log('\n-- 4. Das Feld im Dashboard --');

t('es gibt ein Eingabefeld', /id="editItemOhne"/.test(h));
t('es zeigt, was schon eingetragen ist', /zutatenEingetragen\(item\)\.join\(', '\)/.test(h));
t('beim Speichern wird der alte Eintrag entfernt',
  /a\.startsWith\('nr:'\) \|\| a\.startsWith\('ohne:'\)/.test(h));
t('und der neue geschrieben', /additives\.push\('ohne:' \+ _ohneRoh\.join\(','\)\)/.test(h));

// Leer heisst leer -- sonst koennte er seinen Eintrag nie wieder los.
t('ein leeres Feld schreibt gar nichts', /if \(_ohneRoh\.length\) additives\.push/.test(h));

console.log('\n-- 5. Und die Kaestchen selbst gibt es weiterhin --');

t('renderOhneHtml ist da', /function renderOhneHtml/.test(h));
t('ein "ohne" ist eine Option mit Preis 0',
  /group: 'ohne', option: text, price: 0/.test(h));
t('das Wort "ohne" steht MIT in der Option (fuer den Bon)',
  /var text = 'ohne ' \+ zutat;/.test(h));

// Das darf sich nie aendern: ein abgewaehltes Tsatsiki nimmt das
// Milch-Symbol NICHT weg.
t('Allergene werden dabei nicht angefasst',
  /DIE ALLERGENE ANFASSEN/.test(h) && !/toggleOhne[\s\S]{0,400}allergens/.test(h));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
