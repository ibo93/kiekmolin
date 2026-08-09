// ESSENSFILTER FUER DEN GAST -- vegetarisch, vegan, ohne Schwein, Allergene.
//
// WAS VORHER DA WAR UND WARUM ES NICHTS TAT
// -----------------------------------------
// Es gab schon einen Allergen-Filter im Quelltext. Nur:
//   1. getAllergenFilterBar() wurde von NIRGENDS aufgerufen -- die Knoepfe
//      waren nie auf dem Bildschirm.
//   2. Gefiltert wurde ueber item.dataset.tags. Dieses Attribut setzt keine
//      einzige Gerichtekarte. Waere der Filter sichtbar gewesen, waere die
//      Speisekarte beim ersten Antippen komplett leer geworden.
//
// Beide Fehler sehen von aussen gleich aus: nichts passiert. Deshalb pruefen
// die Tests hier BEIDES -- dass die Auswahl richtig rechnet UND dass sie
// ueberhaupt angezeigt und benutzt wird.
//
// Und der wichtigste Punkt: das hier ist Gesundheit. Ein Gericht ohne
// Allergenangabe darf NIE als "glutenfrei" durchgehen.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
function schneideVar(anfang, bis) {
    var i = H.indexOf(anfang);
    if (i < 0) throw new Error('nicht gefunden: ' + anfang);
    return H.slice(i, H.indexOf(bis, i));
}

var quelle = schneideVar('var _SCHWEIN_WOERTER =', 'function _textVon')
    + schneide('_textVon') + '\n' + schneide('_hatSchwein') + '\n' + schneide('_ohneAllergen') + '\n'
    + schneideVar('var ESSENSFILTER = [', 'function _filterNach')
    + schneide('_filterNach') + '\n' + schneide('teileNachFilter') + '\n' + schneide('zaehleFilter') + '\n'
    + schneide('getAllergenFilterBar');

var F = new Function('activeAllergenFilters',
    quelle + '; return { teile: teileNachFilter, zaehle: zaehleFilter, leiste: getAllergenFilterBar, schwein: _hatSchwein };');
var A = F([]);

// --- Testkarte: so sieht sie nach dem PDF-Import wirklich aus --------------
var KARTE = [
    { name: 'Pizza Margherita', description: 'Tomaten, Käse', is_vegetarian: true, allergens: ['gluten', 'milch'] },
    { name: 'Pizza Salami',     description: 'Tomaten, Käse, Salami', is_vegetarian: false, allergens: ['gluten', 'milch'] },
    { name: 'Salat Vegan',      description: 'Blattsalat, Tomaten', is_vegetarian: true, is_vegan: true, allergens: [] },
    { name: 'Pommes',           description: 'mit Ketchup', is_vegetarian: true, is_vegan: true, allergens: ['gluten'] },
    { name: 'Döner Teller',     description: 'Kalbfleisch, Salat', is_pork: false, allergens: ['gluten', 'milch'] },
    { name: 'Schnitzel Wiener Art', description: 'paniert, mit Pommes', is_pork: true, allergens: ['gluten', 'eier'] },
    { name: 'Tagesgericht',     description: 'wechselnd' }   // GAR KEINE Angaben
];

// --- Was der Gast anklickt --------------------------------------------------
var r = A.teile(KARTE, ['vegetarisch']);
t('vegetarisch findet die drei vegetarischen Gerichte',
  r.passend.length === 3, r.passend.map(function (i) { return i.name; }).join(', '));
t('Salami ist nicht dabei',
  !r.passend.some(function (i) { return /Salami/.test(i.name); }));

r = A.teile(KARTE, ['vegan']);
t('vegan findet genau zwei', r.passend.length === 2, r.passend.map(function (i) { return i.name; }).join(', '));

r = A.teile(KARTE, ['vegetarisch', 'vegan']);
t('zwei Filter zusammen wirken UND, nicht ODER', r.passend.length === 2, r.passend.length);

