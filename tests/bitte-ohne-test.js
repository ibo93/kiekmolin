// "BITTE OHNE": DIE ZUTATENLISTE KOMMT AUS DER BESCHREIBUNG.
//
// GEMELDET WURDE
// --------------
// Bildschirmfoto von pronto-emden.de: unter dem Gericht eine Liste mit
// Kaestchen -- Gurken, Weisskraut, Eisbergsalat, Tomaten, Tsatsiki,
// Rotkraut, Zwiebeln -- zum Abwaehlen. Dazu: "ja oder waere gut dann
// brauchen die Gaeste nicht schreiben das muss zur jeden Gericht passen".
//
// "Das muss zu jedem Gericht passen" ist der Kern. Eine feste Liste
// (Zwiebeln, Tomaten, Salat) waere bei der Haelfte der Gerichte falsch.
//
// WARUM ES BEI UNS AUS DER BESCHREIBUNG KOMMT
// -------------------------------------------
// Andere Portale lassen den Wirt diese Liste pro Gericht von Hand tippen.
// Bei 200 Gerichten macht das niemand, und was niemand pflegt, ist bald
// falsch. Unser Menuescanner liest die Zutatenzeile unter dem Gerichtnamen
// ohnehin in die Beschreibung -- daraus wird die Liste, ohne Zutun, und sie
// passt zu jedem Gericht, weil sie aus dessen eigenen Zutaten kommt.
//
// WAS DABEI SCHIEFGEHEN KANN, UND GENAU DAS PRUEFT DIESER TEST
// -------------------------------------------------------------
// 1. Nicht jede Beschreibung IST eine Zutatenliste. "Hausgemachte
//    Spezialitaet nach Omas Rezept" darf kein Kaestchen ergeben.
// 2. Nicht jede Zutat laesst sich weglassen. "Falafel Rollo ohne Falafel"
//    ist kein Gericht mehr, "ohne Fladenbrot" faellt auseinander.
// 3. Das Wort "ohne" muss bis auf den Bon durchkommen. "> Zwiebeln" statt
//    "> ohne Zwiebeln" ist auf dem Zettel das umgekehrte Gericht.
'use strict';
var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var WURZEL = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
var POS = fs.readFileSync(path.join(WURZEL, 'netlify', 'functions', 'pos-print.js'), 'utf8');
var CODE = H.replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');

function schneide(name) {
    var i = CODE.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = CODE.indexOf('{', i), d = 0;
    for (var k = j; k < CODE.length; k++) {
        if (CODE[k] === '{') d++;
        else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); }
    }
    return '';
}

// Die Funktionen wirklich ausfuehren.
//
// Die Listen und Helfer muessen einzeln mitgeschnitten werden -- der
// Ausschnitt umfasst nur die Funktion selbst. Kommt eine Abhaengigkeit
// dazu und wird hier vergessen, stuerzt der Test mit "is not defined" ab.
// Genau das ist beim Bindewort-Helfer passiert.
function konstante(name) {
    var i = CODE.indexOf('var ' + name);
    if (i < 0) return '';
    return CODE.slice(i, CODE.indexOf(';', i) + 1);
}
var listen = konstante('OHNE_HUELLE') + '\n'
           + konstante('OHNE_KEINE_ZUTAT') + '\n'
           + konstante('OHNE_BINDEWORT') + '\n';

var F = new Function('translations', 'currentLanguage', 'escapeHtml',
    listen + '\n' + schneide('bindewortWeg') + '\n'
    + schneide('zutatenZumWeglassen') + '\n' + schneide('renderOhneHtml')
    + '\n; return { zutaten: zutatenZumWeglassen, html: renderOhneHtml,'
    + '            bindewort: bindewortWeg };'
)({ de: {} }, 'de', function (s) { return String(s == null ? '' : s); });

function z(name, beschreibung) { return F.zutaten({ name: name, description: beschreibung }); }

// ---- 1. Der Fall aus dem Bildschirmfoto ------------------------------------
// Genau das Gericht, das gemeldet wurde. Die Vorlage zeigt sieben Kaestchen;
// dort hat jemand die Liste von Hand gepflegt. Bei uns muss dasselbe
// herauskommen, ohne dass jemand etwas tippt.
(function () {
    var raus = z('Falafel Rollo',
        'Fladenbrot, Falafel, Gurken, Weißkraut, Eisbergsalat, Tomaten, Tsatsiki, Rotkraut, Zwiebeln');
    t('aus der Beschreibung werden genau die sieben abwaehlbaren Zutaten',
      raus.join(',') === 'Gurken,Weißkraut,Eisbergsalat,Tomaten,Tsatsiki,Rotkraut,Zwiebeln',
      raus.join(','));
    t('"Falafel" ist raus -- ein Falafel Rollo ohne Falafel ist kein Gericht',
      raus.indexOf('Falafel') < 0);
    t('"Fladenbrot" ist raus -- ohne Huelle faellt das Rollo auseinander',
      raus.indexOf('Fladenbrot') < 0);
})();

