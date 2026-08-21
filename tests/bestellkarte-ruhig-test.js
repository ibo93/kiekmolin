// Prueft, dass die Speisekarte beim Bestellen nicht mehr springt und
// nicht bei jedem Kategoriewechsel von vorne laedt.
//
// Gemeldet: "das Laden bei der Bestellung ist nicht reibungslos."
// Im Bildschirmvideo zu sehen: beim Umschalten der Kategorie erscheinen
// die Ladeplatzhalter als schmale graue Streifen mitten im Bild -- nicht
// als Karten. Danach springt die Liste wieder auf volle Breite.
//
// Zwei Ursachen, beide hier abgesichert:
//
// 1) BREITE. #menuItemsList sitzt in einem "display:flex;
//    flex-direction:column" Kasten. Dort ist die Breite die Querachse, und
//    ein "margin: 0 auto" auf der Querachse schaltet align-self:stretch ab.
//    Ohne feste Breite ist die Liste nur so breit wie ihr laengster
//    Gerichtname. Im Browser nachgemessen:
//      Kategorie "Kaese"      -> 178px
//      Kategorie "Vorspeisen" -> 402px
//      Ladeplatzhalter (leer) ->  90px   <- die schmalen Streifen
//
// 2) PLATZHALTER BEI JEDEM TIPP. loadMenuItems setzte immer zuerst die
//    grauen Karten und fragte dann das Netz -- auch beim zehnten Wechsel
//    zurueck auf eine Kategorie, die laengst geladen war.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die Liste hat eine feste Breite --');

// Den Regelblock von #menuItemsList herausschneiden. Bewusst der erste
// Treffer mit "max-width: 1400px": es gibt weiter unten noch eine
// Media-Query, die nur das Innenmass aendert.
var von = h.indexOf('#menuItemsList {');
t('#menuItemsList hat einen eigenen Regelblock', von > 0, von);
var bis = h.indexOf('}', von);
var regel = h.slice(von, bis);

t('Regelblock gefunden', bis > von, von + '/' + bis);
t('width: 100% steht drin', /width:\s*100%/.test(regel), JSON.stringify(regel));
t('max-width bleibt bei 1400px', /max-width:\s*1400px/.test(regel), JSON.stringify(regel));
t('margin: 0 auto bleibt (Zentrierung am Desktop)', /margin:\s*0 auto/.test(regel), JSON.stringify(regel));

// Die Reihenfolge im Block ist egal, aber width muss VOR dem schliessenden
// Klammernpaar stehen -- sonst haetten wir es in die naechste Regel
// geschrieben.
t('width steht innerhalb des Blocks, nicht danach',
  regel.indexOf('width: 100%') > regel.indexOf('#menuItemsList'),
  regel.indexOf('width: 100%'));

console.log('\n-- 2. Der Grund steht als Kommentar dabei --');
var davor = h.slice(Math.max(0, von - 1200), von);
t('Kommentar erklaert die Querachse',
  davor.indexOf('Querachse') > -1, JSON.stringify(davor.slice(-200)));
t('Kommentar nennt align-self: stretch',
  davor.indexOf('align-self: stretch') > -1, JSON.stringify(davor.slice(-200)));

console.log('\n-- 3. Platzhalter nur beim ersten Mal --');

var lvon = h.indexOf('async function loadMenuItems(restaurantId, categoryId)');
t('loadMenuItems gefunden', lvon > 0, lvon);
var lbis = h.indexOf('\n// ==================== MENÜ-SUCHE', lvon);
t('Ende von loadMenuItems gefunden', lbis > lvon, lvon + '/' + lbis);
var fn = h.slice(lvon, lbis);

t('es gibt einen Cache-Schluessel aus Betrieb und Kategorie',
  /restaurantId \+ '\|' \+ \(categoryId \|\| ''\)/.test(fn), JSON.stringify(fn.slice(0, 200)));
t('ladePlatzhalter steht im else-Zweig, nicht unbedingt',
  /\} else \{[\s\S]{0,900}?container\.innerHTML = ladePlatzhalter\(6\);/.test(fn),
  'ladePlatzhalter haengt nicht am else');
