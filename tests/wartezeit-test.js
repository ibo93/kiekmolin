// DIE WARTEZEIT WAR FEST VERDRAHTET.
//
// GEMELDET WURDE
// --------------
// "So wie Abholer 25 min und liefern 60 min das die es einstellen können"
// und "Lass in der App das einstellen können wo kann der Gastronom selber
// einstellen so bekommt der Gast".
//
// WAS DAHINTERSTECKTE
// -------------------
// Im Annahme-Dialog stand:
//     var defaultTime = order.order_type === 'delivery' ? 45 : 25;
// 45 und 25 Minuten, fuer JEDES Restaurant gleich, nirgends aenderbar. Eine
// Pizzeria mit einem Fahrer und eine mit vieren brauchen aber verschiedene
// Zusagen -- und diese Zahl ist das, was der Gast als Versprechen liest.
//
// Auf dem Kassen-Weg war es sogar noch grober: dort galt EIN Wert fuer beides
// (autoAcceptMinutes, voreingestellt 30). Ein Abholer bekam dieselbe Zusage
// wie eine Lieferung quer durch den Ort.
//
// WARUM IN features UND NICHT IN EIGENEN SPALTEN
// ----------------------------------------------
// Das Muster gibt es hier schon (order_stop:15) und es braucht keine
// Datenbank-Aenderung. Eine fehlende Spalte haette bedeutet: der Wert steht
// nur im Browser des Wirts, und auf dem Tablet in der Kueche ist er anders.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    if (CODE.slice(i - 6, i) === 'async ') i -= 6;
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

var vm = new Function(schneide('vorbereitungsMinuten') + '; return vorbereitungsMinuten;')();

// ---- 1. Ohne Einstellung bleibt alles wie bisher ---------------------------
// Wichtig: kein Restaurant darf durch diese Aenderung ploetzlich andere
// Zeiten zusagen als vorher.
t('ohne Einstellung: Abholung 25', vm({}, 'pickup') === 25);
t('ohne Einstellung: Lieferung 45', vm({}, 'delivery') === 45);
t('ohne Restaurant kein Absturz', vm(null, 'pickup') === 25 && vm(undefined, 'delivery') === 45);
t('leere features: unveraendert', vm({ features: [] }, 'pickup') === 25);
t('features kein Array: unveraendert', vm({ features: 'kaputt' }, 'delivery') === 45);
t('andere Flags stoeren nicht',
  vm({ features: ['lieferung', 'order_stop:20', 'no_reservations'] }, 'pickup') === 25);

// ---- 2. Die Einstellung greift, und zwar getrennt --------------------------
t('Abholung einstellbar', vm({ features: ['prep_pickup:25'] }, 'pickup') === 25);
t('Lieferung einstellbar', vm({ features: ['prep_delivery:60'] }, 'delivery') === 60);
t('genau der gewuenschte Fall: 25 / 60',
  vm({ features: ['prep_pickup:25', 'prep_delivery:60'] }, 'pickup') === 25
  && vm({ features: ['prep_pickup:25', 'prep_delivery:60'] }, 'delivery') === 60);

// Der eigentliche Zweck: die beiden duerfen sich NICHT vermischen.
t('die Abholzeit faerbt nicht auf die Lieferung ab',
  vm({ features: ['prep_pickup:15'] }, 'delivery') === 45,
  vm({ features: ['prep_pickup:15'] }, 'delivery'));
t('und umgekehrt genauso',
  vm({ features: ['prep_delivery:90'] }, 'pickup') === 25);

// dine_in gilt als Abholung -- der Gast ist im Haus, es wird nicht gefahren.
t('"hier essen" nimmt die Abholzeit',
  vm({ features: ['prep_pickup:20', 'prep_delivery:70'] }, 'dine_in') === 20);

// ---- 3. Grenzen -- eine Zusage muss ehrlich bleiben ------------------------
t('unter 5 Minuten wird nicht angenommen', vm({ features: ['prep_pickup:2'] }, 'pickup') === 25);
t('ueber 180 Minuten ebenso wenig', vm({ features: ['prep_delivery:999'] }, 'delivery') === 45);
t('genau 5 ist erlaubt', vm({ features: ['prep_pickup:5'] }, 'pickup') === 5);
t('genau 180 auch', vm({ features: ['prep_delivery:180'] }, 'delivery') === 180);
t('Unsinn im Wert faellt auf den Standard zurueck',
  vm({ features: ['prep_pickup:abc'] }, 'pickup') === 25);
