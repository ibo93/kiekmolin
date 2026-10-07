// KNOEPFE UND HINWEISE OHNE SCHATTEN -- UEBERALL.
//
// 06.10.2026, Ibo: "Der Schatten soll weg", dann "mach das ueberall weg".
//
// Gezaehlt im Browser (Chromium), alte gegen neue Fassung:
//   Gaesteseiten (Start, Lokalseite, Karte, Reservierung; hell+dunkel):
//       42 sichtbare Knoepfe mit Schatten  ->  0
//   Dashboard (alle Bereiche eingeblendet, 73 Knoepfe, je mit Maus drauf):
//       8 in Ruhe, 13 beim Darueberfahren  ->  0 und 0
//
// Die Schatten kamen aus ueber 50 Regeln, aus style-Attributen und aus
// Skripten beim Darueberfahren. Eine einzige Regel mit
// :is(html, #kmi-flach) hebt sich ueber alle -- wer sie abschwaecht
// (ohne die Kennung, ohne !important), bekommt die Schatten zurueck, ohne
// dass ein Test es merkt, der nur "box-shadow: none" sucht. Deshalb prueft
// dieser Test die Staerke der Regel mit.
//
// GEGENPROBEN (06.10.2026) -- jede wurde rot:
//   - #kmi-flach aus dem :is() entfernt
//   - !important entfernt
//   - :hover aus der Liste genommen
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var KNOPF = ':is(button, .btn, [class*="btn"], [role="button"])';
var W = ':is(html, #kmi-flach) ';
var regel = H.match(/(:is\(html, #kmi-flach\) :is\(button, \.btn, \[class\*="btn"\], \[role="button"\], \.toast\),[\s\S]*?)\{\s*box-shadow: none !important;\s*\}/);
t('die Regel gibt es', !!regel, null);
var sel = regel ? regel[1] : '';
t('sie ist stark genug: Kennung im :is()', sel.indexOf('#kmi-flach') >= 0, null);
['', ':hover', ':active', ':focus'].forEach(function (z) {
    t('gilt auch ' + (z || 'in Ruhe'), sel.indexOf(W + KNOPF + z + ',') >= 0 || sel.indexOf(W + KNOPF + z + ' ') >= 0 || sel.indexOf(W + KNOPF + z + '\n') >= 0 || (z === '' && sel.indexOf('.toast),') >= 0), z);
});
t('es gibt kein Element mit der Kennung kmi-flach (sie ist nur Gewicht)', !/id="kmi-flach"/.test(H), null);
t('Tastatur: ein Fokusring bleibt, hell und dunkel',
  H.indexOf(W + KNOPF + ':focus-visible {\n            box-shadow: 0 0 0 3px') >= 0
  && H.indexOf(':is(html, #kmi-flach).dark-mode ' + KNOPF + ':focus-visible') >= 0, null);
t('Meldungen ohne Weichzeichner, mit derselben Staerke',
  /:is\(html, #kmi-flach\) \.toast \{\s*backdrop-filter: none !important;\s*-webkit-backdrop-filter: none !important;/.test(H), null);

function lum(h) { var c = [1, 3, 5].map(function (i) { var x = parseInt(h.slice(i, i + 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
[['success', /\.toast\.success \{ background: (#[0-9a-f]{6}); \}/], ['error', /\.toast\.error \{ background: (#[0-9a-f]{6}); \}/]].forEach(function (f) {
    var m = H.match(f[1]); var k = m ? Math.round(1.05 / (lum(m[1]) + 0.05) * 100) / 100 : 0;
    t('Meldung "' + f[0] + '" deckend, weisse Schrift ' + k + ' : 1', k >= 4.5, m && m[1]);
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
