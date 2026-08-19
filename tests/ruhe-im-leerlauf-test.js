// Prueft, dass die Seite im Leerlauf nichts anfasst.
//
// Gemeldet: "beim Nichtstun kommt es einfach so -- die Bilder und die App,
// nur auf dem Kundenportal." Das Kopfbild war eine Ursache (der Ken-Burns
// ueber background-size), aber nicht die einzige.
//
// Der zweite Fund: der Cookie-Waechter schrieb dreimal pro Sekunde
// el.style.display -- auch dann, wenn schon derselbe Wert drinstand. Fuer
// den Browser ist das trotzdem eine Stilaenderung. Auf einer Seite mit
// hunderten Milchglas-Flaechen wird bei jeder davon neu gerastert.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- Der Cookie-Waechter --');

var w = h.slice(h.indexOf('function _cookieBannerZeigen'));
w = w.slice(0, w.indexOf('document.addEventListener(\'DOMContentLoaded\', _cookieBannerZeigen)'));

t('er laeuft weiter (die Tour kann jederzeit aufgehen)', /setInterval\(pruefe, 300\)/.test(w));
t('aber er schreibt nur bei einer echten Aenderung',
  /if \(el\.style\.display !== wert\) el\.style\.display = wert;/.test(w), w.slice(0, 200));
t('kein direktes Schreiben mehr in pruefe()',
  (w.slice(w.indexOf('function pruefe')).match(/el\.style\.display = /g) || []).length === 0,
  (w.slice(w.indexOf('function pruefe')).match(/el\.style\.display = /g) || []).join(' | '));
t('er hoert auf, sobald entschieden ist', /clearInterval\(_cookieWaechter\)/.test(w));

console.log('\n-- Das Kopfbild (aus dem vorigen Schritt) --');

t('kein Uebergang auf background-size', (h.match(/transition[^;"']*background-size/g) || []).length === 0);
t('der Zoom laeuft ueber transform', /transform 8s ease-in-out/.test(h));

console.log('\n-- Der Splash bleibt nicht liegen --');

// Ein Splash, der nur ausgeblendet statt entfernt wird, animiert weiter:
// opacity:0 stoppt keine Animation, display:none schon, remove() sicher.
var hs = h.slice(h.indexOf('function hideSplash'));
hs = hs.slice(0, 600);
t('der Splash wird aus dem Dokument entfernt, nicht nur versteckt',
  /s\.remove\(\)/.test(hs), hs.slice(0, 200));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
