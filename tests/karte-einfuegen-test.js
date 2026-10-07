// "Karte übernehmen" -> Text einfügen: liest er die Karte gut?
//
// Ibo, 07.10.2026: "wenn ich es einfüge beim Karte übernehmen liest er die
// Karte nicht gut" -- "nur Gerichte und Getränke, nichts Unnötiges, besser
// platziert". Die Gerichtnummern bleiben (Nachfrage am selben Tag).
//
// Gemessen vorher an drei typischen Texten (tests/daten/einfuegen/):
//   webseite.txt   Name / Beschreibung / Preis je eigene Zeile: 1 von 7
//                  Gerichten, und das falsch ("Coca-Cola" für 0,33 €)
//   word.txt       Füllpunkte, Anschrift, Öffnungszeiten, Fusszeile:
//                  keine Kategorie, "Hauptgerichte" als Beschreibung
//   getraenke.txt  "Cola 0,33l 2,50": Cola klein 0,33 € / groß 2,50 €
// Jede Prüfung unten wird mit dem alten karteAusText rot.
'use strict';
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
function varBlock(name) { var i = H.indexOf('var ' + name); return H.slice(i, H.indexOf(';\n', i) + 1); }
var F = new Function('var _karteTextAus = {}, _karteTextAn = {};\n'
    + ['KARTE_SPALTENKOPF', 'KARTE_KATEGORIE_WOERTER', '_PDF_ALLERGEN'].map(varBlock).join('\n') + '\n'
    + ['karteTextZeilen', 'kartePreisTreffer', 'karteTextPreise', 'karteTextNachbar', 'karteKopfName',
       'karteTextKategorieWort', 'karteTextAuchZutat', 'karteTextHinweis', 'karteTextIstGerichtzeile',
       'karteKlammernLesen', 'karteTextKopfFormal', 'karteTextKopfMoeglich', 'karteTextIstKopf',
       'karteAusText', 'karteTextZuItems', 'parseKartenText', 'karteGegenprobeHtml'].map(schneide).join('\n')
    + '; return { lies: function (t) { var r = karteAusText(t); r.items = karteTextZuItems(r.gerichte); return r; },'
    + ' preis: kartePreisTreffer, pdf: parseKartenText, gp: karteGegenprobeHtml };')();
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }
function lies(datei) { return F.lies(fs.readFileSync(KMI + '/tests/daten/einfuegen/' + datei, 'utf8')); }
function kats(items) { var k = []; items.forEach(function (i) { if (k.indexOf(i.category) < 0) k.push(i.category); }); return k; }
function g(items, name) { return items.filter(function (i) { return i.name === name; })[0] || null; }

// --- Webseite: Name, Beschreibung, Preis auf eigenen Zeilen ---------------
var w = lies('webseite.txt');
t('[Webseite] alle 7 Gerichte', w.items.length === 7, w.items.length + ': ' + w.items.map(function (i) { return i.name; }).join(' | '));
t('[Webseite] Kategorien Pizza / Pasta / Getränke', kats(w.items).join('|') === 'Pizza|Pasta|Getränke', kats(w.items).join('|'));
var mg = g(w.items, 'Pizza Margherita');
t('[Webseite] Margherita 8,50 € mit ihrer Beschreibung', !!mg && mg.price === 8.5 && mg.description === 'mit Tomatensauce und Mozzarella', JSON.stringify(mg));
var tn = g(w.items, 'Pizza Tonno');
t('[Webseite] Tonno hat NICHT die Beschreibung der Salami', !!tn && tn.description === 'mit Thunfisch und Zwiebeln' && g(w.items, 'Pizza Salami').description === 'mit Rindersalami', JSON.stringify(tn));
var cola = g(w.items, 'Coca-Cola 0,33 l');
t('[Webseite] Coca-Cola 0,33 l kostet 2,80 € (nicht 0,33 €)', !!cola && cola.price === 2.8 && !cola.sizes, JSON.stringify(cola));
t('[Webseite] "Pizza Margherita" wird keine Kategorie', w.ueberschriften.indexOf('Pizza Margherita') < 0, w.ueberschriften.join('|'));

// --- Word: Füllpunkte, Anschrift, Fusszeile, Allergen-Klammern ------------
var wd = lies('word.txt');
t('[Word] 8 Gerichte', wd.items.length === 8, wd.items.length);
t('[Word] Kategorien Vorspeisen / Hauptgerichte / Nachtisch / Getränke',
  kats(wd.items).join('|') === 'Vorspeisen|Hauptgerichte|Nachtisch|Getränke', kats(wd.items).join('|'));
t('[Word] keine Kategorie als Beschreibung ("... Bratkartoffeln Nachtisch")',
  !wd.items.some(function (i) { return /Hauptgerichte|Nachtisch|Getränke|Vorspeisen/.test(i.description); }),
  wd.items.map(function (i) { return i.description; }).join(' | '));
