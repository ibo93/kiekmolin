// PDF-Karte lesen -- gegen ECHTE pdf.js-Daten.
//
// ============================================================================
// WARUM DIESE DATEI EXISTIERT
// ============================================================================
// Der Scanner war "gruen" und lieferte im Betrieb trotzdem Muell. Der Grund:
// alle Messungen liefen gegen Text, den ein PYTHON-Werkzeug aus dem PDF geholt
// hatte. Im Browser laeuft aber pdf.js 2.16.105, und das liefert etwas
// anderes:
//
//   * fontFamily ist bei dieser Karte AUSNAHMSLOS "sans-serif". Die
//     Fett-Erkennung (/bold|black|heavy/) konnte also nie greifen -- die
//     Zwischenueberschriften fielen weg. Im Python-Text hiess dieselbe Schrift
//     "Fraunces-9ptBlack", dort funktionierte es. Der Test log.
//   * Die Wortaufteilung ist eine andere, dadurch auch die Spaltenluecken.
//     Zwischen Spalte 2 und 3 blieben 8 Punkt statt der geforderten 12 --
//     eine Rasterzeile zu wenig. Diese eine fehlende Grenze klebte Spalte 2
//     und 3 zusammen, und die Ueberschrift der dritten Spalte landete hinten
//     an einem Gericht der zweiten: "29. Pizza Emden V 8,00 € 10,00 € Nudeln"
//     stand danach als Kategorie in der Karte.
//
// tests/daten/pronto-pdfjs.json ist deshalb keine Nachbildung, sondern die
// unveraenderte Ausgabe von pdf.js 2.16.105 fuer die echte Karte
// "Pronto Pronto, Riepe" (zwei Seiten, vier Spalten, 142 Gerichte).
'use strict';

var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var SEITEN = JSON.parse(fs.readFileSync('/home/user/kiekmolin/tests/daten/pronto-pdfjs.json', 'utf8'));

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') d++;
        else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); }
    }
    throw new Error('Klammern offen: ' + name);
}
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var quelle = vorspann + '\n' + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems',
    '_nrWert', 'sortiereNachNummer'].map(schneide).join('\n');
var F = new Function(quelle + '; return { pdfSeiteZuText: pdfSeiteZuText, parseKartenText: parseKartenText,'
    + ' pdfGerichteZuItems: pdfGerichteZuItems, sortiereNachNummer: sortiereNachNummer };')();

var n = 0, ok = 0;
function t(label, bedingung, extra) {
    n++;
    var gut = bedingung === true;
    if (gut) ok++;
    console.log((gut ? 'OK  ' : 'FAIL') + ' | ' + label + (gut ? '' : '  -> ' + extra));
}

// --- Der Weg, den die App geht -------------------------------------------
var texte = SEITEN.map(function (s) { return F.pdfSeiteZuText(s.items, s.w); });

t('beide Seiten liefern ueberhaupt Text',
  texte.length === 2 && texte.every(Boolean), JSON.stringify(texte.map(function (x) { return x && x.length; })));

function ueberschriften(txt) {
    return String(txt || '').split('\n').filter(function (z) { return z.slice(0, 3) === '## '; })
           .map(function (z) { return z.slice(3).trim(); });
}

// Seitenkopf wegnehmen -- genau wie die App (Ueberschrift, die auf JEDER
// Seite steht, ist ein Kopf und keine Kategorie).
var seiten = texte.filter(Boolean), kopf = null;
seiten.forEach(function (txt) {
    var k = ueberschriften(txt);
    kopf = (kopf === null) ? k : kopf.filter(function (x) { return k.indexOf(x) >= 0; });
});
t('Restaurantname wird als Seitenkopf erkannt, nicht als Kategorie',
  kopf.length === 1 && /Pronto Pronto/.test(kopf[0]), JSON.stringify(kopf));
if (seiten.length > 1 && kopf.length) {
    seiten = seiten.map(function (txt) {
        return txt.split('\n').filter(function (z) {
            return !(z.slice(0, 3) === '## ' && kopf.indexOf(z.slice(3).trim()) >= 0);
        }).join('\n');
    });
}

