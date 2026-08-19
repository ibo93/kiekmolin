// DIE SEITE VERSPRICHT NUR NOCH, WAS DAS HAUS WIRKLICH KANN.
//
// GEMELDET WURDE
// --------------
// "manche meine Kunden haben kein online reservieren oder bestellen oder
//  haben beides" -- als Antwort auf die Frage, ob "Tisch reservieren" in den
// Google-Titel soll.
//
// WAS DAHINTERSTECKTE
// -------------------
// Der Erzeuger der oeffentlichen Seiten hat die Schalter nie gelesen. Das Wort
// "features" kam in build-seo-pages.js kein einziges Mal vor. Also stand auf
// JEDER Restaurantseite dasselbe:
//   - Titel "Speisekarte & online bestellen"
//   - Knopf "Online bestellen bei ..."
//   - Abschnitt "Tisch reservieren bei ..."
//   - acceptsReservations: true, OrderAction UND ReserveAction
//   - unten am Handy "Abholung · Lieferung · kostenlos"
// Auch bei Haeusern, die weder liefern noch Reservierungen annehmen.
//
// Fuer den Gast: klicken, nichts finden, wegklicken. Fuer Google: Titel und
// Seite versprechen etwas, das die Seite nicht einloest.
//
// Die Gast-App wertet dieselben Schalter laengst aus. Nur der Erzeuger nicht.
//
// WICHTIG: Abwesenheit heisst "kann es". no_ordering/no_reservations sind
// Ausschluesse, keine Freigaben. Andersherum waeren mit einem Schlag alle
// Bestell-Knoepfe verschwunden.
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var DATEI = path.join(__dirname, '..', 'build-seo-pages.js');
var SRC = fs.readFileSync(DATEI, 'utf8');

// Die Helfer wirklich ausfuehren, nicht nur den Quelltext lesen.
function schneide(name) {
    var i = SRC.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = SRC.indexOf('{', i), d = 0;
    for (var k = j; k < SRC.length; k++) {
        if (SRC[k] === '{') d++;
        else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
    }
    return '';
}
var H = new Function(schneide('featureListe') + '\n' + schneide('kannBestellen') + '\n' + schneide('kannReservieren')
    + '\n; return { kannBestellen: kannBestellen, kannReservieren: kannReservieren, featureListe: featureListe };')();

// ---- 1. Der Grundsatz: ohne Angabe kann das Haus beides --------------------
// Der gefaehrlichste Fehler waere hier andersherum. Dann waeren auf einen
// Schlag alle Bestell-Knoepfe weg -- bei jedem Restaurant.
t('kein features-Feld: bestellen JA', H.kannBestellen({}) === true);
t('kein features-Feld: reservieren JA', H.kannReservieren({}) === true);
t('features null: bestellen JA', H.kannBestellen({ features: null }) === true);
t('leere Liste: beides JA', H.kannBestellen({ features: [] }) && H.kannReservieren({ features: [] }));
t('andere Flags stoeren nicht',
  H.kannBestellen({ features: ['lieferung', 'abholung', 'loyalty_points'] }) === true);

// ---- 2. Die Ausschluesse greifen ------------------------------------------
t('no_ordering: bestellen NEIN', H.kannBestellen({ features: ['no_ordering'] }) === false);
t('no_ordering: reservieren bleibt JA', H.kannReservieren({ features: ['no_ordering'] }) === true);
t('no_reservations: reservieren NEIN', H.kannReservieren({ features: ['no_reservations'] }) === false);
t('beide Flags: beides NEIN',
  !H.kannBestellen({ features: ['no_ordering', 'no_reservations'] })
  && !H.kannReservieren({ features: ['no_ordering', 'no_reservations'] }));

// ---- 3. Robust gegen die Formate, die wirklich vorkommen -------------------
// features kommt aus Postgres -- mal als Array, mal als JSON-Text.
t('features als JSON-Text', H.kannBestellen({ features: '["no_ordering"]' }) === false);
t('features als Komma-Text', H.kannReservieren({ features: 'no_reservations,lieferung' }) === false);
t('Leerzeichen um die Werte stoeren nicht',
  H.kannBestellen({ features: [' no_ordering '] }) === false);
t('kaputter JSON-Text stuerzt nicht ab',
  (function () { try { H.kannBestellen({ features: '{kaputt' }); return true; } catch (e) { return false; } })());
t('ein Objekt statt Liste gilt als "kann beides"',
  H.kannBestellen({ features: { a: 1 } }) === true);

