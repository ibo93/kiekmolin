// "ALLE PIZZEN MIT TOMATENSAUCE UND KÄSE" -- der Satz, der nur einmal
// auf der Karte steht.
//
// GEMELDET
// "füge kopfband ein für Pizza ist es optimal beispiel alle pizze mit
//  tomatensauce und käse" und "bei menüscanner muss es auch aufnehmen".
//
// DAS PROBLEM
// Auf fast jeder Pizzakarte steht einmal oben "Alle Pizzen mit
// Tomatensauce und Käse", und bei den einzelnen Pizzen dann nur noch der
// Belag ("Salami", "Schinken, Ananas"). Die Grundzutaten stehen also NUR
// in dieser einen Zeile.
//
// Der Scanner hat sie bisher weggeworfen -- sie ist ja kein Gericht.
// Damit fehlte beim Gast das Wichtigste: der Käse tauchte nirgends auf,
// also auch nicht bei "Bitte ohne" und nicht bei den Allergenen. Wer
// laktoseintolerant ist, sah eine Pizza ohne jeden Hinweis auf Milch.
//
// DIE LOESUNG -- OHNE NEUE SPALTE
// Der Satz wird in die BESCHREIBUNG jedes Gerichts der Kategorie
// eingearbeitet, vorne, so wie auf der Karte: erst der Boden, dann der
// Belag. Damit sieht ihn alles, was ohnehin die Beschreibung liest --
// "Bitte ohne", die Allergen-Vorschlaege und das Kopfband, das daraus
// wieder "Alle Pizzen mit: Tomatensauce, Käse" rechnet.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var path = require('path');
var SRC = fs.readFileSync(path.join(KMI, 'netlify', 'functions', 'lib', 'scan-kern.js'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

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
var F = new Function(
    schneide('zerlegeGroessen') + '\n' + schneide('parseZeilen') + '\n'
    + schneide('hinweisZutaten') + '\n' + schneide('_stecktDrin') + '\n'
    + schneide('hinweiseEinarbeiten')
    + '; return { p: parseZeilen, z: hinweisZutaten, e: hinweiseEinarbeiten };')();

console.log('\n-- 1. Der Prompt fragt danach --');
t('die eigene Zeilenart ist beschrieben', /SAMMELHINWEISE/.test(SRC), 'fehlt');
t('mit dem Pizza-Beispiel', /#Pizzen\|Alle Pizzen mit Tomatensauce und Kaese/.test(SRC), 'kein Beispiel');
// Ohne diese Ansage erfindet das Modell Saetze, die nirgends stehen.
t('und der Ansage, nichts zu erfinden',
  /Erfinde nichts: nur was wirklich auf der Karte steht/.test(SRC), 'fehlt');
t('es steht dabei, dass es keine Gerichte sind',
  /Solche Zeilen sind KEINE Gerichte/.test(SRC), 'fehlt');

console.log('\n-- 2. Die Zeile wird gelesen, aber nicht mitgezaehlt --');
var roh = [
    '#Pizzen|Alle Pizzen mit Tomatensauce und Käse',
    '20|Pizza Margherita||8.50|Pizzen|||',
    '21|Pizza Salami|Salami|9.50|Pizzen|||',
    '22|Pizza Hawaii|Schinken, Ananas|10.50|Pizzen|||',
    '#Salate|Alle Salate mit Gurken, Tomaten und Zwiebeln',
    '40|Bauernsalat|Feta|8.90|Salate|||'
].join('\n');
var items = F.p(roh);
t('vier Gerichte, keine Hinweiszeile darunter', items.length === 4, items.map(function (i) { return i.name; }));
t('die Hinweise haengen an der Liste', !!items.hinweise, 'fehlen');
t('beide Kategorien erkannt', Object.keys(items.hinweise).length === 2, Object.keys(items.hinweise));
t('mit Text', items.hinweise['pizzen'].text === 'Alle Pizzen mit Tomatensauce und Käse', items.hinweise['pizzen']);

// Muell soll nicht durchrutschen.
var muell = F.p(['#|Ohne Kategorie', '#Pizzen|', '#Pizzen|kurz'].join('\n'));
t('ohne Kategorie kein Hinweis', !muell.hinweise[''], muell.hinweise);
t('ohne Text kein Hinweis', !muell.hinweise['pizzen'], muell.hinweise);

console.log('\n-- 3. Die Zutaten aus dem Satz --');
[['Alle Pizzen mit Tomatensauce und Käse', ['Tomatensauce', 'Käse']],
 ['Alle Salate mit Gurken, Tomaten und Zwiebeln', ['Gurken', 'Tomaten', 'Zwiebeln']],
 ['Fast alle Gerichte mit Zwiebeln', ['Zwiebeln']],
 ['Alle Gerichte mit Beilagensalat.', ['Beilagensalat']]
].forEach(function (f) {
    t('"' + f[0] + '"', JSON.stringify(F.z(f[0])) === JSON.stringify(f[1]), F.z(f[0]));
});
// Ohne "mit" laesst sich der Satz nicht sicher zerlegen -- dann lieber
// nichts, als "Alle Pizzen" als Zutat einzutragen.
t('ohne "mit" wird nichts geraten', F.z('Unsere Pizzen sind lecker').length === 0, F.z('Unsere Pizzen sind lecker'));
t('leerer Satz gibt nichts', F.z('').length === 0 && F.z(null).length === 0, 'wirft');

console.log('\n-- 4. Einarbeiten in die Gerichte --');
F.e(items, items.hinweise);
var nach = {};
items.forEach(function (it) { nach[it.name] = it.description; });
t('das Gericht ohne Beschreibung bekommt die Grundzutaten',
  nach['Pizza Margherita'] === 'Tomatensauce, Käse', nach['Pizza Margherita']);
// Die Grundzutaten stehen VORNE, so wie auf der Karte: erst der Boden,
// dann der Belag.
t('der Belag bleibt dahinter stehen',
  nach['Pizza Salami'] === 'Tomatensauce, Käse, Salami', nach['Pizza Salami']);
t('auch bei mehreren Belaegen',
  nach['Pizza Hawaii'] === 'Tomatensauce, Käse, Schinken, Ananas', nach['Pizza Hawaii']);
t('die andere Kategorie bekommt ihre eigenen',
  nach['Bauernsalat'] === 'Gurken, Tomaten, Zwiebeln, Feta', nach['Bauernsalat']);

console.log('\n-- 5. Nichts doppelt --');
var d = F.p(['#Pizzen|Alle Pizzen mit Tomatensauce und Käse',
             '30|Pizza Käse|Käse, Tomatensauce, Oregano|9.00|Pizzen|||',
             '31|Pizza Extra|Tomatensauce, Salami|9.00|Pizzen|||'].join('\n'));
F.e(d, d.hinweise);
t('schon vorhandene Zutaten kommen nicht nochmal',
  d[0].description === 'Käse, Tomatensauce, Oregano', d[0].description);
t('nur das Fehlende wird ergaenzt',
  d[1].description === 'Käse, Tomatensauce, Salami', d[1].description);

console.log('\n-- 6. Kategorien finden zusammen --');
// "Pizzen" im Hinweis, "Pizza" am Gericht -- oder umgekehrt. Klein und
// ohne Endung vergleichen; enger waere unsicher, weiter waere raten.
var m = F.p(['#Pizza|Alle Pizzen mit Tomatensauce und Käse',
             '50|Margherita||8.50|PIZZEN|||'].join('\n'));
F.e(m, m.hinweise);
t('"Pizza" im Hinweis trifft "PIZZEN" am Gericht',
  m[0].description === 'Tomatensauce, Käse', m[0].description);
// Aber nicht irgendwas: eine fremde Kategorie bleibt unberuehrt.
var fremd = F.p(['#Pizzen|Alle Pizzen mit Tomatensauce und Käse',
                 '60|Cola||3.00|Getränke|||'].join('\n'));
F.e(fremd, fremd.hinweise);
t('eine fremde Kategorie bleibt unberuehrt', !fremd[0].description, fremd[0].description);

console.log('\n-- 7. Durchgereicht bis zum Ergebnis --');
t('normalizeItems reicht die Hinweise weiter',
  /out\.hinweise = \(parsed && parsed\.hinweise\)/.test(SRC), 'reisst ab');
t('leseGanz sammelt sie ueber alle Runden',
  /if \(!hinweise\[k\]\) hinweise\[k\] = teil\.hinweise\[k\];/.test(SRC), 'nur erste Runde');
// Erst am Ende einarbeiten: der Hinweis kommt in Runde 1, die Gerichte
// ueber mehrere Runden.
t('eingearbeitet wird erst ganz am Ende',
  /hinweiseEinarbeiten\(alle, hinweise\);\s*\n\s*\n\s*return \{ items: alle, hinweise: hinweise/.test(SRC),
  'je Runde');
t('und mitgegeben', /return \{ items: alle, hinweise: hinweise, fehler: fehler \}/.test(SRC), 'fehlt');
// Auch wenn eine Runde nur Ueberschriften brachte.
t('Hinweise ohne Gerichte gehen nicht verloren',
  /if \(zeilen\.hinweise && Object\.keys\(zeilen\.hinweise\)\.length\)/.test(SRC), 'gehen verloren');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
