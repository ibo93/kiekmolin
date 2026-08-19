// EXTRA ZUTATEN ZUM ANKLICKEN.
//
// Die Karte sagt nur, was eine Extra-Zutat KOSTET ("Extra Zutaten: klein
// 1,00 €, groß 1,50 €") -- nicht, welche es gibt. Der Import legte deshalb
// eine Gruppe mit einer Option namens "Extra Zutat (klein)" an. Damit kann
// ein Gast nichts anfangen: er will Paprika anklicken, nicht "Extra Zutat".
//
// Die Namen stehen aber auf der Karte -- in den Beschreibungen. Jede Pizza
// listet ihre Zutaten. Was in einer Kategorie mehrfach vorkommt, ist eine
// Zutat, die das Haus da hat.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var SEITEN = JSON.parse(fs.readFileSync(KMI + '/tests/daten/pronto-pdfjs.json', 'utf8'));
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}
var vorspann = H.slice(H.indexOf('var _PDF_ALLERGEN'), H.indexOf(';', H.indexOf('var _PDF_ALLERGEN')) + 1);
var F = new Function(vorspann + '\n' + ['pdfSeiteZuText', 'parseKartenText', 'pdfGerichteZuItems',
    '_nrWert', 'sortiereNachNummer', 'extrasZuGruppen', 'zutatenAusKategorie', 'extrasMitZutaten', 'extrasAufAlleKategorien']
    .map(schneide).join('\n') + '; return { pdfSeiteZuText: pdfSeiteZuText, parseKartenText: parseKartenText,'
    + ' pdfGerichteZuItems: pdfGerichteZuItems, sortiereNachNummer: sortiereNachNummer,'
    + ' extrasZuGruppen: extrasZuGruppen, zutatenAusKategorie: zutatenAusKategorie,'
    + ' extrasMitZutaten: extrasMitZutaten, extrasAufAlleKategorien: extrasAufAlleKategorien };')();

// Echten Weg gehen
var texte = SEITEN.map(function (s) { return F.pdfSeiteZuText(s.items, s.w); }).filter(Boolean);
var kopf = null;
texte.forEach(function (txt) {
    var k = txt.split('\n').filter(function (z) { return z.slice(0, 3) === '## '; }).map(function (z) { return z.slice(3).trim(); });
    kopf = (kopf === null) ? k : kopf.filter(function (x) { return k.indexOf(x) >= 0; });
});
texte = texte.map(function (txt) {
    return txt.split('\n').filter(function (z) {
        return !(z.slice(0, 3) === '## ' && kopf.indexOf(z.slice(3).trim()) >= 0);
    }).join('\n');
});
var ger = [], lk = '', roh = [];
texte.forEach(function (txt) {
    var teil = F.parseKartenText(txt, lk);
    if (teil.length) lk = teil[teil.length - 1].kat;
    roh = roh.concat(teil.extras || []);
    ger = ger.concat(teil);
});
var items = F.sortiereNachNummer(F.pdfGerichteZuItems(ger));
var gruppen = F.extrasAufAlleKategorien(F.extrasMitZutaten(F.extrasZuGruppen(roh), items), items);

function gruppe(kat) { return gruppen.filter(function (g) { return g.kategorie === kat && /zutat/i.test(g.name); })[0]; }
var pizza = gruppe('Pizza');

t('es gibt eine Extra-Zutaten-Gruppe fuer Pizza', !!pizza, gruppen.map(function (g) { return g.kategorie + '/' + g.name; }).join(', '));
t('sie enthaelt echte Zutaten statt "Extra Zutat"',
  !!pizza && !pizza.optionen.some(function (o) { return /^Extra Zutat/.test(o.name); }),
  pizza && pizza.optionen.map(function (o) { return o.name; }).join(', '));
['Salami', 'Champignons', 'Zwiebeln', 'Paprika', 'Thunfisch', 'Putenschinken'].forEach(function (z) {
    t('"' + z + '" steht zum Anklicken bereit',
      !!pizza && pizza.optionen.some(function (o) { return o.name === z; }),
      pizza && pizza.optionen.map(function (o) { return o.name; }).join(', '));
});
t('jede Zutat kostet den Preis von der Karte (1,00 €)',
  !!pizza && pizza.optionen.every(function (o) { return o.price === 1; }),
  pizza && JSON.stringify(pizza.optionen.slice(0, 3)));
t('mehrere Zutaten sind waehlbar', !!pizza && pizza.mehrfach === true, pizza && pizza.mehrfach);
t('kein Unsinn in der Liste (einmalige Beiwerk-Zeilen fliegen raus)',
  !!pizza && !pizza.optionen.some(function (o) { return /überraschen|teuflisch|scharfe Sauce/i.test(o.name); }),
  pizza && pizza.optionen.map(function (o) { return o.name; }).join(', '));

