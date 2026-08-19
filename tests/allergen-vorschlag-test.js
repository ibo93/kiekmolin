// Prueft die Allergen-Vorschlaege.
//
// DAS PROBLEM
// 554 Gerichte in der Datenbank, 16 mit Allergenangabe -- 2,9 Prozent.
// Die Auswahl zum Anhaken gibt es laengst, nur klickt sie niemand durch:
// 538 Gerichte mal 14 Haken ist Tagesarbeit. Nach EU-Verordnung
// 1169/2011 ist die Angabe aber Pflicht, ein leeres Feld also kein
// "noch nicht ausgefuellt", sondern ein Verstoss.
//
// WORAUF ES HIER ANKOMMT
// Ein Vorschlag, der oft danebenliegt, ist schlechter als keiner: der
// Wirt haekelt zwei Gerichte durch, sieht dass Unsinn dabei ist, und
// macht den Kasten nie wieder auf. Die Fehlalarm-Pruefung unten ist
// deshalb der wichtigere Teil dieser Datei -- nicht die Treffer.
//
// Und: gespeichert wird NIE von selbst. Fuer eine falsche Angabe haftet
// der Wirt, und bei einer Nussallergie geht es nicht um ein Bussgeld.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var vm = require('vm');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var von = h.indexOf('var ALLERGEN_WOERTER = [');
var bis = h.indexOf('function getAllergenLabel(code) {');
t('der Vorschlagsmotor steht in index.html', von > 0 && bis > von, von + '/' + bis);

var welt = { console: console, String: String, Array: Array, JSON: JSON };
welt.window = welt;
vm.createContext(welt);
vm.runInContext(h.slice(von, bis), welt);
var V = function (name, beschr) { return welt.allergenVorschlagCodes(name, beschr); };

console.log('\n-- 1. Treffer bei echten Gerichtnamen --');
[
    ['Hirtenkäse nach griechischer Art', '', ['milch']],
    ['Pizza Margherita', 'Tomaten, Mozzarella', ['gluten', 'milch']],
    ['Wiener Schnitzel', 'paniert, mit Pommes', ['gluten', 'eier']],
    ['Nordseekrabben-Cocktail', '', ['krebstiere']],
    ['Matjes Hausfrauenart', 'mit Apfel', ['fisch']],
    ['Muscheln rheinische Art', '', ['weichtiere']],
    ['Currywurst mit Pommes', '', ['senf']],
    ['Falafel im Fladenbrot', '', ['sesam', 'gluten']],
    ['Pasta mit Pesto', '', ['gluten', 'schalenfruechte']],
    ['Tiramisu', '', ['milch', 'eier']]
].forEach(function (f) {
    var r = V(f[0], f[1]);
    var fehlend = f[2].filter(function (c) { return r.indexOf(c) === -1; });
    t('"' + f[0] + '" -> ' + f[2].join('+'), fehlend.length === 0, { erwartet: f[2], bekommen: r });
});

console.log('\n-- 2. Fehlalarme -- der wichtigere Teil --');
// Diese Woerter ENTHALTEN Allergen-Woerter als Buchstabenfolge, sind aber
// keine. "Zwiebel" enthaelt "ei", "Fleisch" auch. Ohne Wortgrenze haette
// fast jedes Gericht "enthaelt Eier" bekommen -- und damit waere die
// ganze Liste wertlos.
[
    ['Zwiebelrostbraten', 'mit Bratkartoffeln', 'eier'],
    ['Fleischsalat', '', 'eier'],
    ['Reibekuchen', 'mit Apfelmus', 'eier'],
    ['Rinderfilet', 'mit Rosmarin', 'eier'],
    ['Weinbergpfirsich', '', 'sulfite'],
    ['Eisbein', '', 'milch'],
    ['Salzkartoffeln', '', 'sulfite'],
    ['Pommes Frites', '', 'gluten'],
    ['Cola', '', 'gluten']
].forEach(function (f) {
    var r = V(f[0], f[1]);
    t('"' + f[0] + '" bekommt KEIN ' + f[2], r.indexOf(f[2]) === -1, r);
});

// Die Wortgrenze direkt geprueft, nicht nur ueber Beispiele.
t('"ei" findet sich nicht in "Zwiebel"', V('Zwiebel', '').indexOf('eier') === -1, V('Zwiebel', ''));
t('"ei" findet sich aber als eigenes Wort', V('Spiegelei', '').indexOf('eier') > -1 || V('mit Ei', '').indexOf('eier') > -1, V('mit Ei', ''));
// Deutsch schreibt zusammen -- "Haselnusseis" IST ein Nussgericht.
t('"Haselnusseis" findet die Nuss', V('Haselnusseis', '').indexOf('schalenfruechte') > -1, V('Haselnusseis', ''));
// Aber Muskatnuss ist ein Gewuerz, keine Schalenfrucht. Deshalb sind die
// einzelnen Nussarten mit Stern, das nackte "nuss" aber nicht.
t('"Muskatnuss" ist keine Schalenfrucht',
  V('Muskatnuss', '').indexOf('schalenfruechte') === -1, V('Muskatnuss', ''));

