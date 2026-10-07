// SPEISEKARTE: KEINE FALSCHEN DATEN (07.10.2026).
//
// - Ohne gewaehltes Restaurant fiel der Editor auf RESTAURANT_ID zurueck,
//   ein fest eingebautes Lokal -- geschrieben worden waere in DESSEN Karte.
// - "Gericht hinzufuegen" bot bei fehlenden Kategorien eine fest
//   eingebaute Kategorie-ID eines anderen Lokals an ("Vorspeisen").
// - Scanner: "12,50" wurde 12 (parseFloat), ohne Preis 0 € und bestellbar.
// - Ein Gratis-Gericht (0 €) wurde abgelehnt.
//
// Gegenprobe (jede rot): RESTAURANT_ID-Rueckfall zurueck, KATEGORIE_ID-Option
// zurueck, Scanner wieder parseFloat || 0, is_available wieder true.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var sb = { window: {} }; vm.createContext(sb);
vm.runInContext(fn('menuRestaurantWahl'), sb);
t('ohne Auswahl: null (kein fremdes Lokal)', sb.menuRestaurantWahl() === null, sb.menuRestaurantWahl());
sb.window.currentMenuRestaurant = 'r9';
t('mit Auswahl: das gewaehlte Lokal', sb.menuRestaurantWahl() === 'r9', sb.menuRestaurantWahl());

t('kein Speisekarten-Weg faellt mehr auf RESTAURANT_ID zurueck',
  !/currentMenuRestaurant \|\| window\.currentMenuRestaurant \|\| RESTAURANT_ID/.test(H) && !/window\.currentMenuRestaurant \|\| currentMenuRestaurant \|\| RESTAURANT_ID/.test(H) && !/currentMenuRestaurant : RESTAURANT_ID/.test(H), '');
t('keine fest eingebaute Kategorie mehr als Auswahl', !/<option value="' \+ KATEGORIE_ID \+ '">Vorspeisen/.test(H), '');
var imp = fn('importScannedMenu');
t('Scanner: Preis ueber menuPreisLesen (Komma), nicht parseFloat || 0', /var _preis = menuPreisLesen\(item\.price\);/.test(imp) && !/base_price: parseFloat\(item\.price\) \|\| 0/.test(imp), '');
t('Scanner: ohne Preis (und ohne Groessen) angelegt, aber NICHT bestellbar, und genannt',
  /is_available: !_ohnePreis,/.test(imp) && /ohne Preis angelegt – noch NICHT bestellbar/.test(imp), '');
t('Gericht anlegen: 0 € erlaubt, leer/vertippt nicht', /var price = menuPreisLesen\(priceStr\);\s*\/\/ 0 ist erlaubt[^\n]*\n\s*if \(price === null\)/.test(H), '');
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
