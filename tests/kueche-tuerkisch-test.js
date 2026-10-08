// Küchenart: Türkisch, Kebabhaus, Holzkohlegrill.
//
// Ibo, 08.10.2026: "bei Restaurant der Küche gibt es nicht Türkisch --
// Kebabhaus oder Holzkohlegrill". Vorher:
//   - Admin "Restaurant anlegen": der Knopf für 'tuerkisch' hiess "Döner"
//   - Registrierung: "Döner / Türkisch" speicherte 'doener' -- und der
//     Filter "Döner" ('tuerkisch') verglich auf Gleichheit: so ein Lokal
//     fand KEIN Filter. Still, Regel 6.
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

var admin = (H.match(/value="([a-z]+)" class="cuisineTypeCheck"[^>]*><span>([^<]+)</g) || []).map(function (m) { var x = /value="([a-z]+)"[^>]*><span>([^<]+)/.exec(m); return x[1] + '=' + x[2]; });
['tuerkisch=Türkisch', 'doener=Döner', 'kebab=Kebabhaus', 'holzkohlegrill=Holzkohlegrill'].forEach(function (w) {
    t('Admin "Restaurant anlegen" hat ' + w.split('=')[1], admin.indexOf(w) >= 0, admin.join(', '));
});
var reg = H.slice(H.indexOf('id="regRestaurantCuisine"'), H.indexOf('</select>', H.indexOf('id="regRestaurantCuisine"')));
['tuerkisch">Türkisch', 'doener">Döner', 'kebab">Kebabhaus', 'holzkohlegrill">Holzkohlegrill'].forEach(function (w) {
    t('Registrierung hat ' + w.split('>')[1], reg.indexOf('value="' + w + '<') >= 0, '');
});

// Filter echt rechnen: Knopf "Türkisch" findet die ganze Familie.
var fam = H.slice(H.indexOf('var KUECHE_FAMILIE'), H.indexOf('var KUECHE_LABEL'));
var F = new Function(fam + '; return kuecheFamilie;')();
var bed = H.match(/const matchesFilter = (.*);/)[1];
function findet(filter, r) { return new Function('APP_DATA', 'r', 'kuecheFamilie', 'return ' + bed + ';')({ currentFilter: filter }, r, F); }
t('Filter "Türkisch" findet ein Lokal mit Küche "doener" (vorher nie)', findet('tuerkisch', { cuisine: 'doener' }) === true, '');
t('... und Kebabhaus und Holzkohlegrill (auch als zweite Küche)', findet('tuerkisch', { cuisine: 'kebab' }) && findet('tuerkisch', { cuisine: 'deutsch', cuisine_type: ['deutsch', 'holzkohlegrill'] }), '');
t('Filter "Italienisch" findet weiter nur Italienisch', findet('italienisch', { cuisine: 'italienisch' }) && !findet('italienisch', { cuisine: 'kebab' }), '');
t('"Alle" findet alles', findet('all', { cuisine: 'kebab' }) === true, '');

// Anzeige: nie der Schlüssel
var lab = new Function(H.slice(H.indexOf('var KUECHE_LABEL'), H.indexOf('};', H.indexOf('var KUECHE_LABEL')) + 2) + '; return KUECHE_LABEL;')();
t('Anzeige: Kebabhaus, Holzkohlegrill, Döner, Türkisch statt Schlüssel', lab.kebab === 'Kebabhaus' && lab.holzkohlegrill === 'Holzkohlegrill' && lab.doener === 'Döner' && lab.tuerkisch === 'Türkisch', JSON.stringify(lab));
var reglos = (reg.match(/value="([a-z]+)"/g) || []).map(function (v) { return v.slice(7, -1); }).filter(function (k) { return !lab[k]; });
t('jede Küche aus der Registrierung hat eine Anzeige', reglos.length === 0, reglos.join(','));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