console.log('\n-- 2b. Deutsch schreibt zusammen --');
[
    ['Fladenbrot', 'gluten'], ['Knoblauchbrot', 'gluten'], ['Vollkornbrötchen', 'gluten'],
    ['Überbackenes Baguette', 'milch'], ['Eiernudeln', 'gluten'],
    ['Räucherlachsfilet', 'fisch'], ['Miesmuscheltopf', 'weichtiere'],
    ['Nordseekrabbencocktail', 'krebstiere'], ['Sesambrötchen', 'sesam'],
    ['Erdnussbutter', 'erdnuss'], ['Frischkäseaufstrich', 'milch'],
    ['Bandnudelauflauf', 'gluten'], ['Blätterteigtasche', 'gluten'],
    ['Weinbergschnecken', 'weichtiere'], ['Bratwurstpfanne', 'senf']
].forEach(function (f) {
    t('"' + f[0] + '" -> ' + f[1], V(f[0], '').indexOf(f[1]) > -1, V(f[0], ''));
});

console.log('\n-- 2c. Die Falle, die das Zusammenschreiben aufmacht --');
// Wer Teilwoerter zulaesst, muss genau hier aufpassen. Jeder einzelne
// dieser Faelle wuerde die Liste unglaubwuerdig machen.
[
    ['Schweinebraten', 'sulfite', 'wein steckt in Schwein'],
    ['Schweineschnitzel', 'sulfite', 'wein steckt in Schwein'],
    ['Bunter Salat', 'gluten', 'bun steckt in bunt'],
    ['Salatteller', 'milch', 'latte steckt in Salatteller'],
    ['Kalte Platte', 'milch', 'latte steckt in Platte'],
    ['Gemischte Salate', 'erdnuss', 'sate steckt in Salate'],
    ['Eisbein', 'milch', 'eis steckt in Eisbein'],
    ['Reis mit Gemüse', 'milch', 'eis steckt in Reis'],
    ['Preiselbeeren', 'milch', 'eis steckt in Preiselbeere'],
    ['Im Saal serviert', 'fisch', 'aal steckt in Saal'],
    ['Muskatnuss', 'schalenfruechte', 'nuss steckt in Muskatnuss'],
    ['Zwiebelsuppe', 'eier', 'ei steckt in Zwiebel']
].forEach(function (f) {
    t('"' + f[0] + '" bekommt KEIN ' + f[1] + ' (' + f[2] + ')',
      V(f[0], '').indexOf(f[1]) === -1, V(f[0], ''));
});

console.log('\n-- 3. Schreibweisen --');
t('Grossbuchstaben stoeren nicht', V('PIZZA', '').indexOf('gluten') > -1, V('PIZZA', ''));
t('Bindestriche trennen Woerter', V('Käse-Sahne-Torte', '').indexOf('milch') > -1, V('Käse-Sahne-Torte', ''));
t('Klammern trennen auch', V('Salat (mit Ei)', '').indexOf('eier') > -1, V('Salat (mit Ei)', ''));
t('Umlaut und ue-Schreibung beide erkannt',
  V('Überbackenes Brot', '').indexOf('milch') > -1 && V('Ueberbackenes Brot', '').indexOf('milch') > -1,
  [V('Überbackenes Brot', ''), V('Ueberbackenes Brot', '')]);
t('die Beschreibung zaehlt mit', V('Tagesgericht', 'mit Garnelen').indexOf('krebstiere') > -1, V('Tagesgericht', 'mit Garnelen'));

console.log('\n-- 4. Randfaelle werfen nicht --');
[['leer', '', ''], ['nur Leerzeichen', '   ', ''], ['null', null, null], ['undefined', undefined, undefined],
 ['Zahlen', '12345', ''], ['Sonderzeichen', '!!! ??? ...', '']
].forEach(function (f) {
    var r;
    try { r = V(f[1], f[2]); } catch (e) { r = 'WURF: ' + e.message; }
    t(f[0] + ' gibt eine leere Liste', Array.isArray(r) && r.length === 0, r);
});

console.log('\n-- 5. Jeder Vorschlag nennt seinen Grund --');
var mit = welt.allergenVorschlag('Pizza Margherita', 'Mozzarella');
t('es kommen Objekte mit code und wegen',
  mit.length === 2 && mit.every(function (v) { return v.code && v.wegen; }), mit);
t('der Grund ist das Wort, das im Text steht',
  mit.some(function (v) { return v.code === 'milch' && v.wegen === 'mozzarella'; }), mit);
// Ohne Grund koennte der Wirt den Vorschlag nicht pruefen -- er muesste
// raten, was die App sich gedacht hat.
t('kein Vorschlag ohne Grund',
  mit.every(function (v) { return typeof v.wegen === 'string' && v.wegen.length > 1; }), mit);