var salat = gruppe('Salate');
t('Salate bekommen ihre eigenen Zutaten zum eigenen Preis (0,50 €)',
  !!salat && salat.optionen.length >= 4 && salat.optionen.every(function (o) { return o.price === 0.5; }),
  salat && salat.optionen.map(function (o) { return o.name + ' ' + o.price; }).join(', '));

// Kategorien mit zu wenig Material bleiben unangetastet -- lieber der reine
// Preis als eine erfundene Liste.
var fam = gruppe('Familienpizza');
t('Kategorien ohne genug Zutaten behalten den reinen Preis',
  !fam || fam.optionen.some(function (o) { return /^Extra Zutat/.test(o.name); }),
  fam && fam.optionen.map(function (o) { return o.name; }).join(', '));

// --- Import ------------------------------------------------------------------
// Zutaten sind Mehrfachauswahl, ein Menü-Upgrade nicht -- deshalb hängt es
// jetzt an der Gruppe statt fest verdrahtet zu sein.
t('Extras werden als Mehrfachauswahl angelegt',
  /selection_type: g\.mehrfach === false \? 'single' : 'multiple'/.test(H));
t('und als Aufpreis, nicht als Ersatzpreis', /price_type: 'add', is_default: false/.test(H));
t('an die Kategorie gebunden', /internal_name: g\.kategorie \? \('cats:' \+ g\.kategorie\) : null/.test(H));
t('vorhandene Gruppen werden NICHT ein zweites Mal angelegt',
  /_vorhandeneGruppen\[_schl\]\) \{ extrasUebersprungen\+\+; continue; \}/.test(H));
t('und die Meldung sagt, wieviele es schon gab', /gab es/.test(H) && /extrasUebersprungen/.test(H));

// --- Jedes Gericht soll Extras anbieten können -----------------------------
// Auf der Karte steht die Extra-Regel nur unter Pizzen und Salaten. Ein Gast,
// der ein Schnitzel nimmt, möchte aber genauso Käse dazu -- und jede
// angeklickte Zutat ist Umsatz, der sonst nicht stattfindet.
var uebertragen = gruppen.filter(function (g) { return g.uebertragen; })[0];
t('Kategorien ohne eigene Extra-Regel bekommen die Liste auch',
  !!uebertragen, gruppen.map(function (g) { return g.kategorie; }).join(' / '));
if (uebertragen) {
    var kats = uebertragen.kategorie.split(',');
    ['Fleischgerichte', 'Pronto Spezial Schnitzel', 'Baguette', 'Burger', 'Beilagen'].forEach(function (k) {
        t('"' + k + '" kann jetzt Extras anbieten', kats.indexOf(k) >= 0, uebertragen.kategorie);
    });
    t('Pizza und Salate behalten ihre eigene Regel',
      kats.indexOf('Pizza') < 0 && kats.indexOf('Salate') < 0, uebertragen.kategorie);
    t('der Preis ist der von der Karte, nicht erfunden',
      uebertragen.optionen.every(function (o) { return o.price === 1; }),
      JSON.stringify(uebertragen.optionen.slice(0, 2)));
    t('nur EINE zusaetzliche Gruppe, nicht eine je Kategorie',
      gruppen.filter(function (g) { return g.uebertragen; }).length === 1);
}

// --- Extras müssen aus BEIDEN Wegen entstehen ------------------------------
// Sie standen mitten im Import. Der Abgleich ruft den Import aber nur auf,
// wenn es NEUE Gerichte gibt. Wer eine bekannte Karte noch einmal einliest --
// der Normalfall, etwa wegen neuer Preise -- bekam deshalb nie Extras.
t('Extras-Anlage ist eine eigene Funktion, kein Teil des Imports',
  /async function legeExtrasAn\(restaurantId, SUPA_H\)/.test(H));
t('der Import ruft sie auf', /var _exErg = await legeExtrasAn\(restaurantId, SUPA_H\)/.test(H));
t('der Abgleich ruft sie AUCH auf -- auch ohne neue Gerichte',
  /exErg = await legeExtrasAn\(restaurantId, H\)/.test(H));
var iNeu = H.indexOf('if (d.neu.length) {');
var iEx = H.indexOf('exErg = await legeExtrasAn(restaurantId, H)');
t('und zwar ausserhalb des "gibt es neue Gerichte"-Zweigs', iEx > iNeu && iEx > 0);
t('die Meldung nennt die angelegten Gruppen',
  /exErg\.angelegt \+ ' Extra-Gruppe'/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
