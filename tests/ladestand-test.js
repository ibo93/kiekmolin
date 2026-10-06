// LEER ODER KAPUTT -- jede Dienst-Liste traegt ihren Lade-Stand (Regel 6).
//
// Vorher: schlug das Laden fehl, wurde die Liste auf [] gesetzt, und der Wirt
// sah "Keine Bestellungen" / "Frei" / "0,00 EUR Tagesumsatz" -- genau wie an
// einem ruhigen Abend. Gefunden am 06.10.2026 bei Bestellungen, Reservierungen
// (Kalender + Liste), Kueche, Tagesabschluss, Kunden, Gutscheinen, Jobs.
//
// Im Browser mit ausfallender Datenbank: werkzeug/ladestand-messen.js.
// Gegenprobe: loadDemoOrders() im catch zurueck, resAllReservations = [] im
// Fehlerzweig zurueck, Tagesabschluss ohne error-Auswertung -- jedes rot.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function block(start, ende) { var i = H.indexOf(start); return i < 0 ? '' : H.slice(i, H.indexOf(ende, i + start.length)); }

t('Helfer ladeStandSetzen / ladeStandFehlt vorhanden', /function ladeStandSetzen\(schluessel, ok, grund, nochmal\)/.test(H) && /function ladeStandFehlt\(schluessel\)/.test(H), '');
t('Fehlerzeile ist role="alert" und sagt "letzter Stand"', /setAttribute\('role', 'alert'\)/.test(H) && /ist der letzte Stand, nicht unbedingt alles/.test(H), '');

var ord = block('async function loadDashboardOrders', '// Fallback wenn Supabase nicht erreichbar');
t('Bestellungen: Fehler leert die Liste NICHT mehr', ord.length > 1000 && !/loadDemoOrders\(\)/.test(ord), (ord.match(/loadDemoOrders\(\)/g) || []).length);
t('Bestellungen: Erfolg und beide Fehlerwege melden den Stand',
  (ord.match(/ladeStandSetzen\('bestellungen', true/g) || []).length === 1 && (ord.match(/ladeStandSetzen\('bestellungen', false/g) || []).length === 2, '');
t('Bestellungen: leerer Zustand unterscheidet "keine" und "nicht geladen"',
  /_kaputt \? 'Bestellungen konnten nicht geladen werden' : 'Keine Bestellungen'/.test(H), '');
var poll = block('async function checkForNewOrders', 'function refreshOrders');
t('Abfrage-Weg: Fehler wird nicht mehr verschluckt', !/polling error - ignoriert/.test(poll) && /ladeStandSetzen\('bestellungen', false, 'keine Verbindung'/.test(poll), '');

var res = block('window.resLoadReservations = async function', 'window.resSaveToDatabase');
t('Reservierungen: Fehlerzweige setzen NICHT mehr [] (sonst steht jeder Tag als "Frei")',
  res.length > 1000 && !/window\.resAllReservations = \[\];/.test(res), (res.match(/window\.resAllReservations = \[\];/g) || []).length);
t('Reservierungen: Pille sagt "nicht geladen"', /if \(_resKaputt\) \{[\s\S]{0,200}Reservierungen nicht geladen/.test(res), '');
t('Reservierungsliste: abgelehnte Anfrage hat einen Zweig (statt ewig "Lade ...")',
  /\} else \{\s*\/\/ Fehlte: bei abgelehnter Anfrage blieb "Lade Reservierungen\.\.\." fuer immer stehen\./.test(H), '');

var kds = block('async function refreshKitchenOrders', 'async function updateKitchenOrderStatus');
t('Kueche: Fehler ueber allen Spalten, nicht nur in "Neu"', /ladeStandSetzen\('kueche', false/.test(kds) && !/colNew\.innerHTML = '<div style="padding:20px;color:var\(--danger-500\)/.test(kds), '');
t('Kueche: fehlender Datenbank-Zugang ist kein stilles return', /if \(!client\) \{ ladeStandSetzen\('kueche', false/.test(kds), '');

var abs = block('async function openDayCloseReport', '// Umsatz-Karte');
t('Tagesabschluss: Fehler der Abfragen werden ausgewertet', /error: _eo/.test(abs) && /error: _er/.test(abs) && /if \(_eo\) _abschlussFehler\.push/.test(abs), '');
t('Tagesabschluss: bei Fehler steht "Diese Zahlen sind unvollständig"', /Diese Zahlen sind unvollständig/.test(abs), '');

t('Kunden / Gutscheine / Jobs melden ihren Stand',
  /ladeStandSetzen\('kunden', false/.test(H) && /ladeStandSetzen\('gutscheine', false/.test(H) && /ladeStandSetzen\('jobs', false/.test(H), '');
t('Gutscheine / Jobs: kein "Noch keine ..." wenn das Laden fehlschlug',
  /ladeStandFehlt\('gutscheine'\) \? ''/.test(H) && /ladeStandFehlt\('jobs'\) \? ''/.test(H), '');
['bestellungen', 'reservierungen', 'kueche', 'kunden', 'gutscheine', 'jobs'].forEach(function (k) {
  t('Anzeigeplatz data-ladestand="' + k + '" vorhanden', H.indexOf('data-ladestand="' + k + '"') > -1, '');
});

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