// Der Stern ist Technik. Dem Wirt zeigen wir das Wort, nicht die Regel.
t('im Grund steht kein Stern',
  welt.allergenVorschlag('Fladenbrot', '').every(function (v) { return v.wegen.indexOf('*') === -1; }),
  welt.allergenVorschlag('Fladenbrot', ''));

console.log('\n-- 6. Ein Allergen nur einmal --');
// "Pizza mit Nudeln und Brot" darf nicht dreimal Gluten vorschlagen.
var mehr = welt.allergenVorschlag('Pizza mit Nudeln und Brot', 'Teig aus Mehl');
var codes = mehr.map(function (v) { return v.code; });
t('Gluten steht genau einmal drin',
  codes.filter(function (c) { return c === 'gluten'; }).length === 1, codes);

console.log('\n-- 7. Die Wortliste ist sauber gepflegt --');
var gueltig = {};
(h.match(/\{ code: '([a-z]+)', label:/g) || []).forEach(function (m) {
    gueltig[m.match(/'([a-z]+)'/)[1]] = true;
});
t('die LMIV-Liste hat 14 Allergene', Object.keys(gueltig).length === 14, Object.keys(gueltig).length);
welt.ALLERGEN_WOERTER.forEach(function (paar) {
    t('"' + paar[0] + '" ist ein echter LMIV-Code', gueltig[paar[0]] === true, paar[0]);
});
var alleWoerter = [];
welt.ALLERGEN_WOERTER.forEach(function (paar) { alleWoerter = alleWoerter.concat(paar[1]); });
t('alle Suchwoerter sind kleingeschrieben',
  alleWoerter.every(function (w) { return w === w.toLowerCase(); }),
  alleWoerter.filter(function (w) { return w !== w.toLowerCase(); }));
// Ein Wort mit einem Zeichen wuerde in jedem zweiten Gericht stecken.
t('kein Suchwort ist kuerzer als zwei Zeichen',
  alleWoerter.every(function (w) { return w.replace(/^\*/, '').length >= 2; }),
  alleWoerter.filter(function (w) { return w.replace(/^\*/, '').length < 2; }));
// Ein Stern-Wort zaehlt auch mitten im Wort. Kurze Stern-Woerter waeren
// deshalb gefaehrlich -- "*ei" wuerde jedes Fleisch treffen.
t('kein Stern-Wort ist kuerzer als vier Zeichen',
  alleWoerter.filter(function (w) { return w.charAt(0) === '*' && w.length < 5; }).length === 0,
  alleWoerter.filter(function (w) { return w.charAt(0) === '*' && w.length < 5; }));
t('der Stern steht nur ganz vorn',
  alleWoerter.every(function (w) { return w.slice(1).indexOf('*') === -1; }),
  alleWoerter.filter(function (w) { return w.slice(1).indexOf('*') > -1; }));

console.log('\n-- 8. Nichts speichert sich von selbst --');
// Der entscheidende Punkt fuer die Haftung. Der Vorschlagsmotor darf
// nirgends direkt eine Aenderung schreiben.
// NUR den Motor ausschneiden, nicht die Sammelansicht darunter -- die
// speichert ja gerade (auf Knopfdruck) und wuerde den Test unbrauchbar
// machen.
var motor = h.slice(von, h.indexOf('// ==================== ALLERGEN-LUECKEN SAMMELWEISE'));
t('der Ausschnitt endet vor der Sammelansicht',
  motor.length > 500 && motor.indexOf('allergenLueckenSpeichern') === -1, motor.length);
t('der Vorschlagsmotor schreibt nichts',
  /sbWrite|method: 'PATCH'|fetch\(/.test(motor) === false, 'er schreibt');
t('die Sammelansicht speichert erst auf Klick',
  /onclick="allergenLueckenSpeichern\(\)"/.test(h), 'kein Knopf');
t('gespeichert wird, was angehakt ist -- nicht was vorgeschlagen war',
  /aria-pressed'\) === 'true'\) codes\.push\(a\.code\)/.test(h), 'liest den Vorschlag statt die Haken');
t('Gerichte ohne Haken bleiben unangetastet',
  /if \(codes\.length\) zuSpeichern\.push/.test(h), 'speichert auch Leeres');
t('der Hinweis auf die eigene Verantwortung steht in der Oberflaeche',
  h.indexOf('die Angabe verantwortest du') > -1, 'fehlt');

console.log('\n-- 9. Fehlgeschlagenes wird nicht verschwiegen --');
// Wer glaubt, alles sei gespeichert, prueft es nicht nach. Bei einer
// Pflichtangabe ist das der teuerste Irrtum.
t('misslungene Speicherungen werden gezaehlt', /schiefgegangen\+\+/.test(h), 'kein Zaehler');
t('und dem Wirt gemeldet',
  /schiefgegangen \+ ' nicht/.test(h), 'keine Meldung');
t('bei Fehlern bleibt der Kasten offen',
  /if \(schiefgegangen\) \{[\s\S]{0,200}?showToast[\s\S]{0,120}?\} else \{[\s\S]{0,200}?closeGenericModal\(\)/.test(h),
  'schliesst auch bei Fehlern');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