// ---- 4. Der Titel -- alle vier Faelle --------------------------------------
// Nachgebaut aus dem Quelltext, damit der Test die echte Regel prueft.
(function () {
    var i = SRC.indexOf('const title = (function () {');
    var j = SRC.indexOf('})();', i) + 5;
    t('die Titel-Regel ist gefunden worden', i > 0 && j > i, i + ' / ' + j);
    var regel = SRC.slice(i, j).replace('const title =', 'return');

    var titel = new Function('titelName', 'rest', 'kannBestellen', 'kannReservieren', regel);
    function bau(name, feats) { return titel(name, { features: feats }, H.kannBestellen, H.kannReservieren); }

    t('beides: Karte, bestellen und reservieren',
      bau('La Piazza Greetsiel', []) === 'La Piazza Greetsiel – Speisekarte, bestellen & reservieren',
      bau('La Piazza Greetsiel', []));
    t('nur bestellen: kein Wort von Reservierung',
      bau('Pizzeria Pronto Emden', ['no_reservations']) === 'Pizzeria Pronto Emden – Speisekarte & online bestellen',
      bau('Pizzeria Pronto Emden', ['no_reservations']));
    t('nur reservieren: kein Wort von Bestellen',
      bau('Landhaus Greetsiel', ['no_ordering']) === 'Landhaus Greetsiel – Speisekarte & Tisch reservieren',
      bau('Landhaus Greetsiel', ['no_ordering']));
    t('keins von beidem: nur Karte und Zeiten',
      bau('Café Utkiek', ['no_ordering', 'no_reservations']) === 'Café Utkiek – Speisekarte & Öffnungszeiten',
      bau('Café Utkiek', ['no_ordering', 'no_reservations']));

    // Laenge: Google zeigt rund 55-60 Zeichen. Lieber ein kuerzerer Zusatz,
    // der ganz dasteht, als ein langer, der mitten im Wort abgeschnitten wird.
    t('kurzer Name -> lange Fassung', bau('La Piazza Greetsiel', []).length <= 60);
    t('langer Name -> kurze Fassung, damit nichts abgeschnitten wird',
      bau('Restaurant Zum Alten Fährhaus Carolinensiel', []) === 'Restaurant Zum Alten Fährhaus Carolinensiel – Bestellen & reservieren',
      bau('Restaurant Zum Alten Fährhaus Carolinensiel', []));
    t('sehr langer Name: der Zusatz steht trotzdem vollstaendig da',
      /– (Bestellen & reservieren|Online bestellen|Tisch reservieren|Speisekarte)$/
        .test(bau('Restaurant Zum Alten Fährhaus Carolinensiel', [])));

    // Gegenprobe: die alte feste Zeile darf nicht zurueckkehren.
    t('der feste Titel fuer alle ist weg',
      !/const title = titelName \+ ' – Speisekarte & online bestellen'/.test(SRC));
})();

// ---- 5. Die Seite selbst -- wirklich bauen und nachsehen -------------------
// Ein Titel allein waere nur die ehrliche Zeile ueber einer unehrlichen Seite.
(function () {
    // Nur pruefen, dass die Knoepfe hinter den Schaltern haengen. Die ganze
    // Seite zu erzeugen braucht Supabase, das ist hier nicht erreichbar.
    t('der Hero-Bestellknopf haengt an kannBestellen',
      /kannBestellen\(rest\) \? '<a class="cta-primary"[^\n]*Online bestellen/.test(SRC));
    t('der Hero-Reservierknopf an kannReservieren',
      /kannReservieren\(rest\) \? '<a class="cta-ghost"[^\n]*Tisch reservieren/.test(SRC));
    t('kann das Haus keins von beidem, steht wenigstens die Karte da',
      /!kannBestellen\(rest\) && !kannReservieren\(rest\)[\s\S]{0,200}Speisekarte ansehen/.test(SRC));
    t('der Reservier-Abschnitt der Detailseite ist eingeklammert',
      /\(kannReservieren\(rest\)\s*\n\s*\? '<h2>Tisch reservieren bei/.test(SRC));
    t('die Leiste am Handy verspricht keine Lieferung mehr, wo keine ist',
      /kannBestellen\(rest\) \? 'Abholung · Lieferung · kostenlos'/.test(SRC));
})();

// ---- 6. Strukturierte Daten ------------------------------------------------
// Eine ReserveAction bei einem Haus ohne Reservierung ist eine Falschaussage
// an Google -- und genau die loest den Knopf im Suchergebnis aus.
t('acceptsReservations ist nicht mehr fest true',
  !/item\.acceptsReservations = true;/.test(SRC));
t('sondern richtet sich nach dem Haus',
  /item\.acceptsReservations = kannReservieren\(rest\);/.test(SRC));
t('die OrderAction haengt an kannBestellen', /if \(kannBestellen\(rest\)\) aktionen\.push\(/.test(SRC));
t('die ReserveAction an kannReservieren', /if \(kannReservieren\(rest\)\) aktionen\.push\(/.test(SRC));
t('ohne Aktionen wird das Feld gar nicht erst gesetzt',
  /if \(aktionen\.length\) item\.potentialAction = aktionen;/.test(SRC));

// ---- 7. Der Grund steht im Quelltext ---------------------------------------
t('warum der Generator die Schalter jetzt liest, steht in der Datei',
  /kam in\s*\n?\/\/ dieser Datei kein einziges Mal vor|kein einziges Mal vor/.test(SRC));
t('und die Regel "Abwesenheit heisst kann es" ist festgehalten',
  /Ausschluesse, keine\s*\n?\/\/ Freigaben/.test(SRC));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
