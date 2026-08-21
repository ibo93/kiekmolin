// DIE SPEISEKARTE LAEUFT DURCH, STATT UMZUSCHALTEN.
//
// ANLASS
// Bildschirmvideo von pronto-emden.de mit der Frage: "sollen wir so
// machen das mit wenn ich runterscrolle zum naechsten Kategorie komme?"
//
// WARUM JA
// Vorher zeigte die Karte immer nur EINE Kategorie. Wer "Vorspeisen"
// antippte, sah Vorspeisen -- alles andere nur, wenn er von sich aus
// weitertippte. Kaum jemand tut das; "Beilagen" und "Desserts" wurden so
// gut wie nie geoeffnet. Beim Durchscrollen kommt der Gast an
// Abschnitten vorbei, die er nie angetippt haette.
//
// WAS BEWUSST NICHT UEBERNOMMEN WURDE
// Beim Mitbewerber scrollen die Gerichte INNERHALB einer Kategorie quer,
// mit Pfeilen links und rechts. Das sieht aufgeraeumt aus und versteckt
// die halbe Karte -- was rechts ausserhalb liegt, wird kaum bestellt.
//
// WAS UEBERNOMMEN WURDE
// Das Kopfband mit den Kategorie-Hinweisen ("Alle Gerichte mit:
// Zwiebeln"). Das beantwortet die Zwiebel- und Allergiefrage einmal pro
// Kategorie statt bei jedem Gericht. Wir muessen dafuer nichts tippen
// lassen -- zutatenZumWeglassen() liest die Zutaten ohnehin.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

