// RESERVIEREN OHNE SCHATTEN.
//
// 06.10.2026, Ibo zum Reservierungsfenster: "Der Schatten soll weg".
//
// Gemessen im Browser: das, was wie ein Schatten aussah, war zu zwei
// Dritteln KEIN box-shadow. Die Hinweis-Meldung (showToast) war 70 % weiss
// mit Weichzeichner -- der dunkelgruene Knopf darunter schien als grauer
// Fleck durch. Den box-shadow allein wegzunehmen aenderte im Bild fast
// nichts. Dazu kam ein gruener Schein um "Reservierung bestaetigen", den
// allgemeine Knopf-Regeln setzten (computed: rgba(26,95,74,0.3) 0 4px 16px).
//
// GEGENPROBEN (06.10.2026) -- jede wurde rot:
//   - die Meldung wieder halb durchsichtig mit Weichzeichner
//   - die Regel "box-shadow: none !important" am Knopf entfernt
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var toast = (H.match(/\n\s*\.liquid-glass \.toast \{([^}]*)\}/) || [])[1] || '';
t('die Glas-Meldung hat eine Regel', toast.length > 0, null);
t('deckend weiss -- nichts scheint mehr durch', /background: #ffffff !important;/.test(toast), toast);
t('kein Weichzeichner', /backdrop-filter: none !important;/.test(toast) && /-webkit-backdrop-filter: none !important;/.test(toast), toast);
t('kein Schatten', /box-shadow: none !important;/.test(toast), toast);
t('im Dunkeln deckend dunkel (nicht weiss mit heller Schrift)',
  /\.liquid-glass\.dark-mode \.toast \{\s*background: #2a2a2a !important;/.test(H), null);

var knopf = H.match(/#reservationModal #submitReservationBtn,\s*#reservationModal #submitReservationBtn:hover,\s*#reservationModal #submitReservationBtn:focus \{\s*box-shadow: none !important;/);
t('"Reservierung bestaetigen" ohne Schein -- auch bei Maus und Fokus', !!knopf, null);
t('mit Tastatur bleibt ein Fokusring (Barrierefreiheit)',
  /#reservationModal #submitReservationBtn:focus-visible \{\s*box-shadow: 0 0 0 3px/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
