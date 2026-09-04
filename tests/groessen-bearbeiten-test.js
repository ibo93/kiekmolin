// GROESSEN VON HAND EINTRAGEN.
//
// Gemeldet am 04.09.2026: bei der Familienpizza fehlten die
// Extra-Zutaten. Auf dem Bild war zu sehen, warum -- "Familienpizza
// 40 cm" ist ein EIGENES Gericht, die Groesse steckt im NAMEN. Das
// Gericht hat also gar keine Groessen, und seit #207 kann eine
// groessengebundene Zutatenliste dann nicht erscheinen. Der Dialog
// zeigte nur "Anmerkungen" und 19,50 EUR.
//
// Der naheliegende Weg -- ein Gericht, zwei Groessen -- ging nicht:
// Groessen wurden AUSSCHLIESSLICH vom Speisekarten-Scanner geschrieben.
// Von Hand konnte man sie weder anlegen noch aendern noch loeschen.
// Was der Scanner falsch erkannt hatte, blieb falsch.
//
// Eine halbe Sache also: die Gastseite liest Groessen, der Scanner
// schreibt sie, und dazwischen konnte der Wirt nichts tun.

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');

console.log('\n-- 1. Die Maske hat das Feld ueberhaupt --');

t('es gibt einen Groessen-Kasten', /id="editSizesBox"/.test(h));
t('mit einer Liste', /id="editSizesList"/.test(h));
t('und einem Knopf zum Hinzufuegen', /groessenZeile\(\)/.test(h));
t('vorhandene Groessen werden eingetragen',
  /_vorhanden\.forEach\(function \(g\) \{ groessenZeile\(g && g\.name, g && g\.price\); \}\);/.test(h));
t('beim Speichern gehen sie mit', /sizes: groessenAusMaske\(\)/.test(h));

console.log('\n-- 2. Was aus der Maske herauskommt --');

var a = h.indexOf('function groessenAusMaske');
var quelle = h.slice(a, h.indexOf('\n}\n', a) + 3);
t('die Funktion wurde gefunden', quelle.length > 300, quelle.length);

function maske(zeilen) {
    var kinder = zeilen.map(function (z) {
        return { querySelector: function (s) {
            return s === '.groesse-name' ? { value: z[0] } : { value: z[1] };
        } };
    });
    var ctx = {
        document: { getElementById: function (id) {
            return id === 'editSizesList' ? { children: kinder } : null; } },
        Array: Array, String: String, parseFloat: parseFloat, isFinite: isFinite,
        Math: Math, window: {}, console: console
    };
    vm.createContext(ctx);
    vm.runInContext(quelle, ctx);
    return ctx.groessenAusMaske();
}

var r = maske([['60x40', '29.50'], ['40 cm', '19.50']]);
t('zwei Groessen kommen als Liste',
  Array.isArray(r) && r.length === 2, JSON.stringify(r));
t('guenstigste zuerst -- die ist beim Gast vorausgewaehlt',
  r[0].name === '40 cm' && r[1].name === '60x40', JSON.stringify(r));
t('der Preis ist eine Zahl, keine Zeichenkette',
  typeof r[0].price === 'number' && r[0].price === 19.5, JSON.stringify(r[0]));
t('Leerzeichen im Namen bleiben erhalten (40 cm, nicht 40cm)',
  r[0].name === '40 cm', r[0].name);

console.log('\n-- 3. UND LEER IST NULL, NICHT [] --');

// Ein leeres Array hiesse "es gibt Groessen, aber keine". Der Gast
// bekaeme eine Pflicht-Auswahl, aus der er nichts nehmen kann -- ein
// Gericht, das sich nicht bestellen laesst.
t('gar keine Zeile -> null', maske([]) === null, JSON.stringify(maske([])));
t('nur leere Zeilen -> null', maske([['', ''], ['', '']]) === null,
  JSON.stringify(maske([['', ''], ['', '']])));
t('eine Groesse ohne Namen faellt raus',
  maske([['', '9.00'], ['gross', '12.00']]).length === 1);
t('eine ohne Preis auch -- geschenkt gibt es nichts',
  maske([['klein', ''], ['gross', '12.00']]).length === 1);
t('ein Minuspreis faellt raus',
  maske([['klein', '-3'], ['gross', '12.00']]).length === 1);
t('und Unsinn im Preisfeld ebenso',
  maske([['klein', 'abc'], ['gross', '12.00']]).length === 1);

console.log('\n-- 4. Ohne die Maske stuerzt nichts ab --');

var ctx2 = {
    document: { getElementById: function () { return null; } },
    Array: Array, String: String, parseFloat: parseFloat, isFinite: isFinite,
    Math: Math, window: {}, console: console
};
vm.createContext(ctx2);
vm.runInContext(quelle, ctx2);
t('ohne Liste kommt null zurueck', ctx2.groessenAusMaske() === null);

var qz = h.slice(h.indexOf('function groessenZeile'), h.indexOf('window.groessenZeile'));
var ctx3 = { document: { getElementById: function () { return null; } }, String: String, window: {}, console: console };
vm.createContext(ctx3);
vm.runInContext(qz, ctx3);
var geknallt = false;
try { ctx3.groessenZeile('a', 1); } catch (e) { geknallt = true; }
t('und eine Zeile ohne Liste knallt nicht', geknallt === false);

console.log('\n-- 5. Die Felder sind beschriftet --');

// Sonst laeuft barrierefrei-test.js auf, und zwar zu Recht.
t('Name beschriftet', /class="groesse-name" aria-label=/.test(h));
t('Preis beschriftet', /class="groesse-preis" aria-label=/.test(h));
t('Entfernen-Knopf beschriftet', /aria-label="Diese Größe entfernen"/.test(h));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