t('bei bekannter Kategorie wird sofort gezeichnet',
  /if \(bekannt\) \{\s*\n\s*renderMenuItemsForGuest\(bekannt\);/.test(fn),
  JSON.stringify(fn.slice(fn.indexOf('if (bekannt)'), fn.indexOf('if (bekannt)') + 120)));

// Der entscheidende Punkt: ladePlatzhalter darf NICHT mehr die erste
// Anweisung nach dem Container sein.
var pIdx = fn.indexOf('container.innerHTML = ladePlatzhalter(6);');
var bIdx = fn.indexOf('var bekannt = _menuKarteCache[');
t('der Cache wird VOR den Platzhaltern befragt', bIdx > 0 && bIdx < pIdx, bIdx + '/' + pIdx);
t('ladePlatzhalter kommt nur einmal vor',
  fn.split('ladePlatzhalter(6)').length - 1 === 1,
  fn.split('ladePlatzhalter(6)').length - 1);

console.log('\n-- 4. Nur neu zeichnen, wenn sich etwas geaendert hat --');
t('es wird verglichen statt blind gezeichnet',
  /JSON\.stringify\(bekannt\) !== neuRoh/.test(fn), 'kein Vergleich');
// Seit dem Umbau auf Durchscroll steht im Vergleich eine Weiche: ohne
// Kategorie-Filter die durchgehende Karte, mit Filter die flache Liste.
// Wichtig bleibt, dass BEIDES am Vergleich haengt -- sonst zeichnet die
// App wieder bei jedem Tipp neu.
t('das Zeichnen haengt am Vergleich',
  /if \(!bekannt \|\| JSON\.stringify\(bekannt\) !== neuRoh\) \{/.test(fn),
  'Vergleich fehlt');
t('ohne Filter wird die durchgehende Karte gezeichnet',
  /if \(!categoryId && window\._menuCategories && window\._menuCategories\.length\) \{\s*\n\s*renderKarteDurchgehend\(items, window\._menuCategories\);/.test(fn),
  'keine Weiche');
t('mit Filter weiterhin die flache Liste',
  /\} else \{\s*\n\s*renderMenuItemsForGuest\(items\);/.test(fn), 'kein Rueckfallweg');
// Und die Weiche muss INNERHALB des Vergleichs stehen.
var _iV = fn.indexOf('JSON.stringify(bekannt) !== neuRoh');
var _iW = fn.indexOf('renderKarteDurchgehend(items');
t('die Weiche steht innerhalb des Vergleichs', _iV > 0 && _iW > _iV, _iV + '/' + _iW);
t('das Ergebnis wird in den Cache gelegt',
  /_menuKarteCache\[schluessel\] = items;/.test(fn), 'kein Schreiben');

console.log('\n-- 5. Leeres Ergebnis loescht keine bekannte Karte --');
// Wenn schon Gerichte da waren und die Abfrage nichts zurueckgibt, ist das
// fast immer die Verbindung. Dann darf NICHT "Keine Gerichte verfügbar"
// ueber die vorhandene Karte geschrieben werden.
t('"Keine Gerichte" nur wenn vorher nichts bekannt war',
  /\} else if \(!bekannt\) \{[\s\S]{0,300}?noDishes/.test(fn),
  'noDishes haengt nicht an !bekannt');
t('bei bekannter Karte wird nur der Cache-Eintrag verworfen',
  /delete _menuKarteCache\[schluessel\];/.test(fn), 'kein delete');

console.log('\n-- 6. Der Vorrat wird beim Betriebswechsel geleert --');
t('menuKarteCacheLeeren existiert',
  /function menuKarteCacheLeeren\(\) \{ _menuKarteCache = \{\}; \}/.test(h), 'fehlt');
t('_menuKarteCache ist als Variable angelegt',
  /var _menuKarteCache = \{\};/.test(h), 'fehlt');
t('beim Oeffnen eines anderen Betriebs wird geleert',
  /window\._menuCacheRid !== restaurantId\) \{\s*\n\s*menuKarteCacheLeeren\(\);/.test(h), 'kein Aufruf');
t('derselbe Betrieb leert NICHT (sonst waere der Cache sinnlos)',
  /if \(window\._menuCacheRid !== restaurantId\)/.test(h), 'ungeprueft geleert');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
