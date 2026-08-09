// "Karte einfügen": Text -> Gerichte, ohne KI.
//
// Eingabe ist der Text, wie ihn ein Browser beim Kopieren aus der echten Karte
// von Pronto Pronto liefert -- vier Spalten, umgebrochene Zutatenlisten,
// Merkmal-Zeichen vor der Nummer. Kein Wunschformat.
//
// Der Fehler, den diese Datei festhaelt: aus 13 Kategorien wurden 75, weil
// jede Zutatenzeile ("Salami", "Peperoni") als Ueberschrift durchging. Beim
// Kopieren geht die Schriftgroesse verloren, und im reinen Text ist eine
// Ueberschrift nicht sicher von einer umgebrochenen Zutatenzeile zu
// unterscheiden. Deshalb wird hier NICHT geraten.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var TEXT = fs.readFileSync('/home/user/kiekmolin/tests/daten/pronto-kopiert.txt', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
var kopf = H.slice(H.indexOf('var KARTE_SPALTENKOPF'), H.indexOf(';', H.indexOf('var KARTE_SPALTENKOPF')) + 1);
var quelle = 'var _karteTextAus = {}, _karteTextAn = {};\n' + kopf + '\n'
    + ['karteTextZeilen', 'karteTextPreise', 'karteTextNachbar', 'karteKopfName',
       'karteTextKopfMoeglich', 'karteTextIstKopf', 'karteTextVorschlaege',
       'karteAusText', 'karteTextZuItems'].map(schneide).join('\n');
function frisch() {
    return new Function(quelle + '; return { lesen: karteAusText, zuItems: karteTextZuItems,'
        + ' vorschlaege: karteTextVorschlaege, zeilen: karteTextZeilen,'
        + ' an: _karteTextAn, aus: _karteTextAus };')();
}

var F = frisch();
var r = F.lesen(TEXT);
var items = F.zuItems(r.gerichte);

// --- Die Zahlen, die zaehlen ------------------------------------------------
t('142 Gerichte aus dem eingefuegten Text', r.gerichte.length === 142, r.gerichte.length);
t('230 Eintraege (klein/gross zaehlen doppelt)', items.length === 230, items.length);
t('kein Eintrag ohne Preis', items.filter(function (i) { return !i.price; }).length === 0,
  items.filter(function (i) { return !i.price; }).length);

// --- Nicht raten ------------------------------------------------------------
t('KEINE erfundenen Kategorien (frueher 75 statt 13)',
  r.ueberschriften.length <= 2, r.ueberschriften.length + ': ' + r.ueberschriften.join(' | '));
['Salami', 'Putenschinken', 'Peperoni', 'Tzatziki', 'überbacken', 'scharf'].forEach(function (z) {
    t('Zutatenzeile "' + z + '" wird KEINE Kategorie',
      r.ueberschriften.indexOf(z) < 0, r.ueberschriften.join(' | '));
});

// --- Aber als Vorschlag da, ein Klick weit weg ------------------------------
var v = F.vorschlaege(F.zeilen(TEXT));
['Nudeln', 'Salami'].forEach(function (z) {
    t('"' + z + '" steht als Vorschlag bereit', v.indexOf(z) >= 0, v.slice(0, 12).join(' | '));
});
t('Spaltenkopf "KLEIN GROSS" wird nicht mal vorgeschlagen',
  v.indexOf('KLEIN GROSS') < 0, v.join(' | '));

// --- Klick wirkt ------------------------------------------------------------
var G = frisch();
G.an['nudeln'] = 1;
var r2 = G.lesen(TEXT);
t('angeklickte Ueberschrift sortiert die Gerichte darunter ein',
  r2.ueberschriften.indexOf('Nudeln') >= 0, r2.ueberschriften.join(' | '));
var unterNudeln = G.zuItems(r2.gerichte).filter(function (i) { return i.category === 'Nudeln'; });
t('unter "Nudeln" landen wirklich Gerichte', unterNudeln.length > 5, unterNudeln.length);

// --- "#" erzwingt immer -----------------------------------------------------
var K = frisch();
var r3 = K.lesen('#Pizzen\n1. Margherita 6,50\n2. Salami 7,00\n#Getränke\nCola 3,00');
t('"#" macht jede Zeile zur Ueberschrift',
  r3.ueberschriften.join('|') === 'Pizzen|Getränke', r3.ueberschriften.join('|'));
var i3 = K.zuItems(r3.gerichte);
t('Gerichte landen unter der erzwungenen Ueberschrift',
  i3[0].category === 'Pizzen' && i3[2].category === 'Getränke',
  i3.map(function (x) { return x.category; }).join('|'));

// --- Einzelheiten, die frueher falsch waren --------------------------------
function finde(nr) { return items.filter(function (i) { return i.dish_number === nr; }); }
var m = finde('1')[0];
t('Merkmal vor der Nummer ("V 1. Pizza Margherita") wird abgetrennt',
  !!m && m.name === 'Pizza Margherita (klein)', m && m.name);
t('und wird zum Merkmal vegetarisch', !!m && m.is_vegetarian === true, m && m.is_vegetarian);
t('Nummer wird erkannt', !!m && m.dish_number === '1', m && m.dish_number);
t('Nummer mit Buchstabe (66A) bleibt erhalten', finde('66A').length > 0, 'fehlt');
t('Hinweiszeile "Extra Zutaten: klein 1,00 €" ist kein Gericht',
  !items.some(function (i) { return /^Zutaten/.test(i.name); }),
  items.filter(function (i) { return /Zutaten/.test(i.name); }).map(function (i) { return i.name; }).join(', '));
