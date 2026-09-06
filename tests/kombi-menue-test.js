// KOMBI-MENUES -- UND DIE ZAHL, DIE WEHTUT.
//
// Idee von Ibo am 04.09.2026: "Pizza + Getraenk + Dessert = 15,90 statt
// 18,40". Der staerkste Hebel auf den Bonwert.
//
// NACHGESEHEN STATT ANGENOMMEN: das Geruest gab es schon.
// Optionsgruppen koennen Pflicht-Auswahl (selection_type 'single',
// min_selections 1). Ein Kombi-Menue ist also ein Gericht zum Festpreis
// plus je Baustein eine Pflichtgruppe mit Aufpreis 0 -- keine neue
// Tabelle, keine neue Abfrage beim Gast, und vor allem KEIN zweiter
// Preis-Schutz. Eine eigene Kombi-Logik waere eine zweite Stelle, an der
// ein Gast Preise erfinden koennte.
//
// DER GEFAEHRLICHE TEIL IST NICHT DIE TECHNIK, SONDERN DIE ZAHL.
//
// Ein Kombipreis gilt fuer JEDE Auswahl. Steht in "Hauptgericht" ein
// 24-EUR-Gericht, bekommt der Gast es zum Menuepreis. Der Wirt sieht
// beim Anlegen die schoene Zahl ("der Gast spart 2,50") und uebersieht
// den teuersten Fall. Nur die Ersparnis zu zeigen waere die halbe
// Wahrheit -- und die halbe Wahrheit ist Regel 6.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var a = h.indexOf('var KOMBI = {');
var e = h.indexOf('window.KOMBI = KOMBI;');
t('KOMBI wurde gefunden', a > 0 && e > a, a + '/' + e);
var KOMBI = new Function(h.slice(a, e) + '; return KOMBI;')();

var karte = [
    { category_id: 'haupt', name: 'Margherita', base_price: 8.50 },
    { category_id: 'haupt', name: 'Diavola',    base_price: 14.00 },
    { category_id: 'haupt', name: 'Trüffel',    base_price: 24.00 },
    { category_id: 'haupt', name: 'Ausverkauft', base_price: 30.00, is_available: false },
    { category_id: 'haupt', name: 'Ohne Preis', base_price: null },
    { category_id: 'trink', name: 'Wasser',     base_price: 2.50 },
    { category_id: 'trink', name: 'Wein',       base_price: 4.00 }
];

// ---- 1. Welche Preise zaehlen ---------------------------------------
console.log('\n-- Welche Gerichte zaehlen --');
var haupt = KOMBI.preiseDerKategorie('haupt', karte);
t('nur die eigene Kategorie', haupt.length === 3, haupt.join(','));
t('aufsteigend sortiert', haupt.join(',') === '8.5,14,24', haupt.join(','));
t('ausverkaufte Gerichte zaehlen nicht mit', haupt.indexOf(30) === -1, haupt.join(','));
// Ein Gericht ohne Preis waere sonst eine unsichtbare 0 und wuerde den
// guenstigsten Warenkorb auf null druecken.
t('Gerichte ohne Preis fallen raus', haupt.indexOf(0) === -1, haupt.join(','));

// ---- 2. Beide Enden, nicht nur das schoene --------------------------
console.log('\n-- Der guenstigste UND der teuerste Warenkorb --');
var bausteine = [
    { name: 'Hauptgericht', preise: KOMBI.preiseDerKategorie('haupt', karte) },
    { name: 'Getränk',      preise: KOMBI.preiseDerKategorie('trink', karte) }
];
var r = KOMBI.rechnen(bausteine, 13.90);
t('guenstigster Warenkorb 11,00', r.guenstigste === 11, r.guenstigste);
t('teuerster Warenkorb 28,00', r.teuerste === 28, r.teuerste);
t('bei der guenstigsten Wahl zahlt der Gast DRAUF',
  Math.abs(r.ersparnisMin - (-2.90)) < 0.001, r.ersparnisMin);
// DAS ist die Zahl, die dem Wirt wehtut -- und die er sehen muss.
t('bei der teuersten Wahl spart er 14,10',
  Math.abs(r.ersparnisMax - 14.10) < 0.001, r.ersparnisMax);
t('das Menü gilt als gueltig', r.gueltig === true, JSON.stringify(r));

// ---- 3. Was NICHT durchgehen darf -----------------------------------
console.log('\n-- Was der Assistent abfangen muss --');
var leer = KOMBI.rechnen([
    { name: 'Hauptgericht', preise: KOMBI.preiseDerKategorie('haupt', karte) },
    { name: 'Dessert',      preise: KOMBI.preiseDerKategorie('gibtsnicht', karte) }
], 12);
t('ein Baustein ohne Gerichte macht das Menü ungueltig', leer.gueltig === false, JSON.stringify(leer));
t('und er wird benannt', leer.leere.join(',') === 'Dessert', leer.leere.join(','));

t('ein einzelner Baustein ist kein Menü',
  KOMBI.rechnen([bausteine[0]], 10).gueltig === false, 'wurde durchgelassen');
t('Preis 0 ist kein Menü', KOMBI.rechnen(bausteine, 0).gueltig === false, 'wurde durchgelassen');
t('Unsinn als Preis ebenfalls', KOMBI.rechnen(bausteine, 'abc').gueltig === false, 'wurde durchgelassen');

