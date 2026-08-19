// ESSENSFILTER IST BEWUSST DRAUSSEN.
//
// WARUM DIESE DATEI ÜBERHAUPT EXISTIERT
// -------------------------------------
// Der Filter (Vegetarisch, Vegan, Ohne Schwein, Glutenfrei, Laktosefrei,
// Ohne Nüsse) war gebaut, getestet und hat richtig gerechnet. Er ist trotzdem
// raus -- nicht wegen eines Fehlers im Code, sondern wegen der Daten darunter.
//
// Die Merkmale kommen aus der Speisekarte. Bei echten Kundenkarten kommt davon
// nur ein Teil an: viele Karten kennzeichnen gar nichts, andere stellenweise.
// Ein Filter mit halben Daten ist schlimmer als gar keiner -- sind von 142
// Gerichten drei als vegetarisch markiert, sieht der Gast drei und denkt, mehr
// gibt es nicht. Bei "Ohne Nüsse" ist das nicht mehr ärgerlich, sondern
// gefährlich.
//
// Diese Datei hält zwei Dinge fest:
//   1. dass er wirklich weg ist -- und nicht als toter Code herumliegt, den
//      später jemand halb wiederbelebt (genau das war der Zustand VORHER: eine
//      Filterleiste, die von nirgends aufgerufen wurde)
//   2. dass die Speisekarte ohne ihn vollständig bleibt
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

// ---- Wirklich weg, nicht nur abgeklemmt -------------------------------------
['teileNachFilter', 'getAllergenFilterBar', 'zaehleFilter', 'toggleAllergenFilter',
 'essensfilterZuruecksetzen', '_filterNeuZeichnen', '_hatSchwein', '_ohneAllergen',
 '_filterNach', 'filterMenuByAllergens'].forEach(function (f) {
    t(f + ' ist entfernt', H.indexOf('function ' + f + '(') < 0);
});
// Die Überschrift des Kommentars DARF den alten Namen nennen -- geprüft wird,
// dass die Liste selbst weg ist.
t('kein Rest von ESSENSFILTER', H.indexOf('ESSENSFILTER = [') < 0);
['activeAllergenFilters', '_SCHWEIN_WOERTER', 'kmi_allergen_profile',
 'allergen-chip'].forEach(function (x) {
    t('kein Rest von ' + x, H.indexOf(x) < 0);
});

// ---- Kein halber Wiedereinbau ------------------------------------------------
// Der Zustand VOR dem Filter war: eine Funktion, die Knöpfe baut, und niemand
// ruft sie auf. Danach war es: eine Funktion, die filtert, mit halben Daten.
// Beides soll nicht zurückkommen, ohne dass jemand den Grund liest.
t('der Grund steht im Quelltext', /ESSENSFILTER: BEWUSST ENTFERNT/.test(H));
t('und die Bedingung für eine Rückkehr auch',
  /Filter nur anbieten, wenn ein ausreichend/.test(H));

// ---- Die Karte bleibt vollständig -------------------------------------------
var render = H.slice(H.indexOf('function renderMenuItemsForGuest('),
                     H.indexOf('// Produkt-Options öffnen'));
t('die Gastansicht filtert nichts mehr heraus',
  render.indexOf('teileNachFilter') < 0 && render.indexOf('_geteilt') < 0);
t('kein "Dazu passt hier gerade nichts" mehr',
  H.indexOf('Dazu passt hier gerade nichts') < 0);
t('kein Block "Keine Angabe zu diesen Gerichten" mehr',
  H.indexOf('Keine Angabe zu diesen Gerichten') < 0);
t('das Raster wird ohne Filterleiste gebaut',
  /var html = '<div class="stitch-menu-grid">';/.test(render));

// Die Liste wird nur noch einmal aufgebaut -- vorher gab es passend + unklar
// und eine Trennstelle mittendrin.
t('es gibt nur noch EIN Raster in der Gastansicht',
  (render.match(/stitch-menu-grid/g) || []).length === 1,
  (render.match(/stitch-menu-grid/g) || []).length + ' gefunden');

// ---- Die Daten bleiben in der Datenbank -------------------------------------
// Entfernt wurde die ANZEIGE, nicht die Information. Der Assistent antwortet
// weiter auf "zeig mir was Vegetarisches", und der Import schreibt die Felder
// weiter mit -- sonst müsste man später von vorn anfangen.
t('is_vegetarian wird weiter gespeichert', /is_vegetarian:/.test(H));
t('allergens werden weiter gespeichert', /allergens:/.test(H));
t('der Assistent kann weiter nach vegetarisch filtern',
  /i\.is_vegetarian; \}\); title = 'Vegetarische Gerichte'/.test(H));
t('der PDF-Import liest Allergene weiter aus', /_PDF_ALLERGEN/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