// ---- 2. Fliesstext darf KEINE Kaestchen ergeben ----------------------------
// Der gefaehrlichste Fall: blindes Zerlegen am Komma. Aus einem Werbesatz
// wuerden Kaestchen mit halben Saetzen, und der Gast waehlt "ohne nach Omas
// Rezept" ab.
t('ein Werbesatz ergibt nichts',
  z('Currywurst', 'Hausgemachte Spezialität nach Omas Rezept.').length === 0);
t('auch ohne Punkt am Ende nichts, wenn die Teile zu lang sind',
  z('Schnitzel', 'Paniertes Schweineschnitzel mit hausgemachtem Kartoffelsalat und '
    + 'frischem Beilagensalat').length === 0);
t('ein Satz mit Komma und Doppelpunkt ebenfalls nicht',
  z('Tagesgericht', 'Unser Tipp: frisch zubereitet, jeden Tag anders').length === 0);
// Der Fall, an dem sich die Satzzeichen-Sperre ALLEIN beweisen muss: drei
// kurze Teile, jeder fuer sich unauffaellig -- nur der Punkt verraet, dass
// es Werbung ist und keine Zutatenliste. Ohne die Sperre stuenden hier drei
// Kaestchen "ohne Frisch", "ohne hausgemacht", "ohne täglich neu".
t('drei kurze Teile mit einem Punkt darin sind trotzdem kein Zutatenliste',
  z('Tagessuppe', 'Frisch, hausgemacht, täglich neu.').length === 0,
  JSON.stringify(z('Tagessuppe', 'Frisch, hausgemacht, täglich neu.')));
t('leere Beschreibung: nichts', z('Cola', '').length === 0);
t('keine Beschreibung: nichts', F.zutaten({ name: 'Cola' }).length === 0);
t('kein Gericht: nichts statt Absturz', F.zutaten(null).length === 0);

// ---- 3. Zu kurze Listen lohnen den Abschnitt nicht -------------------------
// Bei zwei Zutaten sieht der Gast sie ohnehin im Namen.
t('zwei Zutaten ergeben keinen Abschnitt', z('Salat', 'Blattsalat, Tomaten').length === 0);
t('drei schon', z('Salat', 'Blattsalat, Tomaten, Gurken').length === 3);

// ---- 4. Beilagen bleiben abwaehlbar ----------------------------------------
// "Ohne Reis" ist ein ueblicher Wunsch. Reis ist eine Beilage, keine Huelle
// -- er darf nicht mit dem Fladenbrot in einen Topf.
(function () {
    var raus = z('Döner Teller', 'Reis, Fleisch, Salat, Tomaten, Zwiebeln, Soße');
    t('Reis bleibt abwaehlbar', raus.indexOf('Reis') >= 0, raus.join(','));
    t('und Pommes auch',
      z('Schnitzel Teller', 'Pommes, Salat, Tomaten, Remoulade').indexOf('Pommes') >= 0);
})();

// ---- 5. Die Huelle faellt bei jeder Schreibweise weg -----------------------
['Fladenbrot', 'Brot', 'Brötchen', 'Teig', 'Wrap', 'Dürüm', 'Baguette', 'Tortilla']
.forEach(function (h) {
    var raus = z('Testgericht', h + ', Tomaten, Zwiebeln, Salat');
    t('"' + h + '" wird nicht als abwaehlbar angeboten', raus.indexOf(h) < 0, raus.join(','));
});

// ---- 6. Nie endlos viele Kaestchen -----------------------------------------
t('bei sehr vielen Zutaten wird bei zwoelf Schluss gemacht',
  z('Grosse Platte', Array.from({ length: 20 }, function (_, i) { return 'Zutat' + i; }).join(', ')).length === 12);

