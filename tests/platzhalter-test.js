// PLATZHALTER STATT GRAUER GABEL, UND KLEINE RUECKMELDUNGEN.
//
// WARUM
// -----
// Wo kein Foto hinterlegt war, stand überall dasselbe graue Besteck-Symbol --
// in der Speisekarte, im Warenkorb, bei "Dazu passt". Und Fotos fehlen fast
// immer: aus dem PDF-Import kommen keine mit, und kaum ein Gastronom lädt 142
// Bilder von Hand hoch. Eine Karte ohne Fotos sah dadurch nicht schlicht aus,
// sondern unfertig.
//
// Jetzt: ein ruhiges gezeichnetes Motiv passend zur Kategorie, inline, ohne
// Nachladen. Dazu Platzhalter-Karten während des Ladens und ein kurzes
// Hüpfen des Warenkorb-Zählers.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var quelle = H.slice(H.indexOf('var _MOTIVE = {'), H.indexOf('function renderMenuItemsForGuest('));
var P = new Function(quelle + '; return { bild: gerichtBild, motiv: motivFuer, motive: _MOTIVE };')();

// ---- Zuordnung ---------------------------------------------------------------
[['Pizza Margherita', 'Pizza', 'pizza'],
 ['Cheeseburger', 'Burger', 'burger'],
 ['Döner Teller', 'Türkisch', 'doener'],
 ['Spaghetti Bolognese', 'Nudeln', 'pasta'],
 ['Gemischter Salat', 'Salate', 'salat'],
 ['Tomatensuppe', 'Suppen', 'suppe'],
 ['Matjesfilet', 'Fisch', 'fisch'],
 ['Cola 0,33', 'Getränke', 'getraenk'],
 ['Rote Grütze', 'Dessert', 'dessert'],
 ['Pommes Frites', 'Beilagen', 'pommes']].forEach(function (f) {
    t('"' + f[0] + '" bekommt das Motiv ' + f[2],
      P.motiv({ name: f[0], category: f[1] }) === f[2], P.motiv({ name: f[0], category: f[1] }));
});

// Der Name schlägt durch, auch wenn die Kategorie nichts sagt -- eine
// "Pizza Emden" unter "Spezialitäten" ist trotzdem eine Pizza.
t('der Name entscheidet mit, nicht nur die Kategorie',
  P.motiv({ name: 'Pizza Emden', category: 'Spezialitäten' }) === 'pizza');
t('unbekanntes Gericht bekommt den neutralen Teller',
  P.motiv({ name: 'Tagesgericht', category: 'Sonstiges' }) === 'teller');
t('ohne jede Angabe kippt nichts', P.motiv({}) === 'teller' && P.motiv(null) === 'teller');

// ---- Die Motive müssen sich UNTERSCHEIDEN -----------------------------------
// Der erste Entwurf hatte für Pizza, Burger, Pasta und Salat viermal dieselbe
// Kuppel. Nebeneinander war das nicht auseinanderzuhalten -- und damit
// nutzlos.
var zeichnungen = Object.keys(P.motive).map(function (k) { return P.motive[k]; });
t('kein Motiv ist doppelt', new Set(zeichnungen).size === zeichnungen.length,
  zeichnungen.length - new Set(zeichnungen).size + ' doppelt');
// Jede Kategorie hat ihre eigene Farbe -- aber als KLASSE, nicht im
// style-Attribut. Nur so gibt es zu jedem Ton auch eine dunkle Fassung; feste
// Pastellfarben im Inline-Style haetten nachts geleuchtet.
t('die Zeichnungen selbst tragen keine Farbe (die kommt aus der Klasse)',
  zeichnungen.every(function (z) { return typeof z === 'string' && z.indexOf('#') < 0; }));
t('jede Kategorie bekommt ihre eigene Klasse',
  /class="kmi-ton-' \+ art \+ '"/.test(H));
t('und der Strich kommt aus der Klasse mit',
  /stroke="var\(--kmi-strich\)"/.test(H));