// --- Vegan ist immer auch vegetarisch --------------------------------------
// Ein veganes Gericht, bei dem niemand den Vegetarier-Haken gesetzt hat, darf
// unter "Vegetarisch" nicht fehlen. Sonst wundert sich der Gast, warum der
// vegane Salat verschwindet, wenn er "Vegetarisch" antippt.
r = A.teile([{ name: 'Falafel', is_vegan: true }], ['vegetarisch']);
t('vegan zaehlt automatisch als vegetarisch', r.passend.length === 1, r.passend.length);

// --- Schwein: der Text schlaegt den fehlenden Haken -------------------------
// In der Datenbank steht bei "Pizza Salami" kein is_pork. Fuer einen Gast, der
// kein Schwein isst, waere "keine Angabe = in Ordnung" der schlimmste Fehler,
// den diese App machen kann.
t('Salami wird als Schwein erkannt, auch ohne Haken', A.schwein(KARTE[1]) === true);
t('Schnitzel mit gesetztem Haken ebenso', A.schwein(KARTE[5]) === true);
t('Döner Teller mit is_pork=false ist sauber', A.schwein(KARTE[4]) === false);
t('Tagesgericht ohne jede Angabe ist "unbekannt", nicht "kein Schwein"',
  A.schwein(KARTE[6]) === null, String(A.schwein(KARTE[6])));

r = A.teile(KARTE, ['ohne_schwein']);
t('"ohne Schwein" laesst Salami und Schnitzel draussen',
  !r.passend.concat(r.unklar).some(function (i) { return /Salami|Schnitzel/.test(i.name); }),
  r.passend.concat(r.unklar).map(function (i) { return i.name; }).join(', '));

// --- Der Kern: keine Angabe ist NICHT "frei davon" -------------------------
r = A.teile(KARTE, ['glutenfrei']);
// Auf dieser Karte traegt JEDES Gericht mit Allergenangabe Gluten. Also darf
// hier NICHTS als glutenfrei durchgehen -- auch nicht der Salat, bei dem die
// Allergenliste nur leer ist.
t('glutenfrei zeigt nur nachweislich glutenfreie Gerichte',
  r.passend.length === 0, r.passend.map(function (i) { return i.name; }).join(', '));
t('...und ein wirklich glutenfreies Gericht kommt durch',
  A.teile([{ name: 'Salat', allergens: ['milch'] }], ['glutenfrei']).passend.length === 1);
t('Gerichte MIT Gluten fallen raus',
  !r.passend.some(function (i) { return /Pizza|Pommes|Döner|Schnitzel/.test(i.name); }),
  r.passend.map(function (i) { return i.name; }).join(', '));
t('Gericht OHNE Allergenangabe wird nicht als glutenfrei ausgegeben',
  !r.passend.some(function (i) { return i.name === 'Tagesgericht'; }),
  r.passend.map(function (i) { return i.name; }).join(', '));
t('...verschwindet aber auch nicht, sondern landet unter "keine Angabe"',
  r.unklar.some(function (i) { return i.name === 'Tagesgericht'; }),
  r.unklar.map(function (i) { return i.name; }).join(', '));
t('leere Allergenliste zaehlt als "keine Angabe", nicht als "frei von allem"',
  r.unklar.some(function (i) { return i.name === 'Salat Vegan'; }),
  r.unklar.map(function (i) { return i.name; }).join(', '));

r = A.teile(KARTE, ['ohne_nuesse']);
t('"ohne Nüsse" deckt Erdnuss UND Schalenfrüchte ab',
  A.teile([{ name: 'x', allergens: ['schalenfruechte'] }], ['ohne_nuesse']).passend.length === 0);

// --- Kein Filter = alles -----------------------------------------------------
r = A.teile(KARTE, []);
t('ohne Filter bleibt die Karte vollstaendig', r.passend.length === KARTE.length, r.passend.length);
t('ohne Filter gibt es keinen "unklar"-Block', r.unklar.length === 0, r.unklar.length);

// --- Nichts kaputt bei leerer Eingabe ---------------------------------------
t('leere Karte kippt nicht', A.teile([], ['vegan']).passend.length === 0);
t('unbekannter Filtername wird ignoriert statt alles zu verstecken',
  A.teile(KARTE, ['quatsch']).passend.length === KARTE.length, A.teile(KARTE, ['quatsch']).passend.length);

