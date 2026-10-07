// EIN DESIGN, NICHT ZWEI.
//
// Ibo am 24.09.2026: die Seite muesse im Kiek-mol-in-Stil aussehen.
//
// Gemessen war es vorher so: die Restaurantseiten hatten ihr eigenes
// Stylesheet. Ueberschriften in Inter statt Epilogue, und SECHS
// verschiedene Eckenrundungen (8, 10, 12, 14, 20, 99px), jede einzeln
// hingeschrieben. /gastro dagegen lief auf einem Token-System.
// Ein Wirt klickte von einer fremd wirkenden Seite auf ein poliertes
// /gastro und sah unbewusst zwei Firmen.
//
// UND: 'Epilogue' stand im font-family der Restaurantseiten, wurde dort
// aber NIE geladen. Die Schrift war benannt und kam nie an -- ein
// stiller Ausfall, den niemand als Fehler sehen konnte.
//
// Der Test, der hier am meisten wert ist, ist der letzte: benutzt ein
// Stylesheet ein Token, das es nicht gibt? Genau das ist mir beim Bauen
// passiert -- ein Suchen-und-Ersetzen hat GASTRO_CSS mit erwischt und
// var(--r-voll) hineingeschrieben, das dort nicht definiert war. Die
// Knoepfe auf /gastro waeren ECKIG geworden, ohne jede Fehlermeldung.
'use strict';

const fs = require('fs');
const path = require('path');
const KMI = path.join(__dirname, '..');
const Q = fs.readFileSync(path.join(KMI, 'build-seo-pages.js'), 'utf8');

let ok = 0, n = 0;
function t(name, bedingung, ist) {
    n++;
    if (bedingung) { ok++; console.log('OK   | ' + name); }
    else console.log('FAIL | ' + name + '  -> ' + ist);
}

// Die beiden Stylesheets herausholen.
const seoCss = Q.slice(Q.indexOf('function pageCss()'), Q.indexOf('function pageCss()') + 9000);
const gastroCss = JSON.parse(Q.match(/var GASTRO_CSS = ("(?:[^"\\]|\\.)*")/)[1]);

function tokenBenutzt(text) {
    return [...new Set((text.match(/var\(--[a-z0-9-]+\)/g) || []).map(x => x.slice(4, -1)))];
}
function tokenDefiniert(text) {
    return [...new Set((text.match(/--[a-z0-9-]+\s*:/g) || []).map(x => x.replace(/\s*:$/, '')))];
}

console.log('-- Kein Token ohne Definition --');
// Der wichtigste Test hier. Ein fehlendes Token wirft keinen Fehler:
// der Browser setzt die Eigenschaft still auf ihren Anfangswert. Aus
// einer runden Pille wird ein Rechteck, und niemand sieht eine Meldung.
[['pageCss', seoCss], ['GASTRO_CSS', gastroCss]].forEach(function (paar) {
    const fehlt = tokenBenutzt(paar[1]).filter(function (v) {
        return tokenDefiniert(paar[1]).indexOf(v) === -1;
    });
    t(paar[0] + ': jedes benutzte Token ist auch definiert',
      fehlt.length === 0, 'fehlt: ' + fehlt.join(', '));
});

console.log('\n-- Dieselben Namen auf beiden Seiten --');
// Wenn die Restaurantseite --gr sagt und /gastro --primary, laufen die
// beiden beim naechsten Umbau garantiert auseinander.
const GEMEINSAM = ['--gr', '--gold', '--r-sm', '--r-md', '--r-lg', '--r-voll'];
GEMEINSAM.forEach(function (tok) {
    t('"' + tok + '" gibt es in beiden Stylesheets',
      tokenDefiniert(seoCss).indexOf(tok) > -1 && tokenDefiniert(gastroCss).indexOf(tok) > -1,
      'nur in ' + (tokenDefiniert(seoCss).indexOf(tok) > -1 ? 'pageCss' : 'GASTRO_CSS'));
});
// Und sie muessen dasselbe bedeuten.
[['--gr', '#003D33'], ['--r-sm', '12px'], ['--r-md', '16px'], ['--r-lg', '32px'], ['--r-voll', '9999px']]
.forEach(function (paar) {
    const wert = function (css) {
        const m = css.match(new RegExp(paar[0] + '\\s*:\\s*([^;}]+)'));
        return m ? m[1].trim() : '?';
    };
    t('"' + paar[0] + '" hat ueberall denselben Wert (' + paar[1] + ')',
      wert(seoCss).toLowerCase() === paar[1].toLowerCase()
      && wert(gastroCss).toLowerCase() === paar[1].toLowerCase(),
      'pageCss=' + wert(seoCss) + ' GASTRO_CSS=' + wert(gastroCss));
});

console.log('\n-- Die Rundungen kommen aus der Leiter --');
// Sechs willkuerliche Zahlen waren das deutlichste Zeichen dafuer, dass
// nie jemand ein System angelegt hat.
const krumm = (seoCss.match(/border-radius:\s*(\d+)px/g) || [])
    .filter(function (x) { return !/50%/.test(x); });
t('keine handgeschriebene Pixelzahl mehr bei border-radius',
  krumm.length === 0, krumm.join(', '));

console.log('\n-- Die Schrift wird auch wirklich geladen --');
// Sie stand im font-family und kam nie an.
// buildPage nach seinen ECHTEN Grenzen ausschneiden, nicht nach einer
// geratenen Zeichenzahl -- die hat beim ersten Anlauf mitten in der
// Funktion abgeschnitten, und der Test meldete "wird nie geladen",
// obwohl die Zeile zwei Zeilen weiter stand.
const zeilen = Q.split('\n');
const von = zeilen.findIndex(function (z) { return z.indexOf('function buildPage(opts)') === 0; });
let bis = von + 1;
while (bis < zeilen.length && zeilen[bis] !== '}') bis++;
const kopf = zeilen.slice(von, bis + 1).join('\n');
t('die Restaurantseiten laden Epilogue und Inter',
  /fonts\.googleapis\.com\/css2\?family=Epilogue/.test(kopf), 'wird nie geladen');
t('mit display=swap -- der Text ist sofort lesbar',
  /display=swap/.test(kopf), 'Seite bleibt leer, bis die Schrift da ist');
t('und mit preconnect, damit es nicht bremst',
  /preconnect.*fonts\.gstatic\.com/s.test(kopf), 'kein preconnect');
t('Ueberschriften benutzen Epilogue',
  /h1,h2,h3\{font-family:Epilogue/.test(seoCss), 'weiter Inter');

console.log('\n-- Was die Seite bleiben muss --');
// Die Seite gehoert zuerst dem Gast. Ohne Ranking kommt auch kein Wirt.
t('der Grund bleibt hell -- keine dunkle Verkaufsseite',
  /--grund:#f8f9fa/.test(seoCss), 'Hintergrund geaendert');
t('die Kopfzeile bleibt gruen', /header\.site\{background:var\(--gr\)/.test(seoCss), 'Kopf geaendert');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
