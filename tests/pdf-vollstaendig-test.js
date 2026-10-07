// PDF-Karte: was hochgeladen wird, muss zu 100 % ankommen.
//
// Ibo, 07.10.2026: "was ich hochlade muss es zu 100 aufnehmen".
//
// Gemessen am selben Tag, mit Probezeilen gegen parseKartenText: diese
// Schreibweisen fielen OHNE MELDUNG heraus --
//   "1. Margherita 7,50"              (kein €-Zeichen -> galt als Beschreibung)
//   "1. Margherita 7.50 €" / "7,- €" / "8 €" / "7,50 EUR"
//   "1. Pizza Hawaii: Schinken, Ananas 8,50 €"   (Doppelpunkt -> "Extra")
//   "5. Döner + Pommes 9,50 €"                    (Plus -> "Extra")
//   "cola 0,33l 2,50 €"                           (klein geschrieben -> "Extra")
//   "1. Margherita" / "7,50 €"                    (Name eine Zeile drüber)
// Die bekannten Karten (Pronto Pronto, 142 Gerichte, und die fünf Proben)
// liefen schon vorher vollständig -- sie müssen es bleiben.
//
// Jeder Fall unten wird rot, wenn man die alte Regel wieder einsetzt.
'use strict';
var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) {
        if (H[k] === '{') d++;
        else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); }
    }
}
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var F = new Function(vorspann + '\n' + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems',
    '_nrWert', 'sortiereNachNummer', 'karteGegenprobeHtml'].map(schneide).join('\n')
    + '; return { pdfSeiteZuText: pdfSeiteZuText, parseKartenText: parseKartenText,'
    + ' pdfGerichteZuItems: pdfGerichteZuItems, sortiereNachNummer: sortiereNachNummer,'
    + ' karteGegenprobeHtml: karteGegenprobeHtml };')();

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function lies(text) {
    var r = F.parseKartenText(text, '');
    return { items: F.pdfGerichteZuItems(r), extras: r.extras, rest: r.rest, preisZeilen: r.preisZeilen };
}
function eins(text, name, preis, label) {
    var e = lies(text);
    var g = e.items.filter(function (i) { return i.name === name; })[0];
    t(label + ': "' + name + '" ist da', !!g, JSON.stringify(e.items.map(function (i) { return i.name; })) + ' extras=' + e.extras.length);
    if (g && preis !== undefined) t(label + ': Preis ' + preis, g.price === preis, g.price);
}

// --- Preise ohne / mit anderem Zeichen ------------------------------------
eins('## Pizza\n1. Margherita 7,50', 'Margherita', 7.5, 'ohne €');
eins('## Pizza\n1. Margherita 7.50 €', 'Margherita', 7.5, 'Punkt statt Komma');
eins('## Pizza\n1. Margherita 7,- €', 'Margherita', 7, 'Komma-Strich');
eins('## Pizza\n1. Margherita 8 €', 'Margherita', 8, 'ganzer Euro');
eins('## Pizza\n1. Margherita 7,50 EUR', 'Margherita', 7.5, 'EUR');
eins('## Platten\n1. Grillplatte 1.250,00 €', 'Grillplatte', 1250, 'Tausenderpunkt');

var ohne = lies('## Pizza\n1. Margherita 7,50\nTomaten, Käse\n2. Salami 8,00\n## Getränke\nCola 0,33 l 2,50\nWasser 0,5 l 2,00');
t('Karte ganz ohne €: 4 Gerichte', ohne.items.length === 4, ohne.items.length);
var cola = ohne.items.filter(function (i) { return /^Cola/.test(i.name); })[0] || {};
t('"0,33 l" ist kein Preis -- Cola kostet 2,50', cola.price === 2.5, JSON.stringify(cola));
t('"0,33 l" bleibt im Namen', cola.name === 'Cola 0,33 l', cola.name);
var marg = ohne.items[0] || {};
t('Zutaten bleiben Beschreibung', marg.description === 'Tomaten, Käse', marg.description);
var uhr = lies('## Info\nGeöffnet ab 11,30 Uhr\n## Pizza\n1. Margherita 7,50 €');
t('"11,30 Uhr" ist kein Preis', uhr.items.length === 1 && uhr.preisZeilen === 1, JSON.stringify(uhr.items));
var cm = lies('## Pizza\n1. Margherita 26 cm 7,50 €');
t('"26 cm" ist kein Preis', cm.items[0] && cm.items[0].price === 7.5 && !cm.items[0].sizes, JSON.stringify(cm.items[0]));