t('ein halber Eintrag ohne Zahl ebenso',
  vm({ features: ['prep_pickup:'] }, 'pickup') === 25);

// ---- 4. Die fest verdrahtete Zeile ist weg ---------------------------------
t('die alte Zeile im Annahme-Dialog existiert nicht mehr',
  !/var defaultTime = order\.order_type === 'delivery' \? 45 : 25;/.test(CODE));
t('der Dialog fragt jetzt das Restaurant',
  /var defaultTime = vorbereitungsMinuten\(_ar0, order\.order_type\);/.test(CODE));

// ---- 5. Der Kassen-Weg nimmt dieselbe Zeit ---------------------------------
// Sonst haetten wir zwei Wahrheiten: eine im Dialog, eine bei der Kasse.
(function () {
    var f = schneide('_autoAcceptAfterPosPush');
    t('der Kassen-Weg ist gefunden worden', f.length > 400, f.length);
    t('er benutzt die Wartezeit des Restaurants', /vorbereitungsMinuten\(_r, order\.order_type\)/.test(f), f.slice(0, 400));
    t('und faellt nur ohne Einstellung auf den Kassen-Wert zurueck',
      /autoAcceptMinutes/.test(f));
    t('die Grenzen gelten auch dort', /minutes < 5/.test(f) && /minutes > 180/.test(f));
})();

// ---- 6. Speichern -- und zwar ehrlich --------------------------------------
(function () {
    var f = schneide('savePrepMinutes');
    t('savePrepMinutes existiert', f.length > 600, f.length);
    t('alte Eintraege werden entfernt, bevor neue kommen',
      /features\.filter\(function \(f\) \{[\s\S]{0,120}prep_\(pickup\|delivery\)/.test(f), 'kein Aufraeumen');
    t('beide Werte werden geschrieben',
      /features\.push\('prep_pickup:' \+ abholung, 'prep_delivery:' \+ lieferung\)/.test(f));
    t('die Grenzen greifen schon beim Speichern',
      /Math\.min\(180, Math\.max\(5, v\)\)/.test(f));
    t('der begrenzte Wert wird ins Feld zurueckgeschrieben -- sonst luegt die Anzeige',
      /eA\.value = abholung/.test(f) && /eL\.value = lieferung/.test(f));

    // Dieselbe Falle wie bei den Optionsgruppen: ein PATCH, das keine Zeile
    // trifft, ist fuer die Datenbank kein Fehler.
    t('es wird nachgesehen, ob die Datenbank die Aenderung angenommen hat',
      /return=representation/.test(f) && /zurueck\.length === 0/.test(f));
    t('und ohne Bestaetigung steht KEIN "gespeichert" da',
      f.indexOf('Wartezeit NICHT gespeichert') < f.indexOf('Wartezeit gespeichert:'),
      f.indexOf('Wartezeit NICHT gespeichert') + ' / ' + f.indexOf('Wartezeit gespeichert:'));
})();

// ---- 7. Die Bedienoberflaeche ----------------------------------------------
t('es gibt ein Feld fuer die Abholung', /id="settingPrepPickup"/.test(H));
t('und eins fuer die Lieferung', /id="settingPrepDelivery"/.test(H));
t('beide speichern beim Aendern', (H.match(/onchange="savePrepMinutes\(\)"/g) || []).length === 2);
t('die Felder werden beim Laden gefuellt',
  /pickEl\.value = vorbereitungsMinuten\(restaurant, 'pickup'\)/.test(CODE)
  && /delEl\.value = vorbereitungsMinuten\(restaurant, 'delivery'\)/.test(CODE));
t('dem Wirt wird gesagt, wofuer die Zahl gut ist',
  /Das sieht der Gast, wenn du die Bestellung annimmst/.test(H));

// ---- 8. Der Grund steht im Quelltext ---------------------------------------
t('warum die Zeiten getrennt sind, ist festgehalten',
  /Pizzeria mit einem Fahrer und eine mit vieren/.test(H));
t('und warum sie in features stehen und nicht in eigenen Spalten',
  /braucht keine neue Spalte|braucht keine Datenbank-Aenderung/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