// --- Spalten --------------------------------------------------------------
// Der Beweis, dass die vier Spalten getrennt werden: sonst haengen
// Ueberschrift und Gericht der Nachbarspalte in EINER Zeile.
var alleUeber = [];
seiten.forEach(function (s) { alleUeber = alleUeber.concat(ueberschriften(s)); });
t('keine Ueberschrift enthaelt einen Preis (= Spalten sind getrennt)',
  !alleUeber.some(function (u) { return /\d{1,3},\d{2}/.test(u); }),
  JSON.stringify(alleUeber.filter(function (u) { return /\d{1,3},\d{2}/.test(u); })));
t('keine Ueberschrift ist laenger als 40 Zeichen (= nichts zusammengeklebt)',
  !alleUeber.some(function (u) { return u.length > 40; }),
  JSON.stringify(alleUeber.filter(function (u) { return u.length > 40; })));
t('genau der Fehler von frueher ist weg: "... € Nudeln" als Kategorie',
  !alleUeber.some(function (u) { return /€\s*\S/.test(u); }), JSON.stringify(alleUeber));

// --- Ueberschriften-Schrift statt Fett-Erkennung --------------------------
// Diese drei stehen KLEINER als der Fliesstext (7,6 gegen 7,9). Ueber die
// Schriftgroesse sind sie nicht zu finden -- nur ueber die Schrift-Kennung.
['Spaghetti', 'Rigatoni', 'Tortellini'].forEach(function (u) {
    t('kleine Zwischenueberschrift "' + u + '" wird gefunden',
      alleUeber.indexOf(u) >= 0, JSON.stringify(alleUeber));
});
t('fontName wird ueberhaupt durchgereicht (fontFamily ist hier immer sans-serif)',
  /fn: it\.fontName/.test(H));

// --- Gerichte -------------------------------------------------------------
var gerichte = [], letzteKat = '';
seiten.forEach(function (txt) {
    var teil = F.parseKartenText(txt, letzteKat);
    if (teil.length) letzteKat = teil[teil.length - 1].kat;
    gerichte = gerichte.concat(teil);
});
var items = F.sortiereNachNummer(F.pdfGerichteZuItems(gerichte));

t('142 Gerichte gelesen', gerichte.length === 142, gerichte.length + ' statt 142');
// EIN Gericht, mehrere Groessen -- nicht zwei fast gleiche Gerichte.
// Auf der gedruckten Karte ist "1. Pizza Margherita 6,50 € 8,50 €" EIN
// Gericht mit zwei Preisen. Vorher standen daraus "Pizza Margherita (klein)"
// und "Pizza Margherita (groß)" untereinander in der Karte.
t('142 Gerichte -- nicht 230 Eintraege', items.length === 142, items.length + ' statt 142');
t('88 davon haben Groessen',
  items.filter(function (i) { return i.sizes && i.sizes.length; }).length === 88,
  items.filter(function (i) { return i.sizes && i.sizes.length; }).length);
t('kein Gericht heisst mehr "(klein)" oder "(groß)"',
  !items.some(function (i) { return /\((klein|groß)\)/.test(i.name); }),
  (items.filter(function (i) { return /\((klein|groß)\)/.test(i.name); })[0] || {}).name);
t('kein Eintrag ohne Preis',
  items.filter(function (i) { return !i.price; }).length === 0,
  items.filter(function (i) { return !i.price; }).length + ' ohne Preis');

var kats = {};
items.forEach(function (i) { kats[i.category || '(leer)'] = 1; });
var katListe = Object.keys(kats);
t('13 Kategorien, keine erfundene', katListe.length === 13, katListe.length + ': ' + katListe.join(' | '));
t('keine leere Kategorie', katListe.indexOf('(leer)') < 0, katListe.join(' | '));
['Pizza', 'Familienpizza', 'Spaghetti', 'Rigatoni', 'Tortellini', 'Spezialität des Hauses',
 'Pronto Spezial Schnitzel', 'Fleischgerichte', 'Baguette', 'Burger', 'Salate', 'Beilagen',
 'Gefüllte Pizzabrötchen'].forEach(function (k) {
    t('Kategorie "' + k + '" ist da', katListe.indexOf(k) >= 0, katListe.join(' | '));
});

// --- Stichproben, zeichengenau -------------------------------------------
function finde(nr, name) {
    return items.filter(function (i) {
        return String(i.dish_number) === nr && i.name.indexOf(name) === 0;
    })[0];
}
var m = finde('1', 'Pizza Margherita');
t('Nr. 1 heisst "Pizza Margherita" -- ohne angeklebtes V, ohne Groesse im Namen',
  !!m && m.name === 'Pizza Margherita', m && m.name);