// ---- 7. Der Abschnitt im Dialog --------------------------------------------
(function () {
    var html = F.html({ name: 'Falafel Rollo',
        description: 'Fladenbrot, Falafel, Gurken, Weißkraut, Eisbergsalat, Tomaten, Tsatsiki, Rotkraut, Zwiebeln' });
    t('der Abschnitt heisst "Bitte ohne"', /Bitte ohne/.test(html), html.slice(0, 200));
    t('und hat sieben Kaestchen', (html.match(/toggleOhne\(/g) || []).length === 7,
      (html.match(/toggleOhne\(/g) || []).length);
    t('ohne Zutaten gibt es gar keinen Abschnitt',
      F.html({ name: 'Cola', description: '' }) === '');
    // Das Haekchen muss hier oertlich stehen -- checkSvg im Dialog ist nicht
    // von aussen sichtbar, sonst waere der Abschnitt beim ersten Aufruf tot.
    t('das Haekchen ist vorhanden und nicht undefined',
      html.indexOf('undefined') < 0, html.slice(0, 300));
    t('der Abschnitt steht VOR den Extras, so wie auf der Vorlage',
      /renderOhneHtml\(item\) \+ renderOptionGroupsHtml/.test(CODE));
})();

// ---- 8. Ein Apostroph in der Zutat darf nichts zerlegen --------------------
// onclick="toggleOhne(this, '...')" -- ein einfaches Anfuehrungszeichen in
// der Zutat wuerde den Aufruf sonst mittendrin beenden.
t('ein Apostroph wird abgesichert',
  /replace\(\/'\/g/.test(schneide('renderOhneHtml')), schneide('renderOhneHtml').slice(0, 400));

// ---- 9. DAS WICHTIGSTE: "ohne" kommt bis auf den Bon ------------------------
// Ein "ohne" ist absichtlich eine ganz normale Option mit Preis 0. Dadurch
// laeuft es durch dieselben Leitungen wie die Extras -- Warenkorb,
// Bestellung, Bon, Kuechenansicht -- ohne zweiten Weg, der einzeln
// kaputtgehen kann.
(function () {
    var f = schneide('toggleOhne');
    t('toggleOhne legt eine ganz normale Option an',
      /currentItemOptions\.push\(\{ group: 'ohne', option: text, price: 0/.test(f), f);
    t('das Wort "ohne" steht IM Optionstext, nicht nur in der Gruppe -- sonst '
      + 'stuende auf dem Bon "Zwiebeln" statt "ohne Zwiebeln"',
      /var text = 'ohne ' \+ zutat;/.test(f));
    t('ein zweiter Klick nimmt es wieder weg', /splice\(i, 1\)/.test(f));

    // Die Bestellung schreibt alle Optionen in einen Text.
    t('die Bestellung nimmt die Optionen mit',
      /options: \(item\.selected_options \|\| \[\]\)\.map/.test(CODE));
    // Und der Bon druckt genau diesen Text.
    t('und der Bon druckt sie', /if \(item\.options\) xml \+=/.test(POS));
    t('sowie die freie Notiz daneben', /if \(item\.notes\) \{/.test(POS));
})();

// ---- 10. Das Allergen bleibt stehen ----------------------------------------
// Waehlt der Gast Tsatsiki ab, verschwindet das Milch-Symbol NICHT. Wir
// wissen nicht, ob die Kueche es wirklich weglaesst, und Spuren bleiben. Ein
// Allergen wegen eines Haekchens verschwinden zu lassen waere gefaehrlich --
// deshalb ruehrt "Bitte ohne" die Allergene an keiner Stelle an.
(function () {
    var f = schneide('toggleOhne') + schneide('zutatenZumWeglassen') + schneide('renderOhneHtml');
    t('"Bitte ohne" fasst die Allergene nirgends an',
      f.indexOf('allergens') < 0 && f.indexOf('is_milk') < 0 && f.indexOf('LMIV') < 0,
      'Allergen-Zugriff gefunden');
    t('und der Grund dafuer steht im Code',
      /Spuren bleiben|Allergen wegen eines Haekchens/.test(H));
})();

// ---- 11. Das Notizfeld schickt niemanden zurueck in den Freitext ----------
// Das Feld "Anmerkungen" gibt es weiterhin, und es gehoert dahin: nicht jeder
// Wunsch laesst sich ankreuzen. Sein Beispieltext hiess aber "z.B. ohne
// Zwiebeln" -- also genau das, was jetzt zwei Zeilen hoeher als Kaestchen
// steht. Ein Feld, das dazu auffordert, holt den Wunsch zurueck in den
// Freitext, und getippter Text wird in der Kueche eher ueberlesen als ein
// Kaestchen.
(function () {
    t('das Notizfeld gibt es weiterhin -- nicht jeder Wunsch ist ein Kaestchen',
      /id="itemNotes"/.test(CODE) && /getElementById\('itemNotes'\)/.test(CODE));

    // Reihenfolge: erst ankreuzen, dann tippen. Stuende das Feld ueber den
    // Kaestchen, tippt der Gast, was er darunter haette anklicken koennen.
    var beiOhne = CODE.indexOf('renderOhneHtml(item)');
    var beiNotiz = CODE.indexOf('id="itemNotes"');
    t('es steht hinter den Kaestchen, nicht davor',
      beiOhne > 0 && beiNotiz > beiOhne, beiOhne + ' / ' + beiNotiz);

    ['de', 'en', 'nl'].forEach(function (s) {
        var block = CODE.slice(CODE.indexOf('\n    ' + s + ': {'));
        block = block.slice(0, block.indexOf('\n    },'));
        var m = block.match(/specialWishes:\s*'([^']*)'/);
        t('Sprache ' + s + ': das Beispiel im Notizfeld nennt kein "ohne ..."',
          !!m && !/\bohne\b|\bno onions\b|\bzonder\b/i.test(m[1]), m && m[1]);
    });
})();


// ---- Bindewoerter vor der Zutat --------------------------------------------
// Gemeldet: im Warenkorb stand "+ ohne mit Souvlaki". Zwei Fehler in einer
// Zeile -- das Plus (siehe warenkorb-ohne-test.js) und das "mit".
//
// Die Beschreibung des Rhodos-Tellers lautet "Gyros, Tzatziki, mit Souvlaki,
// Pommes". Der dritte Teil ist keine Zutat, sondern eine Zutat mit Bindewort
// davor -- und daraus wurde der Haken "ohne mit Souvlaki".
console.log('\n-- Bindewoerter --');
[['mit Souvlaki', 'Souvlaki'], ['dazu Pommes', 'Pommes'], ['und Salat', 'Salat'],
 ['dazu mit Pommes', 'Pommes'], ['vom Grill', 'Grill'], ['Souvlaki', 'Souvlaki']
].forEach(function (f) {
    t('"' + f[0] + '" -> "' + f[1] + '"', F.bindewort(f[0]) === f[1], F.bindewort(f[0]));
});
// Nur am ANFANG -- sonst wird aus "Salat mit Ei" ein "Salat".
t('mitten im Text wird nichts abgeschnitten',
  F.bindewort('Salat mit Ei') === 'Salat mit Ei', F.bindewort('Salat mit Ei'));
t('was nur aus Bindewoertern besteht, faellt weg',
  F.bindewort('mit') === '' && F.bindewort('...') === '', [F.bindewort('mit'), F.bindewort('...')]);

t('der Fall aus dem Warenkorb ist behoben',
  z('55 Rhodos-Teller', 'Gyros, Tzatziki, mit Souvlaki, Pommes').indexOf('Souvlaki') > -1
  && JSON.stringify(z('55 Rhodos-Teller', 'Gyros, Tzatziki, mit Souvlaki, Pommes')).indexOf('mit Souvlaki') < 0,
  z('55 Rhodos-Teller', 'Gyros, Tzatziki, mit Souvlaki, Pommes'));

// ---- Ein Punkt am Ende ist kein Satz ---------------------------------------
// Hier fiel die halbe Speisekarte durch. "Gyros, Tzatziki, Pommes, Salat."
// ist eine Zutatenliste -- der Punkt dahinter aendert daran nichts. Beim Gast
// fehlte der Abschnitt "Bitte ohne" dann ganz, ohne erkennbaren Grund.
console.log('\n-- Punkt am Ende --');
t('Liste mit Punkt am Ende zaehlt trotzdem',
  z('Gyros-Teller', 'Gyros, Tzatziki, Pommes, Salat.').length >= 3,
  z('Gyros-Teller', 'Gyros, Tzatziki, Pommes, Salat.'));
t('der Punkt landet nicht in der letzten Zutat',
  JSON.stringify(z('Gyros-Teller', 'Gyros, Tzatziki, Pommes, Salat.')).indexOf('.') < 0,
  z('Gyros-Teller', 'Gyros, Tzatziki, Pommes, Salat.'));
// Innere Satzzeichen bleiben ein Ausschluss -- das ist wirklich Fliesstext.
t('echter Fliesstext bleibt draussen',
  z('Teller', 'Gyros mit Pommes. Dazu ein Getraenk.').length === 0,
  z('Teller', 'Gyros mit Pommes. Dazu ein Getraenk.'));

// ---- Zubereitungen sind keine Zutaten --------------------------------------
// "ohne paniert" ergibt keinen Sinn und macht die ganze Liste
// unglaubwuerdig -- wer einmal Unsinn darin sieht, macht sie nie wieder auf.
console.log('\n-- Zubereitungen --');
t('"paniert" wird nicht zum Abwaehlen angeboten',
  z('Schnitzel Wiener Art', 'paniert, mit Pommes, dazu Salat').indexOf('paniert') < 0,
  z('Schnitzel Wiener Art', 'paniert, mit Pommes, dazu Salat'));
t('die echten Beilagen bleiben',
  z('Schnitzel Wiener Art', 'paniert, mit Pommes, dazu Salat').length === 2,
  z('Schnitzel Wiener Art', 'paniert, mit Pommes, dazu Salat'));

// ---- Doppelte nach dem Abschneiden -----------------------------------------
// "Pommes" und "dazu Pommes" werden nach dem Abschneiden gleich.
console.log('\n-- Doppelte --');
var dopp = z('Teller', 'Pommes, dazu Pommes, Salat');
t('dieselbe Zutat steht nur einmal drin',
  dopp.filter(function (x) { return x.toLowerCase() === 'pommes'; }).length === 1, dopp);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