// --- Gerichte, die als "Extra" verschwanden ------------------------------
eins('## Pizza\n1. Pizza Hawaii: Schinken, Ananas 8,50 €', 'Pizza Hawaii: Schinken, Ananas', 8.5, 'Doppelpunkt');
eins('## Menüs\n5. Döner + Pommes 9,50 €', 'Döner + Pommes', 9.5, 'Plus im Namen');
eins('## Getränke\ncola 0,33l 2,50 €', 'cola 0,33l', 2.5, 'klein geschrieben');
eins('## Eis\n3. Spaghetti-Eis (auch vegan erhältlich) 6,50 €', 'Spaghetti-Eis (auch vegan erhältlich)', 6.5, 'Hinweiswort im Namen');

// Die echten Hinweiszeilen von Pronto bleiben Extras -- kein Gericht daraus.
var hin = lies('## Pizza\n1. Margherita 7,50 €\nExtra Zutaten: klein 1,00 €, groß 1,50 €\n'
    + 'mit einer Zutat nach Wahl kostenlos · jede weitere Zutat + 2,50 €\n'
    + 'Alle Teller mit Pommes frites erhältlich +1,00 € extra\n'
    + 'Menü-Upgrade: Burger + Getränk + Pommes + Sauce +5,00 €\nZutaten: klein 0,50 €, groß 1,00 €');
t('Hinweiszeilen bleiben Extras (5)', hin.extras.length === 5, hin.extras.length);
t('... und werden kein Gericht', hin.items.length === 1, JSON.stringify(hin.items.map(function (i) { return i.name; })));

// --- Name eine Zeile über dem Preis --------------------------------------
var drueber = lies('## Pizza\n1. Margherita\n7,50 €\n2. Salami\n8,00 €');
t('nummeriert, Preis darunter: beide Gerichte', drueber.items.length === 2, JSON.stringify(drueber.items));
t('... mit den richtigen Preisen', drueber.items[1] && drueber.items[1].name === 'Salami' && drueber.items[1].price === 8,
  JSON.stringify(drueber.items[1]));
var kuchen = lies('## Kuchen\nApfelkuchen\n3,80 €\nKäsekuchen\n4,20 €\nmit Sahne\nNusskuchen\n4,00 €');
t('ohne Nummer, Preis darunter: 3 Gerichte', kuchen.items.length === 3, JSON.stringify(kuchen.items.map(function (i) { return i.name; })));
t('... die Beschreibung bleibt beim richtigen Kuchen',
  kuchen.items[1] && kuchen.items[1].description === 'mit Sahne' && kuchen.items[2].description === '',
  JSON.stringify(kuchen.items));

// --- Gegenprobe: was nicht passt, wird GENANNT --------------------------
var zweite = lies('## Pizza\n1. Margherita 7,50 €\nTomaten, Käse\n8,50 €');
t('Preis ohne Gericht wird nicht erraten', zweite.items.length === 1, zweite.items.length);
t('... aber gemeldet', zweite.rest.length === 1 && zweite.rest[0].text === '8,50 €', JSON.stringify(zweite.rest));
var ohnePr = lies('## Pizza\n1. Margherita 7,50 €\n2. Tagespizza\nfragen Sie unser Personal\n3. Salami 8,00 €');
var tp = ohnePr.items.filter(function (i) { return i.name === 'Tagespizza'; })[0];
t('Gericht ohne Preis wird nicht verschluckt', !!tp, JSON.stringify(ohnePr.items.map(function (i) { return i.name; })));
t('... sein Preis ist LEER, nicht 0 (sonst für 0 € bestellbar)', tp && tp.price === null, tp && tp.price);
t('... und es steht in der Gegenprobe', ohnePr.rest.some(function (r) { return /Tagespizza/.test(r.text); }), JSON.stringify(ohnePr.rest));