t('Nr. 1 hat zwei Groessen, klein zuerst',
  !!m && m.sizes && m.sizes.length === 2
  && m.sizes[0].name === 'klein' && m.sizes[0].price === 6.5
  && m.sizes[1].name === 'groß' && m.sizes[1].price === 8.5,
  m && JSON.stringify(m.sizes));
t('Grundpreis ist der guenstigste (der Gast sieht "ab 6,50 €")',
  !!m && m.price === 6.5, m && m.price);
t('das V von Nr. 1 wird zum Merkmal vegetarisch', !!m && m.is_vegetarian === true, m && m.is_vegetarian);
t('Nr. 1 klein kostet 6,50', !!m && m.price === 6.5, m && m.price);
t('Nr. 1 steht unter Pizza', !!m && m.category === 'Pizza', m && m.category);

var xxl = finde('66A', 'Döner XXL');
t('Nummer mit Buchstabe (66 A) bleibt erhalten', !!xxl, 'nicht gefunden');
t('Döner XXL steht unter Fleischgerichte',
  !!xxl && xxl.category === 'Fleischgerichte', xxl && xxl.category);

var pl = items.filter(function (i) { return /Pronto Pronto-Platte/.test(i.name); })[0];
t('Name ueber zwei Zeilen wird zusammengesetzt ("... (für 4 Pers.)")',
  !!pl && /für 4 Pers/.test(pl.name), pl && pl.name);
t('die Platte landet NICHT unter dem Restaurantnamen',
  !!pl && !/Pronto Pronto Pizzeria/.test(pl.category), pl && pl.category);

// Sortierung innerhalb der Kategorie: 41 und 42 stehen auf der Karte in der
// naechsten Spalte, in der App muessen sie der Reihe nach kommen.
var pizzaNrn = items.filter(function (i) { return i.category === 'Pizza' && i.dish_number; })
    .map(function (i) { return parseInt(i.dish_number, 10); });
var sortiert = pizzaNrn.slice().sort(function (a, b) { return a - b; });
t('Pizzen stehen nach Nummer sortiert, nicht nach Druckspalte',
  JSON.stringify(pizzaNrn) === JSON.stringify(sortiert),
  'erste Abweichung bei ' + pizzaNrn.find(function (x, i) { return x !== sortiert[i]; }));

// --- Reihenfolge ueber die Kategorien hinweg -------------------------------
// Innerhalb einer Kategorie stimmten die Nummern schon. Die Kategorien selbst
// standen aber in der Reihenfolge des DRUCKBILDS: auf der vierspaltigen Karte
// kommt "Pronto Spezial Schnitzel" (130-137) vor "Baguette" (51-59), weil es
// weiter oben gedruckt ist. Im Menue sucht ein Gast die 51 vor der 130.
var reihe = [];
items.forEach(function (i) {
    if (!reihe.length || reihe[reihe.length - 1].kat !== i.category) {
        reihe.push({ kat: i.category, nrn: [] });
    }
    var w = parseInt(i.dish_number, 10);
    if (!isNaN(w)) reihe[reihe.length - 1].nrn.push(w);
});
var starts = reihe.filter(function (r) { return r.nrn.length; })
                  .map(function (r) { return Math.min.apply(null, r.nrn); });
var aufsteigend = starts.every(function (x, i) { return i === 0 || x >= starts[i - 1]; });
t('Kategorien stehen in der Reihenfolge ihrer Nummern, nicht des Druckbilds',
  aufsteigend, starts.join(' '));
t('Baguette (51) kommt vor Pronto Spezial Schnitzel (130)',
  reihe.findIndex(function (r) { return r.kat === 'Baguette'; })
  < reihe.findIndex(function (r) { return r.kat === 'Pronto Spezial Schnitzel'; }),
  reihe.map(function (r) { return r.kat; }).join(' > '));
t('Familienpizza (41) bleibt direkt hinter Pizza -- Ueberschneidung stoert nicht',
  reihe[0].kat === 'Pizza' && reihe[1].kat === 'Familienpizza',
  reihe.slice(0, 3).map(function (r) { return r.kat; }).join(' > '));

