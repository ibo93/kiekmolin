// ZUTRITT AB 18 -- SAGEN, BEVOR DIE GRUPPE VOR DER TUER STEHT.
//
// Gebaut am 06.10.2026 fuer den ersten Shisha-Bar-Kunden. Reserviert eine
// Gruppe mit einem 17-Jaehrigen, wird sie an der Tuer weggeschickt -- der
// Tisch bleibt leer, und die Bewertung schreibt sich von selbst.
//
// WAS SCHIEFGEHEN KANN, UND WIE ES DANN AUSSAEHE
//   - Der Haken wird erst NACH dem lokalen Speichern geprueft: die
//     Reservierung stuende schon im Kalender des Geraets.
//   - Der Haken gilt auch bei Lokalen OHNE Schalter: jede Pizzeria
//     verlangt ploetzlich eine Altersbestaetigung -- oder schlimmer, die
//     Reservierung geht nirgends mehr durch.
//   - toggleFeature laesst 'ab_18' in die Standardregel fallen und schaltet
//     damit die Reservierungen AUS -- ausgerechnet beim Versuch, sie
//     sicherer zu machen.
//
// BEWUSST NICHT: eine Sperre auf dem Server. Ein Haken beweist kein Alter,
// und eine abgewiesene Reservierung kostet einen Gast. Die Kontrolle an
// der Tuer bleibt beim Wirt -- so steht es auch am Schalter.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - abAchtzehnPruefen gibt ohne Haken true zurueck
//   - die Pruefung hinter APP_DATA.reservations.push verschoben
//   - den ab_18-Zweig in toggleFeature entfernt
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }
function schneide(kopf) {
    var a = H.indexOf(kopf); if (a < 0) return '';
    var i = H.indexOf('{', a), tiefe = 0;
    for (var j = i; j < H.length; j++) { if (H[j] === '{') tiefe++; else if (H[j] === '}') { tiefe--; if (!tiefe) return H.slice(a, j + 1); } }
    return '';
}

console.log('\n-- 1. Die Pruefung laeuft --');
function welt(haken) {
    var w = { toasts: [], box: { style: { display: 'none' }, classList: { add: function () {}, remove: function () {} } },
              check: { checked: haken, focus: function () { w.fokus = true; } } };
    w.document = { getElementById: function (id) { return id === 'resAb18' ? w.box : id === 'resAb18Check' ? w.check : null; } };
    var f = new Function('document', 'showToast', 'setTimeout',
        schneide('function abAchtzehn(') + '\n' + schneide('function abAchtzehnPruefen(') + '\nreturn abAchtzehnPruefen;');
    w.pruefe = f(w.document, function (m, art) { w.toasts.push(art + ': ' + m); }, function () {});
    return w;
}
var BAR = { features: ['ab_18', 'kohle_ruf'] }, PIZZA = { features: ['preorder'] };
var w = welt(false);
t('Bar ab 18, ohne Haken -> geht nicht weiter', w.pruefe(BAR) === false, null);
t('... und der Gast liest warum', /mindestens 18/.test(w.toasts[0] || '') && /^error/.test(w.toasts[0] || ''), w.toasts);
t('... und der Haken ist sichtbar und hat den Fokus', w.box.style.display === 'flex' && w.fokus === true, w.box.style);
t('Bar ab 18, mit Haken -> weiter', welt(true).pruefe(BAR) === true, null);
var p = welt(false);
t('Pizzeria ohne Schalter, ohne Haken -> weiter wie immer', p.pruefe(PIZZA) === true && p.toasts.length === 0, p.toasts);
t('Lokal ohne features / unbekannt -> weiter', welt(false).pruefe({}) === true && welt(false).pruefe(undefined) === true, null);

console.log('\n-- 2. An der richtigen Stelle --');
var sr = schneide('function submitReservation(');
var iPruef = sr.indexOf('if (!abAchtzehnPruefen(restaurant)) return;'), iPush = sr.indexOf('APP_DATA.reservations.push(reservation)');
t('submitReservation prueft', iPruef > 0, iPruef);
t('... BEVOR irgendetwas gespeichert wird', iPruef > 0 && iPush > iPruef, { pruef: iPruef, push: iPush });
t('der Haken wird mit dem Termin zusammen ein- und ausgeblendet', /abAchtzehnZeigen\(\)/.test(schneide('function updateResSummary(')), null);
t('der Haken steht im Formular, von Haus aus versteckt', /<label id="resAb18" class="res-ab18" style="display:none;">\s*<input type="checkbox" id="resAb18Check">/.test(H), null);

console.log('\n-- 3. Der Schalter des Wirts --');
var tf = schneide('async function toggleFeature(');
var iAb = tf.indexOf("} else if (feature === 'ab_18') {"), iSonst = tf.indexOf("var flagName = feature === 'ordering' ? 'no_ordering' : 'no_reservations';");
t('ab_18 hat einen eigenen Zweig', iAb > 0, iAb);
t('... VOR der Standardregel -- sonst gingen die Reservierungen aus', iAb > 0 && iSonst > iAb, { ab: iAb, standard: iSonst });
t('der Schalter zeigt den Zustand beim Laden', /abAchtzehnToggle\.classList\.remove\('off'\)/.test(schneide('function updateFeatureToggles(')), null);
t('der Schalter steht im Dashboard', /id="abAchtzehnToggle"[^>]*onclick="toggleFeature\('ab_18'\)"/.test(H), null);
t('und sagt ehrlich, dass die Tuer-Kontrolle bleibt', /Die Kontrolle an der Tür bleibt bei euch\./.test(H), null);

console.log('\n-- 4. Auf der Lokalseite --');
var lp = schneide('async function showRestaurantLanding(');
t('Abzeichen nur bei Lokalen mit Schalter', /\$\{abAchtzehn\(rest\) \? '<div class="lp-ab18">/.test(lp), null);
t('das Abzeichen dreht im Dunkeln mit (--lp-Farben)', /\.lp-ab18 \{[^}]*background: var\(--lp-akzent-hell, #fff4cc\); color: var\(--lp-akzent-text, #5c4600\);/.test(H), null);
t('der Haken-Text ist im Dunkeln hell -- gegen das allgemeine Grau fuer label',
  /\.dark-mode \.res-ab18,\s*\.dark-mode \.res-ab18 span \{[^}]*color: #f0f2f1 !important;/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