var TOENE = ['pizza','burger','doener','pasta','salat','suppe','fisch','getraenk','dessert','pommes','teller'];
TOENE.forEach(function (k) {
    t('Farbe fuer ' + k + ' ist hell UND dunkel hinterlegt',
      new RegExp('\\.kmi-ton-' + k + ' \\{ background:#').test(H)
      && new RegExp('\\.dark-mode \\.kmi-ton-' + k + ' \\{ background:#').test(H));
});
// Elf verschiedene Toene -- sonst waere die Aufteilung sinnlos.
var hell = (H.match(/\n        \.kmi-ton-[a-z]+ \{ background:(#[0-9a-f]{6});/g) || [])
    .map(function (z) { return z.slice(-8, -1); });
t('elf verschiedene Farbtoene', new Set(hell).size === 11, new Set(hell).size + ' verschiedene von ' + hell.length);
t('es gibt fuer alle wichtigen Kategorien eins', Object.keys(P.motive).length >= 11,
  Object.keys(P.motive).length);

// ---- Echtes Foto schlägt das Motiv ------------------------------------------
var mitBild = P.bild({ name: 'Pizza', image_url: 'https://x/p.jpg' }, 'width:100px;height:100px;');
t('ist ein Foto da, wird das Foto genommen', /<img src="https:\/\/x\/p\.jpg"/.test(mitBild), mitBild.slice(0, 90));
t('das Foto laedt verzoegert', /loading="lazy"/.test(mitBild));
t('und deckt den Rahmen aus', /object-fit:cover/.test(mitBild));

var ohneBild = P.bild({ name: 'Pizza Margherita', category: 'Pizza' }, 'width:100px;height:100px;');
t('ohne Foto kommt das Motiv', /<svg/.test(ohneBild) && !/<img/.test(ohneBild));
t('es ist inline, laedt also nichts nach', ohneBild.indexOf('http') < 0, ohneBild.slice(0, 80));
t('mit dem Gerichtnamen als Beschriftung fuer Vorlesegeraete',
  /aria-label="Pizza Margherita"/.test(ohneBild));
t('das Motiv selbst wird nicht vorgelesen', /aria-hidden="true"/.test(ohneBild));
t('Anfuehrungszeichen im Namen brechen nichts',
  P.bild({ name: 'Pizza "Chef"' }, 'width:10px;').indexOf('&quot;Chef&quot;') > 0);
t('der Rundungsgrad wird durchgereicht',
  P.bild({ name: 'x' }, 'width:56px;', '10px').indexOf('border-radius:10px') > 0);

// ---- Überall eingesetzt ------------------------------------------------------
t('die Speisekarte benutzt es',
  /html \+= gerichtBild\(item, 'width:100%;height:100%;'\);/.test(H));
t('"Dazu passt" benutzt es',
  /var imgHtml = gerichtBild\(item, 'width:56px;height:56px;', '10px'\);/.test(H));
t('der Warenkorb benutzt es',
  /\$\{gerichtBild\(item, 'width:100%;height:100%;'\)\}/.test(H));
// Nur die drei Gast-Stellen prüfen -- im Dashboard darf das Besteck-Symbol
// weiter als Symbol dienen, da steht es nicht für ein fehlendes Foto.
var gastTeile = H.slice(H.indexOf('function renderMenuItemsForGuest('), H.indexOf('function openItemOptions('))
              + H.slice(H.indexOf('function renderCrossSellSheet('), H.indexOf('function quickAddCrossSell('))
              + H.slice(H.indexOf('function renderCartItems('), H.indexOf('function changeCartItemQty('));
t('die graue Gabel ist an allen drei Gast-Stellen weg',
  gastTeile.indexOf('>restaurant</span>') < 0);

// ---- Die Motive sind ZEICHNUNGEN, keine einzelnen Striche -------------------
// Eine Pizza ohne Belag ist ein Dreieck, ein Burger ohne Sesam ein Stapel
// Balken. Erst die Kleinigkeiten machen daraus ein Bild.
t('die Pizza hat Belag', (P.motive.pizza.match(/<circle/g) || []).length === 3);
t('der Burger hat Sesam', (P.motive.burger.match(/<circle/g) || []).length === 3);
t('der Fisch hat ein Auge', P.motive.fisch.indexOf('<circle') >= 0);
t('das Glas hat einen Strohhalm', (P.motive.getraenk.match(/<path/g) || []).length >= 3);
t('jedes Motiv besteht aus mehreren Teilen',
  Object.keys(P.motive).every(function (k) {
      return (P.motive[k].match(/<(path|circle)/g) || []).length >= 2;
  }), Object.keys(P.motive).filter(function (k) {
      return (P.motive[k].match(/<(path|circle)/g) || []).length < 2; }).join(', '));

// ---- Der Grund dreht im dunklen Modus mit -----------------------------------
// Feste Pastelltöne im style-Attribut hätten im Dunkeln geleuchtet -- deshalb
// Klassen mit eigener .dark-mode-Fassung.
t('im style-Attribut steht keine feste Farbe mehr',
  !/aria-label="' \+ name \+ '" class="kmi-ton-' \+ art \+ '" style="' \+ stil[\s\S]{0,120}background:#/.test(H));

// ---- Platzhalter während des Ladens -----------------------------------------
var L = new Function(H.slice(H.indexOf('function ladePlatzhalter('),
                             H.indexOf('// PLATZHALTER STATT GRAUER GABEL') - 80)
    + '; return ladePlatzhalter;')();
t('"Lädt Gerichte..." ist weg', !/loadingDishes \|\| 'Lädt Gerichte/.test(H));
t('stattdessen Platzhalter-Karten', /container\.innerHTML = ladePlatzhalter\(6\);/.test(H));
t('sechs Karten sind sechs Karten', (L(6).match(/kmi-schimmer" style="height:192px/g) || []).length === 6);
t('sie stehen im selben Raster wie die echten', L(6).indexOf('stitch-menu-grid') >= 0);
t('Vorlesegeraete erfahren, dass geladen wird', /aria-busy="true"/.test(L(6)));

// ---- Der Zähler hüpft, aber nur nach oben ----------------------------------
var B = new Function('setTimeout',
    H.slice(H.indexOf('var _letzteKorbzahl = 0;'), H.indexOf('function updateCartBadges()'))
  + '; return { huepf: _korbHuepfen, stand: function(){ return _letzteKorbzahl; } };')(function () {});

function badge() {
    var klassen = [];
    return { classList: { add: function (c) { klassen.push(c); }, remove: function () {} },
             offsetWidth: 1, _k: klassen };
}
var b1 = badge();
B.huepf(b1, 1);
t('beim Hinzufuegen huepft der Zaehler', b1._k.indexOf('kmi-huepft') >= 0, JSON.stringify(b1._k));
var b2 = badge();
B.huepf(b2, 1);
t('bleibt die Zahl gleich, huepft nichts', b2._k.length === 0, JSON.stringify(b2._k));
var b3 = badge();
B.huepf(b3, 0);
// Beim Entfernen zu hüpfen wäre eine Belohnung für den falschen Vorgang.
t('beim Entfernen huepft nichts', b3._k.length === 0, JSON.stringify(b3._k));
var b4 = badge();
B.huepf(b4, 3);
t('nach oben wieder schon', b4._k.indexOf('kmi-huepft') >= 0);
t('ohne Element kippt nichts', (function () { try { B.huepf(null, 9); return true; } catch (e) { return false; } })());

// ---- Wer keine Bewegung will, bekommt keine ----------------------------------
t('"Bewegung reduzieren" schaltet Schimmern und Huepfen ab',
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,220}\.kmi-schimmer \{ animation: none; \}[\s\S]{0,120}\.kmi-huepft \{ animation: none; \}/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