var gruen = F.karteGegenprobeHtml({ preisZeilen: 149, extras: ['Extra Zutaten: 1,00 €'], rest: [] });
t('alles übernommen: grüne Zeile mit Zahl', /Vollständig/.test(gruen) && /149/.test(gruen), gruen.slice(0, 120));
var gelb = F.karteGegenprobeHtml({ preisZeilen: 3, extras: [], rest: [{ kat: 'Pizza', text: '8,50 € <b>', grund: 'Preis ohne erkennbares Gericht' }] });
t('Rest: Warnung mit dem Text der Zeile', /bitte ansehen/.test(gelb) && /8,50 €/.test(gelb) && !/Vollständig/.test(gelb), gelb.slice(0, 160));
t('Rest-Text wird maskiert', /&lt;b&gt;/.test(gelb) && !/<b>/.test(gelb), 'roh im HTML');

// --- Die echten Karten bleiben vollständig -------------------------------
var SEITEN = JSON.parse(fs.readFileSync(KMI + '/tests/daten/pronto-pdfjs.json', 'utf8'));
var texte = SEITEN.map(function (s) { return F.pdfSeiteZuText(s.items, s.w); });
var g = [], lk = '', rest = [], pz = 0, ex = 0;
texte.forEach(function (txt) {
    var teil = F.parseKartenText(txt, lk);
    if (teil.length) lk = teil[teil.length - 1].kat;
    g = g.concat(teil); rest = rest.concat(teil.rest); pz += teil.preisZeilen; ex += teil.extras.length;
});
t('Pronto Pronto: 142 Gerichte', g.length === 142, g.length);
t('Pronto Pronto: Gegenprobe ohne Rest', rest.length === 0, JSON.stringify(rest));
t('Pronto Pronto: 149 Preiszeilen = 142 Gerichte + 7 Extras', pz === 149 && ex === 7, pz + ' / ' + ex);

var KARTEN = JSON.parse(fs.readFileSync(KMI + '/tests/daten/proben/karten.json', 'utf8'));
KARTEN.forEach(function (karte) {
    var tx = karte.seiten.map(function (s) { return F.pdfSeiteZuText(s.items, s.w); }).filter(Boolean);
    var gg = [], r = [], l = '';
    tx.forEach(function (x) { var teil = F.parseKartenText(x, l); if (teil.length) l = teil[teil.length - 1].kat; gg = gg.concat(teil); r = r.concat(teil.rest); });
    t('[' + karte.name + '] ' + karte.wahrheit.gerichte + ' Gerichte, nichts übrig',
      gg.length === karte.wahrheit.gerichte && r.length === 0, gg.length + ' / rest ' + JSON.stringify(r));
});

// --- Die Gegenprobe kommt beim Gastronomen an ----------------------------
t('leseKartePdf reicht die Gegenprobe weiter', /ergebnis\.gegenprobe = \{/.test(schneide('leseKartePdf')), 'fehlt');
t('Vorschau zeigt sie', /karteGegenprobeHtml\(e\.gegenprobe\)/.test(schneide('karteVollZeige')), 'fehlt');
t('Prüfliste vor dem Import zeigt sie', /karteGegenprobeHtml\(window\._scanGegenprobe\)/.test(schneide('showScannedResults')), 'fehlt');
t('Scanner-PDF-Weg setzt sie', /_scanGegenprobe = pdf\.gegenprobe/.test(schneide('startMenuScan')), 'fehlt');
t('eingefügter Text löscht die PDF-Gegenprobe (sonst stimmt sie nicht mehr)',
  /_karteVollGegenprobe = null/.test(schneide('karteTextVorschau')), 'fehlt');

console.log(n === ok ? '\nAlle ' + n + ' Tests bestanden.' : '\n' + (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.');
process.exit(n === ok ? 0 : 1);
