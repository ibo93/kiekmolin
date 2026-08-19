// Prueft, dass die Zeile "X Uhrzeiten verfuegbar" nicht mehr flackert.
//
// Gemeldet: "die Uhrzeiten beim Restaurant, das laedt immer, kommt und geht."
//
// Der Ablauf war:
//   renderRestaurants() baut die Karten neu
//     -> jede Karte startet wieder mit "Verfuegbarkeit wird geladen..."
//     -> loadNextFreeSlots fragt fuer JEDE Karte NACHEINANDER die Datenbank
//     -> so lange steht in den uebrigen Karten der Ladehinweis
//
// Und ausgeloest wurde das nicht nur beim Oeffnen: der Echtzeit-Kanal auf
// restaurant_tables rief renderRestaurants() bei JEDER Tischaenderung -- in
// irgendeinem Betrieb. Wer die Startseite offen hatte, sah die Zeile
// staendig verschwinden und wiederkommen.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- Die gemerkte Zeile --');

var von = h.indexOf('var _slotSpeicher = {};');
var bis = h.indexOf('window._slotGemerkt = _slotGemerkt;');
t('_slotGemerkt steht in index.html', von > 0 && bis > von, von + '/' + bis);

var welt = { window: {} };
vm.createContext(welt);
vm.runInContext(h.slice(von, bis), welt);

t('beim ersten Mal steht der Ladehinweis da',
  /Verfügbarkeit wird geladen/.test(welt._slotGemerkt('r1')));

welt._slotSpeicher['r1'] = '<span>3 Uhrzeiten verfügbar</span>';
t('danach kommt die gemerkte Zeile, nicht wieder der Ladehinweis',
  welt._slotGemerkt('r1') === '<span>3 Uhrzeiten verfügbar</span>', welt._slotGemerkt('r1'));
t('ein anderer Betrieb bekommt weiter den Ladehinweis',
  /wird geladen/.test(welt._slotGemerkt('r2')));

console.log('\n-- Die Karte benutzt die gemerkte Zeile --');

t('im Karten-Bauplan steht _slotGemerkt', /class="card-slot-info"[^>]*>\$\{_slotGemerkt\(r\.id\)\}/.test(h));
t('der Ladehinweis steht nicht mehr fest im Bauplan',
  (h.match(/Verfügbarkeit wird geladen\.\.\./g) || []).length === 1,
  (h.match(/Verfügbarkeit wird geladen\.\.\./g) || []).length + 'x');

console.log('\n-- Nebeneinander statt nacheinander --');

var lade = h.slice(h.indexOf('async function loadNextFreeSlots'));
lade = lade.slice(0, lade.indexOf('\n}\n'));
t('die Abfragen laufen parallel', /Promise\.all/.test(lade), lade.slice(0, 200));
t('keine await-Schleife mehr ueber die Karten',
  !/for \(var i = 0; i < cards\.length; i\+\+\)/.test(lade));

var einer = h.slice(h.indexOf('async function _slotEinerKarte'));
einer = einer.slice(0, einer.indexOf('window.slotKarteAuffrischen'));
// Auch beim Auffrischen: nicht schreiben, wenn dasselbe drinsteht.
t('geschrieben wird nur bei einer echten Aenderung',
  /if \(infoEl && infoEl\.innerHTML !== html\) infoEl\.innerHTML = html;/.test(einer), einer.slice(-300));
t('das Ergebnis wird gemerkt', /_slotSpeicher\[rid\] = html;/.test(einer));

console.log('\n-- Der Echtzeit-Ausloeser --');

var kanal = h.slice(h.indexOf(".channel('tables-realtime')"));
kanal = kanal.slice(0, kanal.indexOf('realtimeSubscriptions.push(tablesChannel)'));
t('er zeichnet nicht mehr sofort die ganze Liste',
  !/if \(typeof renderRestaurants === 'function'\) renderRestaurants\(\);/.test(kanal), kanal.slice(-400));
t('er frischt die eine betroffene Karte sofort auf',
  /slotKarteAuffrischen\(t\.restaurant_id\)/.test(kanal));
t('und zeichnet die Liste erst nach einer Ruhepause',
  /renderRestaurantsBald\(\)/.test(kanal));

var entprellt = h.slice(h.indexOf('function renderRestaurantsBald'));
entprellt = entprellt.slice(0, entprellt.indexOf('window.renderRestaurantsBald'));
t('der Timer wird bei jeder neuen Meldung zurueckgesetzt', /clearTimeout\(_neuZeichnenTimer\)/.test(entprellt));
t('und der eingestellte Filter bleibt erhalten',
  /renderRestaurants\(currentRestaurantFilter\)/.test(entprellt), entprellt);

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