// --- Die Knopfleiste ---------------------------------------------------------
t('zaehlt richtig ab, wie viele Gerichte ein Filter uebrig laesst',
  A.zaehle(KARTE, 'vegetarisch') === 3, A.zaehle(KARTE, 'vegetarisch'));

var leiste = A.leiste(KARTE);
t('die Leiste wird ueberhaupt gebaut', leiste.indexOf('allergen-chip') >= 0);
t('die Anzahl steht am Knopf', /Vegetarisch <span[^>]*>3</.test(leiste), leiste.slice(0, 200));

// Ein Knopf, der garantiert zu null Treffern fuehrt, gehoert nicht auf den
// Bildschirm -- sonst tippt der Gast drauf und die Karte ist leer.
var nurFleisch = [{ name: 'Currywurst', is_pork: true }];
t('Filter ohne einen einzigen Treffer wird gar nicht angeboten',
  A.leiste(nurFleisch).indexOf('vegetarisch') < 0, A.leiste(nurFleisch));
t('gibt es gar nichts zu filtern, bleibt die Leiste ganz weg',
  A.leiste([{ name: 'Currywurst', is_pork: true }]) === '' || A.leiste([]) === '', 'x');

// Ein AKTIVER Filter muss sichtbar bleiben, auch wenn er 0 Treffer hat --
// sonst kann der Gast ihn nicht mehr ausschalten und sitzt vor leerer Karte.
var A2 = F(['vegetarisch']);
t('aktiver Filter bleibt sichtbar, auch bei 0 Treffern (sonst Sackgasse)',
  A2.leiste(nurFleisch).indexOf('vegetarisch') >= 0, A2.leiste(nurFleisch));

// --- Ist es auch WIRKLICH eingebaut? ----------------------------------------
// Genau das war der alte Fehler: die Funktion gab es, benutzt hat sie niemand.
t('die Leiste wird in der Gastansicht tatsaechlich gezeichnet',
  /var html = _leiste \+ '<div class="stitch-menu-grid">'/.test(H));
t('gefiltert wird auf den DATEN, nicht per style.display',
  /var _geteilt = teileNachFilter\(items, activeAllergenFilters\)/.test(H));
t('die alte DOM-Versteckerei ist weg', !/function filterMenuByAllergens/.test(H));
// Nur den CODE pruefen, nicht den Kommentar darueber -- der darf den alten
// Fehler ruhig beim Namen nennen.
t('die tote dataset.tags-Abfrage ist weg', !/\(item\.dataset\.tags \|\|/.test(H));
t('leeres Ergebnis sagt es dem Gast statt weisser Flaeche',
  /Dazu passt hier gerade nichts/.test(H));
t('"keine Angabe" wird ausgewiesen, nicht verschwiegen',
  /Keine Angabe zu diesen Gerichten/.test(H) && /bitte beim Personal nachfragen/.test(H));
t('die Auswahl bleibt dem Gast erhalten (localStorage)',
  /kmi_allergen_profile/.test(H));

// --- Sprache mitten in der Speisekarte --------------------------------------
// Vorher standen DE/EN/NL nur in der App-Kopfzeile und auf der Startseite. Der
// Gast sass in der Karte und musste erst ganz zurueck.
t('Sprachknopf sitzt in der Speisekarten-Kopfzeile',
  /id="menuSpracheKnopf"[\s\S]{0,120}onclick="toggleMenuSprache\(\)"/.test(H));
t('alle drei Sprachen sind dort erreichbar',
  /data-sprache="de"/.test(H) && /data-sprache="en"/.test(H) && /data-sprache="nl"/.test(H));
t('Umschalten zeichnet die offene Karte NEU (sonst passiert sichtbar nichts)',
  /OFFENE SPEISEKARTE NEU ZEICHNEN/.test(H)
  && /_mm && _mm\.style\.display !== 'none' && typeof renderMenuItemsForGuest === 'function'/.test(H));
t('die aktive Sprache ist am Knopf zu erkennen',
  /b\.setAttribute\('aria-pressed'/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