// --- Zutaten stehen im Gericht ---------------------------------------------
var mitBesch = items.filter(function (i) { return i.description && i.description.trim(); });
t('Zutaten landen als Beschreibung im Gericht (>115 von 142)',
  mitBesch.length > 115, mitBesch.length + ' von ' + items.length);
var bari = items.filter(function (i) { return /Pizza Bari/.test(i.name); })[0];
t('"Pizza Bari" traegt ihre Zutaten',
  !!bari && /Salami/.test(bari.description) && /Paprika/.test(bari.description),
  bari && bari.description);
t('Vorschau zeigt die Beschreibung an (war da, stand aber nicht in der Liste)',
  /Beschreibung mitzeigen/.test(H) && /esc\(i\.description\)/.test(H));

// --- Allergene und Zusatzstoffe --------------------------------------------
// Diese Karte ist die Fassung OHNE Allergene (steht im Dateinamen). Der Leser
// zieht sie aber, sobald sie in Klammern hinter den Zutaten stehen --
// Buchstaben a-n sind Allergene, Ziffern sind Zusatzstoffe.
var probe = F.pdfGerichteZuItems(F.parseKartenText(
    '## Pizza\n1. Pizza Margherita 6,50 €\nKäse, Tomaten (a,g) (1,2)', ''));
t('Allergen-Buchstaben werden in Namen uebersetzt',
  JSON.stringify(probe[0].allergens) === '["gluten","milch"]', JSON.stringify(probe[0].allergens));
t('Zusatzstoff-Ziffern werden erkannt',
  JSON.stringify(probe[0].additives) === '["1","2"]', JSON.stringify(probe[0].additives));
t('die Klammern verschwinden aus der Beschreibung',
  probe[0].description === 'Käse, Tomaten', probe[0].description);

// --- Groessennamen kommen von der Karte, nicht aus einer Annahme -----------
// Ueber den Pizzen steht "KLEIN GROSS", ueber den Fleischgerichten
// "IM BROT TELLER". Vorher hiess die zweite Groesse ueberall "groß" -- auch
// beim Döner, wo "Teller" auf der Karte steht.
var doener = items.filter(function (i) { return i.dish_number === '61'; })[0];
t('Döner Kebab hat die Groessen der Karte: im Brot / Teller',
  !!doener && doener.sizes && doener.sizes.length === 2
  && doener.sizes[0].name === 'im Brot' && doener.sizes[1].name === 'Teller',
  doener && JSON.stringify(doener.sizes));
t('Döner: im Brot 8,00 und Teller 11,00',
  !!doener && doener.sizes[0].price === 8 && doener.sizes[1].price === 11,
  doener && JSON.stringify(doener.sizes));
t('Pizzen behalten klein / groß',
  m.sizes[0].name === 'klein' && m.sizes[1].name === 'groß', JSON.stringify(m.sizes));
var namensBilder = {};
items.forEach(function (i) {
    if (i.sizes) namensBilder[i.sizes.map(function (g) { return g.name; }).join('/')] = 1;
});
t('nur die beiden Bezeichnungen, die wirklich auf der Karte stehen',
  Object.keys(namensBilder).sort().join(' + ') === 'im Brot/Teller + klein/groß',
  Object.keys(namensBilder).join(' + '));
t('die Spaltenkopf-Zeile ist kein Gericht',
  !items.some(function (i) { return /^(KLEIN|GROSS|IM BROT|TELLER)/i.test(i.name); }),
  (items.filter(function (i) { return /^(KLEIN|GROSS|IM BROT|TELLER)/i.test(i.name); })[0] || {}).name);

// --- Groessen kommen bis in die Datenbank ----------------------------------
t('Import schreibt die Groessen mit',
  /sizes: \(Array\.isArray\(item\.sizes\) && item\.sizes\.length\) \? item\.sizes : null/.test(H));
t('Gast-Ansicht macht daraus die Auswahl und zeigt "ab"-Preis',
  /var hasSizes = item\.sizes && Array\.isArray\(item\.sizes\)/.test(H)
  && /pricePrefix = 'ab '/.test(H));
t('erste Groesse ist beim Gast vorausgewaehlt',
  /currentMenuItem\.price = parseFloat\(item\.sizes\[0\]\.price\)/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
