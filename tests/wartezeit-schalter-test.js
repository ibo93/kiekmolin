// Prueft den Schalter fuer die Wartezeit.
//
// Nicht jeder Betrieb will eine Zusage machen. Ein Imbiss mit zwei Leuten am
// Grill weiss um sechs Uhr abends nicht, ob es 15 oder 40 Minuten werden --
// und eine Zahl, die nicht haelt, ist schlimmer als gar keine: der Gast steht
// puenktlich da und wartet dann doch.
//
// Der wichtigste Test hier ist der langweiligste: dass sich fuer die
// bestehenden Betriebe NICHTS aendert. Keiner von ihnen hat den Eintrag,
// und keiner soll morgen ohne Wartezeit dastehen, weil jemand die Logik
// andersherum gebaut hat.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// Die echte Funktion aus index.html herausschneiden.
var von = h.indexOf('function wartezeitAn(');
var bis = h.indexOf('window.wartezeitAn = wartezeitAn;');
t('wartezeitAn steht in index.html', von > 0 && bis > von, von + '/' + bis);
var welt = { window: {}, Array: Array };
vm.createContext(welt);
vm.runInContext(h.slice(von, bis), welt);
var wartezeitAn = welt.wartezeitAn;

console.log('\n-- Bestehende Betriebe merken nichts --');

t('ohne features: an', wartezeitAn({}) === true);
t('features leer: an', wartezeitAn({ features: [] }) === true);
t('andere features: an', wartezeitAn({ features: ['loyalty_points', 'prep_pickup:25'] }) === true);
t('gar kein Restaurant: an (kein Absturz)', wartezeitAn(null) === true);
t('features kein Array: an', wartezeitAn({ features: 'unsinn' }) === true);

console.log('\n-- Ausgeschaltet --');

t('mit prep_off: aus', wartezeitAn({ features: ['prep_off'] }) === false);
t('prep_off zwischen anderem: aus',
  wartezeitAn({ features: ['loyalty_points', 'prep_off', 'prep_pickup:25'] }) === false);
// Kein Teiltreffer: "prep_offen" waere etwas anderes.
t('ein aehnlich heissender Eintrag zaehlt nicht',
  wartezeitAn({ features: ['prep_offen'] }) === true);

console.log('\n-- Der Schalter in der Oberflaeche --');

t('es gibt ihn', /id="settingPrepOn"/.test(h));
t('er steht standardmaessig auf an', /id="settingPrepOn"[^>]*\schecked/.test(h));
t('er speichert beim Umlegen', /id="settingPrepOn"[^>]*onchange="savePrepMinutes\(\)"/.test(h));
t('er sieht aus wie die anderen Schalter der Seite',
  /prepToggleTrack/.test(h) && /prepToggleKnob/.test(h));

var anz = h.slice(h.indexOf('function prepSchalterAnzeigen'));
anz = anz.slice(0, anz.indexOf('window.prepSchalterAnzeigen'));
t('ausgeschaltet werden die Felder gesperrt', /\.disabled = !an/.test(anz), anz.slice(0, 200));
// Ein Feld, das bedienbar aussieht und nichts bewirkt, ist eine Luege
// gegenueber dem Wirt.
t('und sichtbar ausgegraut', /opacity/.test(anz));

console.log('\n-- Speichern --');

var save = h.slice(h.indexOf('async function savePrepMinutes'));
save = save.slice(0, 2600);
t('der Zustand des Schalters wird gelesen', /settingPrepOn'\)\?\.checked/.test(save), save.slice(0, 300));
t('prep_off wird vor dem Schreiben herausgefiltert',
  /String\(f\) !== 'prep_off'/.test(save), save.slice(save.indexOf('filter'), save.indexOf('filter') + 200));
t('und nur gesetzt, wenn ausgeschaltet', /if \(!an\) features\.push\('prep_off'\)/.test(save));
// Wer den Schalter wieder anmacht, will seine Werte wiederfinden.
t('die Minuten werden auch im Aus-Zustand gespeichert',
  save.indexOf("features.push('prep_pickup:'") < save.indexOf("if (!an) features.push('prep_off')"));

console.log('\n-- Die automatische Annahme --');

var auto = h.slice(h.indexOf('var _zeitAn ='));
auto = auto.slice(0, 1800);
t('sie fragt den Schalter', /wartezeitAn\(_r\)/.test(auto), auto.slice(0, 200));
t('ausgeschaltet wird keine Zeit zugesagt',
  /JSON\.stringify\(_zeitAn \? \{/.test(auto), auto.slice(auto.indexOf('body:'), auto.indexOf('body:') + 200));
t('die Bestellung wird trotzdem angenommen',
  (auto.match(/status: 'accepted'/g) || []).length === 2, (auto.match(/status: 'accepted'/g) || []).length);
t('estimated_time steht nur im An-Zweig',
  (auto.match(/estimated_time:/g) || []).length === 1);
t('auch der lokale Abgleich haelt sich daran', /if \(_zeitAn\) \{[\s\S]{0,200}order\.estimated_minutes/.test(auto));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
