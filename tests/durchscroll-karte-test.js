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
t('mit Kopfband und Ueberschrift', /class="kmi-kat-kopf"/.test(h), 'kein Kopfband');
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

console.log('\n-- 4. Die Kategorie-Hinweise --');
var von = h.indexOf('function kategorieHinweis(items)');
var bis = h.indexOf('function kategorieHinweisHtml');
t('kategorieHinweis gibt es', von > 0 && bis > von, von + '/' + bis);

var welt = { console: console, Object: Object, String: String, Array: Array, window: {} };
welt.window = welt;
vm.createContext(welt);
// zutatenZumWeglassen mitschneiden, der Hinweis baut darauf auf.
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
    + schneide('zutatenZumWeglassen') + '\n' + schneide('kategorieHinweis'), welt);

function g(name, beschr) { return { name: name, description: beschr }; }
var salate = [
    g('Bauernsalat', 'Tomaten, Gurken, Zwiebeln, Feta'),
    g('Hirtensalat', 'Tomaten, Gurken, Zwiebeln, Oliven'),
    g('Gemischter Salat', 'Tomaten, Gurken, Zwiebeln, Mais'),
    g('Griechischer Salat', 'Tomaten, Gurken, Zwiebeln, Feta')
];
var hin = welt.kategorieHinweis(salate);
t('was in ALLEN Gerichten steckt, wird erkannt',
  hin && hin.alle.indexOf('Zwiebeln') > -1 && hin.alle.indexOf('Tomaten') > -1, hin);

var gemischt = salate.slice(0, 3).concat([g('Nudelsalat', 'Nudeln, Mais, Erbsen')]);
var hin2 = welt.kategorieHinweis(gemischt);
t('was in FAST allen steckt, kommt in die zweite Zeile',
  hin2 && hin2.fast.length > 0 && hin2.alle.indexOf('Zwiebeln') === -1, hin2);

// Ab 4 Gerichten -- bei zweien ist "Alle Gerichte mit" nichts wert.
t('unter vier Gerichten kein Hinweis', welt.kategorieHinweis(salate.slice(0, 3)) === null,
  welt.kategorieHinweis(salate.slice(0, 3)));
t('ohne erkennbare Zutaten kein Hinweis',
  welt.kategorieHinweis([g('Cola',''), g('Fanta',''), g('Wasser',''), g('Bier','')]) === null, 'Hinweis trotzdem');
// Hoechstens drei, sonst wird aus dem Hinweis eine zweite Speisekarte.
var viele = [1,2,3,4].map(function (i) { return g('Teller ' + i, 'Tomaten, Gurken, Zwiebeln, Mais, Feta, Oliven'); });
t('hoechstens drei Zutaten je Zeile', welt.kategorieHinweis(viele).alle.length <= 3,
  welt.kategorieHinweis(viele).alle);

console.log('\n-- 5. Die Leiste laeuft mit --');
t('es gibt einen Beobachter', /function kategorieLeisteMitlaufen\(\)/.test(h), 'fehlt');
// Ein scroll-Handler feuert bei jedem Pixel -- das haette uns das
// Ruckeln zurueckgebracht, das wir gerade erst losgeworden sind.
t('ueber IntersectionObserver, nicht ueber scroll',
  /new IntersectionObserver\(/.test(h)
  && /addEventListener\('scroll'[^)]*kategorieLeiste/.test(h) === false, 'scroll-Handler');
t('der alte Beobachter wird vorher abgeraeumt',
  /if \(_katBeobachter\) \{ _katBeobachter\.disconnect\(\); _katBeobachter = null; \}/.test(h),
  'sammelt sich an');
t('der Streifen liegt unter der klebenden Leiste',
  /rootMargin: '-150px 0px -70% 0px'/.test(h), 'anderer Streifen');
t('die aktive Pille wird in den Blick geholt',
  /leiste\.scrollTo\(\{ left: Math\.max\(0, soll\), behavior: 'smooth' \}\)/.test(h), 'fehlt');
// scrollIntoView wuerde auch die Seite verschieben und dem Gast den
// Scroll unter den Fingern wegziehen.
t('dabei bewegt sich nur die Leiste, nicht die Seite',
  /treffer\.scrollIntoView\(/.test(h) === false, 'verschiebt die Seite');

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


console.log('\n-- 9. Der Kategoriename steht im Kopf nur EINMAL --');
// Erst hiess die Zeile "Alle Pizzen mit: Tomatensauce, Käse". Darueber
// steht aber schon die Ueberschrift PIZZA und darueber die markierte
// Pille "Pizza" -- dreimal dasselbe Wort auf einer Handbreite.
// Gemeldet als "warum schreibst du noch mal vorspeise... kategorie nur
// einmal". Geblieben ist die Ueberschrift, weil sie die Abschnitte
// trennt und auch dann dasteht, wenn es gar keinen Hinweis gibt.
var kopf = h.slice(h.indexOf('function kategorieHinweisHtml'),
                   h.indexOf('// DIE GANZE KARTE, NACH KATEGORIEN GEGLIEDERT.'));
t('der Hinweis sagt nur noch "Alle mit:"',
  /<strong>Alle mit:<\/strong>/.test(kopf), kopf);
t('und nicht mehr "Alle <Kategorie> mit:"',
  /'<strong>Alle ' \+/.test(kopf) === false, kopf);
t('"Fast alle mit:" bleibt wie es war',
  /<strong>Fast alle mit:<\/strong>/.test(kopf), kopf);
t('die Ueberschrift bleibt',
  /escapeHtml\(translateCategory\(r\.name, currentLanguage\)\) \+ '<\/h2>'/.test(h),
  'keine Ueberschrift mehr');

// Die Mehrzahl-Liste faellt damit weg. Sie war nur noetig, weil sich
// deutsche Mehrzahl nicht raten laesst ("Alle Käse mit", "Alle Für
// unsere kleinen Gäste mit"). Ohne das Wort gibt es das Problem nicht
// mehr -- und toter Code, den spaeter jemand halb wiederbelebt, auch
// nicht.
t('KAT_MEHRZAHL ist entfernt', h.indexOf('var KAT_MEHRZAHL') < 0, 'liegt noch da');
t('katMehrzahl ist entfernt', h.indexOf('function katMehrzahl') < 0, 'liegt noch da');
t('und haengt auch nicht mehr am window', h.indexOf('window.katMehrzahl') < 0, 'haengt noch');
t('der Grund steht im Quelltext',
  h.indexOf('DER KATEGORIENAME STEHT IM KOPF NUR EINMAL') > -1, 'keine Begruendung');
// Der Parameter ist mitgegangen -- ein Argument, das niemand liest,
// laedt dazu ein, es spaeter wieder zu benutzen.
t('kategorieHinweisHtml nimmt nur noch die Gerichte',
  /function kategorieHinweisHtml\(items\) \{/.test(h), 'noch ein zweites Argument');
t('und wird auch so gerufen',
  /kategorieHinweisHtml\(r\.items\)/.test(h), 'anders gerufen');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