// Ein Tippfehler wie 1,90 statt 11,90 verschenkt bei JEDER Auswahl Geld.
t('ein absurd niedriger Preis wird als Verdacht gemeldet',
  KOMBI.rechnen(bausteine, 1.90).unterEinkauf === true, 'faellt nicht auf');
t('ein normaler Preis nicht', KOMBI.rechnen(bausteine, 13.90).unterEinkauf === false, 'falscher Alarm');

// ---- 4. Angelegt wird aus vorhandenen Teilen -------------------------
console.log('\n-- Gebaut aus dem, was es schon gibt --');
t('es gibt eine Anlege-Funktion', /async function kombiAnlegen\(/.test(h), 'fehlt');
t('das Menü ist ein normales Gericht', /sendeMitRueckfall\('menu_items'/.test(h), 'eigene Tabelle?');
t('je Baustein eine Pflichtgruppe',
  /selection_type: 'single',\s*\n\s*min_selections: 1,\s*\n\s*max_selections: 1/.test(h), 'keine Pflicht-Auswahl');
// Der Kombipreis steht am Gericht. Stuende er auch an der Auswahl,
// zahlte der Gast doppelt.
t('die Auswahl kostet keinen Aufpreis', /name: b\.gerichte\[j\]\.name,\s*\n\s*price: 0,/.test(h), 'Aufpreis nicht 0');
t('unbekannte Spalten werden weggenommen statt aufzugeben',
  /Could not find the '\(\[a-z_\]\+\)'/.test(h), 'kein Rueckfall');
// Die Lehre vom Mindestbestellwert: 204 beweist nichts.
t('eine leere Antwort gilt NICHT als Erfolg',
  /Die Datenbank hat nichts zurueckgegeben/.test(h), 'leere Antwort waere Erfolg');

// ---- 5. Kein zweiter Preis-Schutz ------------------------------------
t('es wurde keine eigene Kombi-Tabelle erfunden',
  !/rest\/v1\/(kombis|combos|menu_combos)/.test(h), 'neue Tabelle -> neuer Preis-Schutz noetig');

// ---- 6. DER KNOPF, DER GEFEHLT HAT ----------------------------------
console.log('\n-- Kann der Wirt es ueberhaupt aufrufen? --');
//
// Am 04.09.2026 standen Rechnung und Anlegen fertig im Code -- und
// niemand rief sie auf. Ibo haette ein Kombi-Menue nirgends anlegen
// koennen. Genau der Fehler aus #209: die Gastseite las Groessen, der
// Scanner schrieb sie, und dazwischen konnte der Wirt nichts tun.
//
// Ein Test, der nur die Rechnung prueft, haette das nie gemerkt.
t('es gibt einen Knopf in der Speisekarte', /onclick="kombiOeffnen\(\)"/.test(h), 'kein Knopf');
t('und die Maske dahinter', /function kombiOeffnen\(\)/.test(h), 'keine Maske');
t('der Knopf heisst verstaendlich', /Menü zusammenstellen/.test(h), 'unklarer Text');
t('die Maske ruft das Anlegen wirklich auf', /await kombiAnlegen\(restId, zielKat, name, preis, bausteine\)/.test(h), 'ruft nichts auf');

// ---- 7. Was die Maske dem Wirt zeigt --------------------------------
console.log('\n-- Beide Enden, nicht nur das schoene --');
t('der guenstigste Warenkorb steht da', /Günstigster Warenkorb/.test(h), 'fehlt');
t('der teuerste auch', /Teuerster Warenkorb/.test(h), 'fehlt');
// Die Zahl, die wehtut, bekommt eine eigene Warnung.
t('und die Warnung, was der teuerste Fall kostet',
  /gibst du .* ab[\s\S]{0,120}gilt für JEDE Auswahl/.test(h), 'keine Warnung');
t('ein Baustein ohne Gericht wird in der Maske gemeldet',
  /unbestellbar/.test(h), 'wird verschwiegen');
t('ein Tippfehler beim Preis auch', /Tippfehler/.test(h), 'wird verschwiegen');
t('und der Fall, in dem es gar kein Angebot ist',
  /Dann ist es kein Angebot/.test(h), 'wird verschwiegen');

// ---- 8. Kleinigkeiten, die sonst wehtun ------------------------------
console.log('\n-- Doppelklick und Fehlermeldungen --');
// Zwei Klicks = zwei Menues in der Karte, und der Wirt raeumt von Hand auf.
t('der Knopf sperrt beim Anlegen', /knopf\.disabled = true/.test(h), 'Doppelklick moeglich');
t('ein Fehler wird im Klartext gezeigt', /Nicht angelegt: /.test(h), 'stiller Fehlschlag');
t('und der Knopf danach wieder freigegeben',
  /knopf\.disabled = false/.test(h), 'Maske bleibt tot');
// Ohne zwei Kategorien gibt es nichts zu kombinieren -- das sagen,
// statt eine leere Maske hinzustellen.
t('ohne zwei Kategorien wird es gesagt',
  /mindestens zwei Kategorien/.test(h), 'leere Maske');

console.log('\n' + (n - ok === 0 ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
if (n - ok > 0) process.exit(1);