console.log('\n-- 1. Die Karte wird nach Abschnitten gebaut --');
t('renderKarteDurchgehend gibt es', /function renderKarteDurchgehend\(items, kategorien\)/.test(h), 'fehlt');
t('jeder Abschnitt bekommt seine Kategorie als Attribut',
  /<section class="kmi-kat-abschnitt" data-kat="/.test(h), 'kein Attribut');
// Kein Kopf mehr im Abschnitt: die Kategorie steht nur oben in der
// klebenden Leiste. "ich will keine doppelt namen nur oben soll die
// kategorie sein ... mach das kopfbandel auch weg"
t('kein Kopfband im Abschnitt', /class="kmi-kat-kopf"/.test(h) === false, 'Kopfband wieder da');
t('und keine Kategorie-Ueberschrift', /translateCategory\(r\.name/.test(h) === false, 'Ueberschrift wieder da');
// Ohne Kopf wuerde das erste Gericht der naechsten Kategorie direkt an
// der letzten Vorspeise kleben -- man scrollt an der Grenze vorbei.
t('dafuer etwas Luft ueber jedem Abschnitt',
  /kmi-kat-abschnitt[\s\S]{0,120}?scroll-margin-top:140px;padding-top:18px;/.test(h), 'keine Luft')
t('die Gerichte stehen untereinander, nicht quer',
  /'<div class="stitch-menu-grid">' \+ gerichtKartenHtml\(r\.items, r\.versatz\)/.test(h), 'anderes Raster');
// Kein Quer-Scrollen: das war die bewusste Abweichung vom Mitbewerber.
t('kein waagerechtes Scrollen in den Abschnitten',
  /kmi-kat-abschnitt[^"]*"[^>]*overflow-x/.test(h) === false, 'quer gescrollt');

console.log('\n-- 2. Der Index bleibt richtig --');
// Der Knopf am Gericht greift ueber window._menuDisplayItems[idx] zu.
// Diese Liste ist FLACH ueber alle Kategorien -- wer nur den Ausschnitt
// einer Kategorie zeichnet, muss den Index verschieben. Sonst oeffnet
// der Knopf im dritten Abschnitt das Gericht aus dem ersten.
t('gerichtKartenHtml nimmt einen Versatz', /function gerichtKartenHtml\(items, versatz\)/.test(h), 'kein Versatz');
t('und rechnet ihn auf den Index',
  /items\.forEach\(function\(item, _i\) \{\s*\n\s*var idx = versatz \+ _i;/.test(h), 'nicht gerechnet');
t('die flache Liste wird in Zeichenreihenfolge gebaut',
  /reihen\.forEach\(function \(r\) \{ r\.versatz = flach\.length; flach = flach\.concat\(r\.items\); \}\);/.test(h),
  'andere Reihenfolge');
t('und als _menuDisplayItems gesetzt', /window\._menuDisplayItems = flach;/.test(h), 'nicht gesetzt');

console.log('\n-- 3. Kein Gericht faellt unter den Tisch --');
// Was keiner bekannten Kategorie zugeordnet ist, kommt ans Ende statt zu
// verschwinden. Ein Gericht, das niemand sieht, wird nie bestellt -- und
// der Wirt sucht den Fehler bei sich.
t('unzugeordnete Gerichte kommen ans Ende',
  /Object\.keys\(proKat\)\.forEach\(function \(k\) \{[\s\S]{0,200}?otherCategory/.test(h), 'fallen weg');
t('der Grund steht dabei', h.indexOf('Ein Gericht, das niemand sieht') > -1, 'keine Begruendung');

console.log('\n-- 4. Die Hinweis-Rechnerei ist mitgegangen --');
// Die Zeile "Alle Pizzen mit: Tomatensauce, Käse" gibt es nicht mehr.
// Damit haben kategorieHinweis(), kategorieHinweisHtml() und die
// Mehrzahl-Liste KAT_MEHRZAHL keinen Aufrufer mehr. Toter Code, aus dem
// heraus spaeter jemand die Haelfte wiederbelebt, soll gar nicht erst
// liegenbleiben -- dieselbe Lehre wie beim Essensfilter.
['kategorieHinweis', 'kategorieHinweisHtml', 'katMehrzahl'].forEach(function (f) {
    t(f + ' ist entfernt', h.indexOf('function ' + f + '(') < 0, 'liegt noch da');
});
t('KAT_MEHRZAHL ist entfernt', h.indexOf('var KAT_MEHRZAHL') < 0, 'liegt noch da');
t('und haengt auch nicht mehr am window',
  h.indexOf('window.kategorieHinweis') < 0 && h.indexOf('window.katMehrzahl') < 0, 'haengt noch');
t('der Grund steht im Quelltext',
  h.indexOf('KEIN KOPFBAND UEBER DEN KATEGORIEN -- BEWUSST ENTFERNT') > -1, 'keine Begruendung');
t('und die Bedingung fuer eine Rueckkehr auch',
  h.indexOf('WANN MAN ES ZURUECKHOLEN DUERFTE') > -1, 'keine Bedingung');

// zutatenZumWeglassen darf NICHT mitgehen -- daran haengt "Bitte ohne
// Zwiebeln" im Warenkorb. Das war der eigentliche Grund, warum die
// Zutaten ueberhaupt ausgelesen werden.
var welt = { console: console, Object: Object, String: String, Array: Array, window: {} };
welt.window = welt;
vm.createContext(welt);
var listen = ['OHNE_HUELLE', 'OHNE_KEINE_ZUTAT', 'OHNE_BINDEWORT'].map(function (k) {
    var i = h.indexOf('var ' + k);
    return i < 0 ? '' : h.slice(i, h.indexOf(';', i) + 1);
}).join('\n');
function schneide(name) {
    var i = h.indexOf('function ' + name + '(');
    if (i < 0) return '';
    var j = h.indexOf('{', i), d = 0;
    for (var k = j; k < h.length; k++) {
        if (h[k] === '{') d++;
        else if (h[k] === '}') { d--; if (!d) return h.slice(i, k + 1); }
    }
    return '';
}
vm.runInContext(listen + '\n' + schneide('bindewortWeg') + '\n'
    + schneide('zutatenZumWeglassen'), welt);
t('zutatenZumWeglassen gibt es weiter', typeof welt.zutatenZumWeglassen === 'function', 'weg');
// Sie nimmt das Gericht, nicht den Text -- sie liest description selbst.
var probe = welt.zutatenZumWeglassen({ description: 'Tomaten, Gurken, Zwiebeln, Feta' });
t('und liest die Zutaten noch aus', probe.indexOf('Zwiebeln') > -1, probe);

// Der Sammelhinweis von der Karte geht auch nicht verloren: der Scanner
// arbeitet ihn beim Import in JEDE Beschreibung ein. Die Angabe steht
// damit am Gericht statt ueber der Kategorie -- und zaehlt so im
// Warenkorb, auf dem Bon und bei "Bitte ohne ..." mit.
var scan = fs.readFileSync(KMI + '/netlify/functions/lib/scan-kern.js', 'utf8');
t('der Scanner arbeitet den Sammelhinweis weiter ein',
  /function hinweiseEinarbeiten\(/.test(scan), 'fehlt');
t('und der Verweis darauf steht in index.html',
  h.indexOf('hinweiseEinarbeiten in') > -1, 'kein Verweis');

console.log('\n-- 5. Die Leiste laeuft mit --');
t('es gibt den Mitlauf', /function kategorieLeisteMitlaufen\(\)/.test(h), 'fehlt');

// KEIN IntersectionObserver MEHR -- und warum das kein Rueckschritt ist.
//
// Gemeldet: "wenn scrolle steht oben nicht welche kategorie ich bin ...
// bleibt bei den ich geklickt habe", und entscheidend:
// "es geht nur auf dem handy nicht auf dem laptop".
//
// #menuItemsList ist ein eigener Scroll-Kasten (overflow-y:auto). Ein
// Beobachter mit "root: null" misst gegen das FENSTER -- beim
// Schwung-Scrollen in einem inneren Kasten rechnet das Handy die
// Schnittmengen waehrenddessen nicht neu. Auf dem Laptop kommt mit dem
// Mausrad jeder Schritt einzeln an, dort fiel es nie auf.
var mit = h.slice(h.indexOf('function kategorieLeisteMitlaufen()'),
                  h.indexOf('function katPilleMarkieren'));
t('der Mitlauf haengt an keinem IntersectionObserver mehr',
  mit.indexOf('IntersectionObserver') < 0, mit.slice(0, 200));
t('sondern am Scroll-Kasten selbst',
  /liste\.addEventListener\('scroll', angestossen, \{ passive: true \}\)/.test(mit), 'nicht am Kasten');
// passive: sonst wartet der Browser bei jedem Wisch darauf, ob wir das
// Scrollen abbrechen wollen -- genau das ruckelt.
t('und zwar passiv', (mit.match(/passive: true/g) || []).length >= 3,
  (mit.match(/passive: true/g) || []).length + ' von 3');
// Gerechnet wird einmal je Bild, nicht bei jedem Pixel. Das war der
// Einwand gegen scroll-Handler -- er gilt fuer ungebremste.
t('gerechnet wird einmal je Bild', /requestAnimationFrame/.test(mit), 'ungebremst');
t('die Merkfahne verhindert Mehrfachrechnen',
  /if \(_katWartet\) return;\s*\n\s*_katWartet = true;/.test(mit), 'keine Fahne');
// Ohne Abraeumen haengt nach jedem Neuzeichnen ein weiterer Zuhoerer an
// derselben Liste -- nach zehn Sprachwechseln rechnen zehn Kopien.
t('alte Zuhoerer werden vorher abgeraeumt',
  /if \(_katAufraeumen\) \{ _katAufraeumen\(\); _katAufraeumen = null; \}/.test(mit), 'sammelt sich an');
t('und beim Abraeumen gehen alle drei weg',
  (mit.match(/removeEventListener/g) || []).length === 3,
  (mit.match(/removeEventListener/g) || []).length + ' von 3');
t('einmal sofort, damit die Pille schon vor dem ersten Wisch stimmt',
  /\/\/ Einmal sofort[\s\S]{0,80}angestossen\(\);/.test(mit), 'erst beim Scrollen');

// Die Rechnung selbst -- und zwar ausgefuehrt, nicht gelesen.
// Der alte Streifen war "-150px oben, -70% unten" vom FENSTER: bei
// einer Fensterhoehe unter 500px schrumpft er auf null. Dann schneidet
// nie etwas und die Pille steht still. Die neue Rechnung kennt keine
// Fensterhoehe.
t('die Leselinie sitzt im Kasten, nicht im Fenster',
  /liste\.getBoundingClientRect\(\)\.top \+ 120/.test(h), 'am Fenster');
t('keine Prozente mehr, die zusammenklappen koennen',
  /rootMargin/.test(h.slice(h.indexOf('function katAnDerLinie'),
                            h.indexOf('function katPilleMarkieren'))) === false, 'noch Prozente');

var linie = { window: {}, Array: Array };
linie.window = linie;
vm.createContext(linie);
vm.runInContext(schneide('katAnDerLinie'), linie);
// Ein Kasten, dessen Oberkante bei 0 liegt: die Leselinie ist dann 120.
function kasten(abschnitte) {
    return {
        getBoundingClientRect: function () { return { top: 0 }; },
        querySelectorAll: function () { return abschnitte; }
    };
}
function ab(id, oben, unten) {
    return { getAttribute: function () { return id; },
             getBoundingClientRect: function () { return { top: oben, bottom: unten }; } };
}
t('trifft den Abschnitt, der auf der Linie liegt',
  linie.katAnDerLinie(kasten([ab('a', -800, 100), ab('b', 100, 900), ab('c', 900, 1700)])) === 'b',
  linie.katAnDerLinie(kasten([ab('a', -800, 100), ab('b', 100, 900), ab('c', 900, 1700)])));
// Das war der Fehler im alten Beobachter: er nahm bei mehreren
// Meldungen den OBERSTEN -- also den, an dem man schon vorbei ist.
t('nicht den, an dem man schon vorbei ist',
  linie.katAnDerLinie(kasten([ab('a', -2000, 121), ab('b', 121, 900)])) === 'a',
  'siehe naechster Fall');
t('ganz oben gilt der erste Abschnitt',
  linie.katAnDerLinie(kasten([ab('a', 300, 1100), ab('b', 1100, 1900)])) === 'a',
  linie.katAnDerLinie(kasten([ab('a', 300, 1100), ab('b', 1100, 1900)])));
t('ganz unten gilt der letzte',
  linie.katAnDerLinie(kasten([ab('a', -3000, -2000), ab('b', -2000, -50)])) === 'b',
  linie.katAnDerLinie(kasten([ab('a', -3000, -2000), ab('b', -2000, -50)])));
t('ohne Abschnitte kommt nichts zurueck',
  linie.katAnDerLinie(kasten([])) === null, 'nicht null');

t('die aktive Pille wird in den Blick geholt',
  /leiste\.scrollTo\(\{ left: Math\.max\(0, soll\), behavior: 'smooth' \}\)/.test(h), 'fehlt');
// scrollIntoView wuerde auch die Seite verschieben und dem Gast den
// Scroll unter den Fingern wegziehen.
t('dabei bewegt sich nur die Leiste, nicht die Seite',
  /treffer\.scrollIntoView\(/.test(h) === false, 'verschiebt die Seite');
t('der Grund fuer den Umbau steht im Quelltext',
  h.indexOf('WARUM HIER KEIN IntersectionObserver MEHR STEHT') > -1, 'keine Begruendung');

console.log('\n-- 6. Antippen springt, statt neu zu laden --');
var sv = h.indexOf('function selectMenuCategory(categoryId, el)');
var sfn = h.slice(sv, sv + 2200);
t('selectMenuCategory laedt nicht mehr als Erstes nach',
  /function selectMenuCategory[\s\S]{0,400}?loadMenuItems\(currentOrderRestaurant\.id, categoryId\);\s*\n\}/.test(h) === false,
  'laedt noch');
t('es scrollt zum Abschnitt',
  /liste\.scrollTo\(\{ top: Math\.max\(0, ziel\.offsetTop - 8\), behavior: 'smooth' \}\)/.test(sfn), 'springt nicht');
t('"Alle" geht nach ganz oben',
  /if \(!categoryId\) \{[\s\S]{0,200}?scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/.test(sfn), 'kein Weg nach oben');
// Der alte Weg bleibt fuer Suche und fuer den Fall, dass die Kategorien
// nicht geladen werden konnten.
t('ohne Abschnitt wird wie frueher nachgeladen',
  /if \(currentOrderRestaurant\) loadMenuItems\(currentOrderRestaurant\.id, categoryId\);/.test(sfn),
  'kein Rueckfallweg');

console.log('\n-- 7. Die Pillen sind eindeutig zuzuordnen --');
// data-cat-name allein reicht nicht: zwei Betriebe koennen dieselbe
// Kategorie gleich nennen, und uebersetzt heisst sie ohnehin anders.
t('jede Pille traegt ihre Kennung', /data-kat-id="' \+ cat\.id \+ '"/.test(h), 'keine Kennung');
t('auch die "Alle"-Pille', /data-kat-id="_alle"/.test(h), 'fehlt');

console.log('\n-- 8. Der Wettlauf beim Laden ist abgefangen --');
// Kategorien und Gerichte laden parallel. Kommen die Gerichte zuerst,
// kennt renderKarteDurchgehend die Abschnitte noch nicht.
t('nach dem Laden der Kategorien wird nachgezeichnet',
  /if \(window\._menuItemsPreloaded\) \{[\s\S]{0,300}?renderKarteDurchgehend\(_da, categories\);/.test(h),
  'nicht abgefangen');
t('der Grund steht dabei', h.indexOf('WETTLAUF ABFANGEN') > -1, 'keine Begruendung');


console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
