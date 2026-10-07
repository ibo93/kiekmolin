// KOHLE-KNOPF UND AB 18 NUR FUER BARS (07.10.2026).
//
// Ibo: "der Restaurant braucht das ja nicht". Die Schalter standen bei
// JEDEM Lokal im Dashboard. Jetzt nur bei Bar/Shisha/Lounge/Cocktail oder
// mit dunklem Bar-Auftritt -- und immer, wenn einer schon EIN ist.
//
// Laeuft echt in einer Sandbox. Gegenprobe (jede rot): Ausnahme "schon EIN"
// entfernt, unbekanntes Lokal versteckt, Aufruf in updateFeatureToggles entfernt.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var el = { kohleRufBox: { style: {} }, abAchtzehnBox: { style: {} } };
var sb = { window: {}, document: { getElementById: function (id) { return el[id] || null; } }, APP_DATA: { restaurants: [] }, rid: 'r1', String: String };
sb.getControlRestaurantId = function () { return sb.rid; };
vm.createContext(sb);
vm.runInContext(fn('istBarLokal') + '\n' + fn('barSchalterZeigen'), sb);
function lauf(r, f) { sb.APP_DATA.restaurants = r ? [Object.assign({ id: 'r1' }, r)] : []; el.kohleRufBox.style = {}; el.abAchtzehnBox.style = {}; sb.barSchalterZeigen(f || []); return [el.kohleRufBox.style.display, el.abAchtzehnBox.style.display].join('/'); }

t('Pizzeria: beide versteckt', lauf({ cuisine_type: ['pizza', 'italienisch'] }) === 'none/none', lauf({ cuisine_type: ['pizza'] }));
t('Shisha: beide sichtbar', lauf({ cuisine_type: ['shisha'] }) === '/', lauf({ cuisine_type: ['shisha'] }));
t('Bar (auch "Cocktailbar", Grossschreibung): sichtbar', lauf({ cuisine_type: ['Cocktailbar'] }) === '/' && lauf({ cuisine: 'Bar' }) === '/', '');
t('dunkler Bar-Auftritt: sichtbar', lauf({ cuisine_type: ['fisch'], features: ['look_dunkel'] }) === '/', '');
t('Pizzeria mit schon eingeschaltetem "Ab 18": dieser bleibt, Kohle weg', lauf({ cuisine_type: ['pizza'] }, ['ab_18']) === 'none/', lauf({ cuisine_type: ['pizza'] }, ['ab_18']));
// Frueher: unbekannt = sichtbar. Genau das liess die Kaesten bei Al Porto
// stehen, wenn das Dashboard vor dem Lokal geladen war (07.10.2026).
t('Lokal unbekannt: beide versteckt', lauf(null) === 'none/none', lauf(null));
t('... aber ein schon eingeschalteter bleibt (sonst nie mehr aus)', lauf(null, ['kohle_ruf']) === '/none', lauf(null, ['kohle_ruf']));
t('Kaesten sind im HTML von Haus aus versteckt', /<div id="kohleRufBox" style="display:none;/.test(H) && /<div id="abAchtzehnBox" style="display:none;/.test(H), '');
t('Oeffnen von Bestellungen setzt die Schalter neu', /restId === getControlRestaurantId\(\)\) updateFeatureToggles\(features\)/.test(fn('loadOrderSettings')), '');
t('"aus" ist bei Kohle/Ab 18 grau, nicht rot', /#kohleRufToggle\.off, #abAchtzehnToggle\.off[^{]*\{ background: #cbd5e1/.test(H), '');
t('"Barbecue"/"Bäckerei" zaehlen nicht als Bar', lauf({ cuisine: 'Barbecue' }) === 'none/none' && lauf({ cuisine_type: ['baeckerei'] }) === 'none/none', lauf({ cuisine: 'Barbecue' }));
t('"Weinbar"/"Strandbar" (frei eingetragen) zaehlen als Bar', lauf({ cuisine: 'Weinbar' }) === '/' && lauf({ cuisine_type: ['Strandbar'] }) === '/', lauf({ cuisine: 'Weinbar' }));
t('wird bei jedem Laden der Schalter aufgerufen', /function updateFeatureToggles\(features\) \{\s*if \(!features\) features = \[\];\s*try \{ barSchalterZeigen\(features\); \} catch \(e\) \{\}/.test(H), '');
t('Kaesten haben die Kennungen', /<div id="kohleRufBox" /.test(H) && /<div id="abAchtzehnBox" /.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