t('[Word] keine Füllpunkte im Namen', !wd.items.some(function (i) { return /\.{2,}/.test(i.name); }), '');
var ws = g(wd.items, 'Wiener Schnitzel');
t('[Word] "Wiener Schnitzel (a,c,g)" heisst "Wiener Schnitzel"', !!ws, wd.items.map(function (i) { return i.name; }).join(' | '));
t('[Word] ... und die Klammer wird zu Allergenen', !!ws && ws.allergens.join(',') === 'gluten,eier,milch', ws && ws.allergens.join(','));
t('[Word] Anschrift, Telefon, Öffnungszeiten, Fusszeile: nicht übernommen, aber aufgelistet',
  (wd.hinweise || []).length >= 3 && wd.hinweise.some(function (h) { return /Tel/.test(h); }) && wd.hinweise.some(function (h) { return /MwSt/.test(h); })
  && !wd.items.some(function (i) { return /Tel|MwSt|Öffnungszeit|Deichblick/.test(i.name + i.description); }), JSON.stringify(wd.hinweise));
t('[Word] Pils vom Fass 0,3 l für 3,40 €', !!g(wd.items, 'Pils vom Fass 0,3 l') && g(wd.items, 'Pils vom Fass 0,3 l').price === 3.4, '');

// --- Getränke: Mengen sind keine Preise -----------------------------------
var gt = lies('getraenke.txt');
t('[Getränke] 7 Getränke in 3 Kategorien', gt.items.length === 7 && kats(gt.items).join('|') === 'Alkoholfreie Getränke|Bier|Heißgetränke',
  gt.items.length + ' ' + kats(gt.items).join('|'));
t('[Getränke] Cola 0,33l kostet 2,50 € -- keine "Größe 0,33 €"',
  !!g(gt.items, 'Cola 0,33l') && g(gt.items, 'Cola 0,33l').price === 2.5 && !g(gt.items, 'Cola 0,33l').sizes, JSON.stringify(g(gt.items, 'Cola 0,33l')));
t('[Getränke] kein Getränk mit Preis unter 1 €', !gt.items.some(function (i) { return i.price < 1; }), '');

// --- Gerichtnummern bleiben (Ibo: "die Nummern der Gerichte sollen bleiben")
var nr = F.lies('Pizza\n1. Margherita 7,50\n2. Salami 8,00');
t('Nummer als eigenes Feld, nicht im Namen', nr.items.length === 2 && nr.items[0].dish_number === '1' && nr.items[1].dish_number === '2'
  && nr.items.every(function (i) { return !/^\d/.test(i.name); }),
  JSON.stringify(nr.items.map(function (i) { return [i.dish_number, i.name]; })));

// --- Gegenprobe in der Vorschau -------------------------------------------
t('Vorschau zeigt die Gegenprobe des Textes', /karteGegenprobeHtml\(_gpText\)/.test(schneide('karteTextVorschau')), 'fehlt');
t('Vorschau zeigt die Nummer', /esc\(i\.dish_number\)/.test(schneide('karteTextVorschau')), 'Nummernspalte fehlt');
var gpH = F.gp({ preisZeilen: 3, extras: [], rest: [], weggelassen: ['Tel. 0491 1234'] });
t('Gegenprobe listet weggelassene Zeilen', /weggelassen/.test(gpH) && /Tel\. 0491 1234/.test(gpH), gpH.slice(0, 120));
t('Prüfliste bekommt die Text-Gegenprobe', /_scanGegenprobe = window\._karteVollGegenprobe \|\| window\._karteTextGegenprobe/.test(H), 'fehlt');

// --- Gleiche Preisregel wie der PDF-Leser ---------------------------------
['Margherita 7,50', 'Cola 0,33l 2,50', 'Grillteller 12.90 €', 'Platte 1.250,00 €', 'Pizza 26 cm 7,50 €',
 'Geöffnet ab 11,30 Uhr', 'Pizza 7,- €', 'Menü 8 €', 'jede weitere Zutat + 2,50 €'].forEach(function (z) {
    var text = F.preis(z).map(function (x) { return x.wert; }).join(',');
    var p = F.pdf('## X\n1. ' + z, '');
    var ausPdf = (p[0] ? p[0].preise : []).concat(p.extras.length ? ['(extra)'] : []).join(',');
    var ausPdfPreise = p.extras.length ? text : ausPdf;
    t('Preisregel wie beim PDF: "' + z + '" -> ' + (text || 'kein Preis'), text === ausPdfPreise, 'Text: ' + text + ' / PDF: ' + ausPdf);
});

console.log(n === ok ? '\nAlle ' + n + ' Tests bestanden.' : '\n' + (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.');
process.exit(n === ok ? 0 : 1);
