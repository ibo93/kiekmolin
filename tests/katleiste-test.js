// DIE KATEGORIELEISTE AM RECHNER.
//
// GEMELDET WURDE
// --------------
// "wenn ich vollbild habe kann ich die oberen leisten nicht nutzen Pizza,
//  Pasta das meine ich" -- mit Bildschirmfoto vom Vollbild-Browser.
//
// DIE URSACHE
// -----------
// .menu-categories war display:flex mit overflow-x:auto UND einer
// ausgeblendeten Scrollleiste (scrollbar-width:none plus
// ::-webkit-scrollbar{display:none}). Am Handy ist das genau richtig: man
// wischt. Am Rechner gibt es weder Wischen noch eine Leiste zum Ziehen --
// die hinteren Kategorien sind schlicht nicht erreichbar. Kein Fehlerbild,
// keine Meldung, sie sind einfach weg.
//
// IM BROWSER NACHGEMESSEN (Chromium, 1440x900, die 14 Kategorien von
// Al Porto):
//   vorher:  289px liegen ausserhalb, 11 von 14 Knoepfen erreichbar,
//            unerreichbar waren "Pasta", "Desserts", "Getränke"
//   nachher: 0px ausserhalb, 14 von 14 erreichbar, zwei Zeilen
//
// ZWEI DINGE DAGEGEN
// ------------------
// 1. Ab 820px brechen die Knoepfe um. Dann gibt es nichts mehr zu scrollen.
// 2. Bleibt es schmal, macht das Mausrad seitlich mit, und rechts zeigt eine
//    weiche Kante, dass noch etwas kommt.
//
// DIE FALLE DABEI
// ---------------
// Im Markup stand overflow-x:auto als INLINE-Stil. Ein Inline-Stil schlaegt
// jede Media-Query -- die Regel fuer 820px waere wirkungslos geblieben und
// alles haette trotzdem gruen ausgesehen. Genau dieselbe Sorte stiller
// Fehlschlag wie offsetParent bei position:fixed.
'use strict';
var fs = require('fs');
var H = fs.readFileSync('/home/user/kiekmolin/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// ---- 1. Der Inline-Stil, der alles ausgehebelt haette ----------------------
var markup = H.match(/<div class="menu-categories" id="menuCategoryTabs"[^>]*>/)[0];
t('overflow-x steht NICHT mehr inline (schluege sonst die Media-Query)',
  markup.indexOf('overflow-x') < 0, markup);
t('die Leiste hat weiterhin ihre Klasse', /class="menu-categories"/.test(markup));
t('overflow-x kommt jetzt aus der Klasse',
  /\.menu-categories \{[^}]*overflow-x: auto;/.test(H));

// ---- 2. Umbrechen ab Tabletbreite ------------------------------------------
var mq = H.slice(H.indexOf('@media (min-width: 820px) {'),
                 H.indexOf('@media (min-width: 820px) {') + 260);
t('es gibt eine Regel ab 820px', H.indexOf('@media (min-width: 820px) {') > 0);
t('darin brechen die Knoepfe um', /\.menu-categories \{[\s\S]{0,120}flex-wrap: wrap;/.test(mq), mq);
t('und es wird nicht mehr seitlich gescrollt', /overflow-x: visible;/.test(mq), mq);
t('zwischen den Zeilen ist Luft', /row-gap: 8px;/.test(mq), mq);

// ---- 3. Der Hinweis, dass rechts mehr kommt --------------------------------
t('die weiche Kante haengt an einer eigenen Klasse',
  /\.menu-categories\.kmi-mehr-rechts \{/.test(H));
t('sie blendet die letzten 44px aus',
  /mask-image: linear-gradient\(to right, #000 calc\(100% - 44px\), transparent 100%\)/.test(H));
t('auch mit -webkit- fuer Safari', /-webkit-mask-image: linear-gradient\(to right/.test(H));

// ---- 4. Das Mausrad -- die Logik wirklich laufen lassen ---------------------
// Nachgebaut wird nur der Browser, nicht die Funktion: die kommt aus der Datei.
function welt(scrollWidth, clientWidth) {
    var leiste = {
        id: 'menuCategoryTabs',
        scrollWidth: scrollWidth, clientWidth: clientWidth, scrollLeft: 0,
        _hoerer: {}, _klassen: {},
        addEventListener: function (art, fn) { (this._hoerer[art] = this._hoerer[art] || []).push(fn); },
        classList: {
            toggle: function (k, an) { leiste._klassen[k] = !!an; },
            contains: function (k) { return !!leiste._klassen[k]; }
        }
    };
    var fensterHoerer = [];
    var F = new Function('document', 'window',
        schneide('katLeisteBedienbar') + '\n' + schneide('katKanteAuffrischen')
        + '; return { arm: katLeisteBedienbar, kante: katKanteAuffrischen };')(
        { getElementById: function (id) { return id === 'menuCategoryTabs' ? leiste : null; } },
        { addEventListener: function (art, fn) { fensterHoerer.push([art, fn]); } });
    return { leiste: leiste, F: F, fenster: fensterHoerer };
}
function rad(w, dy, dx) {
    var verhindert = false;
    w.leiste._hoerer.wheel.forEach(function (fn) {
        fn({ deltaY: dy, deltaX: dx === undefined ? 0 : dx, preventDefault: function () { verhindert = true; } });
    });
    return verhindert;
}

// Schmal: 1700px Inhalt in 390px Fenster
var schmal = welt(1700, 390);
schmal.F.arm();
t('am schmalen Fenster haengt ein Mausrad-Hoerer dran', !!schmal.leiste._hoerer.wheel);
t('das Rad schiebt die Leiste seitlich', rad(schmal, 220) === true && schmal.leiste.scrollLeft === 220,
  schmal.leiste.scrollLeft);
t('und nimmt der Seite das Scrollen ab (preventDefault)', rad(schmal, 100) === true);
t('rueckwaerts geht auch', (rad(schmal, -120), schmal.leiste.scrollLeft === 200), schmal.leiste.scrollLeft);

// Trackpad quer wischen: da soll die Leiste nichts erzwingen, der Browser
// scrollt sowieso schon selbst seitlich.
var vorher = schmal.leiste.scrollLeft;
t('quer wischen am Trackpad wird in Ruhe gelassen',
  rad(schmal, 5, 80) === false && schmal.leiste.scrollLeft === vorher, schmal.leiste.scrollLeft);

// Breit: alles passt -> das Rad muss weiter die SEITE scrollen. Das ist der
// Punkt, an dem so ein Handler sonst die ganze Seite lahmlegt.
var breit = welt(1200, 1200);
breit.F.arm();
t('wenn nichts ueberlaeuft, laesst das Rad die Seite in Ruhe scrollen',
  rad(breit, 220) === false && breit.leiste.scrollLeft === 0, breit.leiste.scrollLeft);

// ---- 5. Die Kante stimmt mit der Wirklichkeit ueberein ----------------------
var k = welt(1700, 390);
k.F.arm();
t('ganz links: rechts kommt noch was', k.leiste.classList.contains('kmi-mehr-rechts') === true);
k.leiste.scrollLeft = 1700 - 390;
k.F.kante(k.leiste);
t('ganz rechts: der Hinweis verschwindet', k.leiste.classList.contains('kmi-mehr-rechts') === false);
k.leiste.scrollLeft = 300;
k.F.kante(k.leiste);
t('mittendrin: er kommt wieder', k.leiste.classList.contains('kmi-mehr-rechts') === true);
var passt = welt(390, 390);
passt.F.arm();
t('passt alles rein, gibt es keinen Hinweis', passt.leiste.classList.contains('kmi-mehr-rechts') === false);

// ---- 6. Nichts doppelt, nichts kaputt ---------------------------------------
var d = welt(1700, 390);
d.F.arm(); d.F.arm(); d.F.arm();
t('dreimal aufgerufen haengt trotzdem nur EIN Mausrad-Hoerer dran',
  d.leiste._hoerer.wheel.length === 1, d.leiste._hoerer.wheel.length);
t('und nur ein Scroll-Hoerer', d.leiste._hoerer.scroll.length === 1, d.leiste._hoerer.scroll.length);
t('auf die Fensterbreite wird genau einmal gehorcht',
  d.fenster.filter(function (x) { return x[0] === 'resize'; }).length === 1, d.fenster.length);
t('der Hoerer laesst das Rad passiv NICHT durchrutschen (sonst kein preventDefault)',
  /\{ passive: false \}/.test(schneide('katLeisteBedienbar')));

var leer = new Function('document', 'window',
    schneide('katLeisteBedienbar') + '\n' + schneide('katKanteAuffrischen')
    + '; katLeisteBedienbar(); katKanteAuffrischen(); return true;');
t('ohne Leiste auf der Seite kippt nichts',
  leer({ getElementById: function () { return null; } }, { addEventListener: function () {} }) === true);

// ---- 7. WIRD ES AUCH AUFGERUFEN? --------------------------------------------
// Der haeufigste stille Fehlschlag in dieser Datei: eine Funktion, die es
// gibt, die aber niemand ruft. Jede Stelle, die die Leiste neu befuellt,
// muss danach neu messen -- die Breite hat sich geaendert.
t('der echte Weg (Kategorien aus der Datenbank) ruft sie auf',
  /container\.innerHTML = html;[\s\S]{0,260}katLeisteBedienbar\(\);/.test(H));
t('der Demo-Weg ruft sie auch auf',
  /function loadMenuCategories\(restaurantId\)[\s\S]{0,1200}katLeisteBedienbar\(\);/.test(H));
t('nach dem Beenden der Suche wird neu gemessen',
  /function clearMenuSearch\(\)[\s\S]{0,400}katLeisteBedienbar\(\);/.test(H));
t('und auch, wenn das Suchfeld leergeraeumt wird',
  /catTabs\.style\.display = query\.length > 0 \? 'none' : '';[\s\S]{0,200}katLeisteBedienbar\(\);/.test(H));

// Die Sprachleiste klappt ueber der Kategorieleiste auf und schiebt sie nach
// unten -- danach stimmt der Kantenhinweis sonst nicht mehr.
t('nach dem Sprachumschalter wird ebenfalls neu gemessen',
  /function toggleMenuSprache\(\)[\s\S]{0,1400}katLeisteBedienbar\(\);/.test(H));

// Zaehlen statt hoffen: es gibt genau fuenf Aufrufstellen plus die Definition.
var aufrufe = (H.match(/katLeisteBedienbar\(\);/g) || []).length;
t('es sind fuenf Aufrufstellen -- keine Stelle vergessen, keine doppelt',
  aufrufe === 5, aufrufe + ' Aufrufe');

// ---- 8. Der Grund steht im Quelltext ----------------------------------------
t('warum die Leiste am Rechner umbricht, steht in der CSS-Datei',
  /AM RECHNER UMBRECHEN STATT SEITLICH SCROLLEN/.test(H));
t('und warum overflow-x nicht mehr inline steht',
  /ein Inline-Stil schlaegt jede Media-Query|Inline-Stil schlägt jede Media-Query/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