t('zwei Preise in einer Zeile werden klein/gross',
  finde('2').length === 2 && finde('2')[0].price === 7 && finde('2')[1].price === 9,
  JSON.stringify(finde('2').map(function (i) { return i.price; })));

// --- Oberflaeche ------------------------------------------------------------
t('Vorschau rechnet bei jedem Tastendruck', /oninput="try\{karteTextVorschau\(\)\}catch\(e\)\{\}"/.test(H));

// --- Sichtbarkeit: der Fehler, der alles davor wertlos gemacht hat ---------
// Der neue Weg war ein Reiter INNERHALB des KI-Scanners. Von der
// Speisekarten-Seite aus war er unsichtbar -- auf dem Knopf stand weiter
// "Menü scannen (KI)". Der ganze Umbau kam beim Gastronom nie an.
t('eigener Knopf auf der Speisekarten-Seite',
  /id="karteEinfuegenBtn"/.test(H) && /<span>Karte übernehmen<\/span>/.test(H));
t('der eigene Knopf steht VOR dem KI-Scanner',
  H.indexOf('id="karteEinfuegenBtn"') < H.indexOf('id="menuScannerBtn2"'));
t('der eigene Knopf traegt die Hausfarbe, nicht das Lila des KI-Scanners',
  /id="karteEinfuegenBtn"[^>]*background: #003D33/.test(H));
t('KI-Scanner heisst jetzt "Foto scannen (KI)" -- keine Verwechslung mehr',
  /<span>Foto scannen \(KI\)<\/span>/.test(H) && !/<span>Menü scannen \(KI\)<\/span>/.test(H));
t('eigenes Fenster vorhanden', /id="karteEinfuegenModal"/.test(H));
// Das Fenster hing beim ersten Versuch unten links halb aus dem Bild, weil es
// die falschen Klassen trug: die App zentriert ueber .modal-overlay (fixed,
// flex) und legt die weisse Karte als .modal hinein.
t('Fenster benutzt die Fenster-Struktur der App (overlay + modal)',
  /<div class="modal-overlay" id="karteEinfuegenModal"/.test(H));
t('weisse Karte liegt IM Overlay, nicht daneben',
  /id="karteEinfuegenModal"[^>]*>\s*<div class="modal"/.test(H));
t('Kopf und Koerper wie bei den anderen Fenstern',
  /id="karteEinfuegenModal"[\s\S]{0,900}class="modal-header"/.test(H)
  && /id="karteEinfuegenModal"[\s\S]{0,1600}class="modal-body"/.test(H));
t('Oeffnen und Schliessen laufen ueber openModal/closeModal',
  /openModal\('karteEinfuegenModal'\)/.test(H) && /closeModal\('karteEinfuegenModal'\)/.test(H));
t('eigenes Textfeld im eigenen Fenster', /id="karteEinfuegenText"/.test(H));
t('Knopf oeffnet das eigene Fenster',
  /oeffneKarteEinfuegen\(\)/.test(H) && /function oeffneKarteEinfuegen/.test(H));
t('Vorschau haengt genau einmal im Dokument',
  (H.match(/id="karteTextVorschau"/g) || []).length === 1,
  (H.match(/id="karteTextVorschau"/g) || []).length);
t('nach dem Uebernehmen schliesst das Fenster und die Pruefliste kommt',
  /schliesseKarteEinfuegen\(\);[\s\S]{0,400}showScannedResults\(\)/.test(H));
t('Uebernehmen-Knopf ruft den KI-freien Weg', /onclick="karteTextUebernehmen\(\)"/.test(H));
t('KI ist nur noch die zweite Wahl, nicht der Standard',
  H.indexOf('onclick="karteTextUebernehmen()"') < H.indexOf('onclick="scanFromText()"'));
t('Bericht weist "ohne KI" aus', /quelle: 'Eingefügter Text, ohne KI'/.test(H));

// --- PDF ist der Hauptweg, Text die Rueckfallebene -------------------------
// Im PDF steht die Schriftgroesse und die Schrift-Kennung. Daran erkennt der
// Leser die Ueberschriften von allein -- auch "Spaghetti" und "Rigatoni", die
// KLEINER gesetzt sind als der Fliesstext. Im kopierten Text ist das weg, und
// dann muss der Gastronom klicken. Also gehoert PDF nach vorn.
t('PDF-Ablage steht im Fenster ganz oben',
  /id="karteVollAblage"/.test(H)
  && H.indexOf('id="karteVollAblage"') < H.indexOf('id="karteEinfuegenText"'));
t('PDF wird angenommen, Fotos nicht', /accept="application\/pdf,\.pdf"/.test(H));
t('Datei auch per Ziehen-und-Ablegen', /ondrop="karteVollAbgelegt/.test(H));
t('PDF laeuft ueber leseKartePdf -- kein Modell',
  /await leseKartePdf\(daten\)/.test(H));
t('kein KI-Aufruf im PDF-Weg des Fensters',
  !/karteVollLies[\s\S]{0,2600}(aiMenuScan|leseKarteKI|scanOhneZeitlimit)\(/.test(H));
t('Text-Weg ist zugeklappt und als Rueckfall beschriftet',
  /id="karteVollTextBereich"/.test(H) && /Kein PDF\? Karte stattdessen als Text einfügen/.test(H));
t('Knopf heisst jetzt "Karte übernehmen" mit PDF-Hinweis',
  /<span>Karte übernehmen<\/span>/.test(H) && /PDF · ohne KI/.test(H));
t('Extras aus dem PDF werden mit uebernommen',
  /window\._scanExtras = window\._karteVollExtras/.test(H));
t('scheitert der PDF-Weg, kommt der Rohtext ins Textfeld statt der KI',
  /feld\.value = e\.rohtext/.test(H) && /auf\.open = true/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
