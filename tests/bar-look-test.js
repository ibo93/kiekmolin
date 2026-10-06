// DUNKLER AUFTRITT -- EINE BAR SIEHT AUS WIE EINE BAR.
//
// Gebaut am 06.10.2026 fuer den ersten Shisha-Bar-Kunden ("fuer bar design
// aendern waere gut"). Hat ein Lokal den Schalter "Dunkler Auftritt" an
// (features: look_dunkel), sieht der Gast seine Seite und seine Speisekarte
// im Dunkelmodus der App, in der Markenfarbe des Lokals.
//
// WAS SCHIEFGEHEN KANN, UND WIE ES DANN AUSSAEHE
//   - Der Gast verlaesst die Bar ueber den Zurueck-Knopf des Handys. Der
//     entfernt die Lokalseite DIREKT, ohne closeRestaurantLanding. Haengt die
//     Ruecknahme an einem Weg, bleibt die ganze App danach dunkel.
//   - Wer selbst "Dunkel" eingestellt hat, bekaeme beim Verlassen der Bar
//     seinen Dunkelmodus weggenommen.
//   - Wer auf der Bar-Seite selbst umschaltet, dem wird es beim naechsten
//     Hinweis-Fenster wieder umgeschaltet. Die Gaeste-Schalter heissen
//     setTheme / setThemeSimple / resetDesign -- NICHT setThemeMode, an dem
//     der erste Entwurf hing.
//   - toggleFeature laesst 'look_dunkel' in die Standardregel fallen, und die
//     baut "no_reservations" daraus: der Wirt schaltet das Design um und
//     damit unbemerkt die Reservierungen AB.
//   - Die Seite wird dunkel, aber ihre fest eingetragenen Farben nicht. Im
//     Browser gemessen (Chromium, 06.10.2026) vor der Reparatur: 13 Texte
//     unter 4,5 : 1 -- Gold 3 : 1, Aktionskarten weiss mit hellgruener
//     Schrift 1,29 : 1, das Farbfeld "Besuche uns" 2,04 : 1. Danach: 0.
//
// Ein Quelltext-Test sieht keinen Bildschirm. Deshalb LAEUFT hier
// barLookPflegen gegen ein nachgebautes Dokument, und die Kontraste werden
// aus den Farbwerten im CSS ausgerechnet -- mit derselben Formel wie
// werkzeug/dunkelmodus-messen.js.
//
// GEGENPROBEN BEIM SCHREIBEN (06.10.2026) -- jede wurde rot:
//   - Ruecknahme nur, wenn der Gast NICHT selbst dunkel war, entfernt
//     (dann nimmt die Bar dem Gast seinen Dunkelmodus weg)
//   - barLookGastWahl aus setTheme entfernt
//   - den look_dunkel-Zweig in toggleFeature hinter die Standardregel gesetzt
//   - --lp-akzent im Dunkeln wieder auf #735c00
//   - die weisse Schrift im Farbfeld entfernt
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }
function schneide(kopf, quelle) {
    quelle = quelle || H;
    var a = quelle.indexOf(kopf); if (a < 0) return '';
    var i = quelle.indexOf('{', a), tiefe = 0;
    for (var j = i; j < quelle.length; j++) { if (quelle[j] === '{') tiefe++; else if (quelle[j] === '}') { tiefe--; if (!tiefe) return quelle.slice(a, j + 1); } }
    return '';
}

// ---------------------------------------------------------------------
console.log('\n-- 1. barLookPflegen laeuft: hin, zurueck, und die Wahl des Gastes --');
function klassen() {
    var s = {};
    return { add: function (k) { s[k] = 1; }, remove: function (k) { delete s[k]; }, contains: function (k) { return !!s[k]; } };
}
function welt() {
    var w = { landing: null, menu: { style: { display: 'none' }, classList: klassen() }, aktuell: null };
    w.window = {};
    w.document = {
        documentElement: { classList: klassen() },
        body: { classList: klassen() },
        getElementById: function (id) { return id === 'restaurantLanding' ? w.landing : id === 'menuModal' ? w.menu : null; }
    };
    var quelle = schneide('function barLookOrt(') + '\n' + schneide('function barLookAn(') + '\n'
        + schneide('function barLookGastWahl(') + '\n' + schneide('function barLookPflegen(') + '\n'
        + 'return { pflegen: barLookPflegen, gastWahl: barLookGastWahl, an: barLookAn };';
    var f = new Function('document', 'window', 'currentOrderRestaurant', quelle);
    // currentOrderRestaurant ist im Original eine Variable im selben Skript
    w.api = function () { return f(w.document, w.window, w.aktuell); };
    w.dunkel = function () { return w.document.body.classList.contains('dark-mode') && w.document.documentElement.classList.contains('dark-mode'); };
    w.hell = function () { return !w.document.body.classList.contains('dark-mode') && !w.document.documentElement.classList.contains('dark-mode'); };
    return w;
}
var BAR = { id: 'b', features: ['look_dunkel', 'kohle_ruf'] };
var PIZZA = { id: 'p', features: ['preorder'] };

t('alle vier Funktionen sind da', ['barLookOrt', 'barLookAn', 'barLookGastWahl', 'barLookPflegen'].every(function (x) { return schneide('function ' + x + '(').length > 20; }), null);

var w = welt();
w.landing = {}; w.window._lpRestaurant = BAR; w.api().pflegen();
t('Bar-Seite offen -> dunkel', w.dunkel(), null);
w.landing = null; w.api().pflegen();
t('Seite weg (Zurueck-Knopf, ohne closeRestaurantLanding) -> wieder hell', w.hell(), null);

w = welt();
w.landing = {}; w.window._lpRestaurant = PIZZA; w.api().pflegen();
t('Lokal ohne Schalter -> bleibt hell', w.hell(), null);

w = welt();
w.document.body.classList.add('dark-mode'); w.document.documentElement.classList.add('dark-mode');
w.landing = {}; w.window._lpRestaurant = BAR; w.api().pflegen();
w.landing = null; w.api().pflegen();
t('Gast war selbst dunkel -> nach der Bar weiterhin dunkel', w.dunkel(), null);

w = welt();
w.landing = {}; w.window._lpRestaurant = BAR; w.api().pflegen();
w.api().gastWahl();                       // Gast tippt auf "Dunkel"
w.landing = null; w.api().pflegen();
t('Gast schaltet auf der Bar-Seite selbst um -> beim Verlassen bleibt seine Wahl', w.dunkel(), null);

w = welt();
w.landing = {}; w.window._lpRestaurant = BAR; w.api().pflegen();
w.api().gastWahl();                       // Gast tippt auf "Hell"
w.document.body.classList.remove('dark-mode'); w.document.documentElement.classList.remove('dark-mode');
w.api().pflegen();                        // naechstes Hinweis-Fenster
t('Gast waehlt hell auf der Bar-Seite -> wird nicht wieder dunkel gezwungen', w.hell(), null);

w = welt();
w.aktuell = BAR; w.menu.style.display = 'flex'; w.menu.classList.add('active'); w.api().pflegen();
t('Tisch-QR direkt in die Speisekarte -> dunkel', w.dunkel(), null);
w.menu.style.display = 'none'; w.menu.classList.remove('active'); w.api().pflegen();
t('Speisekarte zu -> wieder hell', w.hell(), null);

w = welt();
w.landing = {}; w.window._lpRestaurant = BAR; w.api().pflegen();
w.window._lpRestaurant = PIZZA; w.api().pflegen();
t('von der Bar direkt zu einem anderen Lokal -> hell', w.hell(), null);

// ---------------------------------------------------------------------
console.log('\n-- 2. Wer ruft barLookPflegen, wer meldet die Wahl des Gastes --');
['setTheme(', 'setThemeSimple(', 'resetDesign(', 'setThemeMode('].forEach(function (f) {
    t(f + ') meldet die Wahl des Gastes', /barLookGastWahl\(\)/.test(schneide('function ' + f)), null);
});
var lp = schneide('async function showRestaurantLanding(');
var iMerk = lp.indexOf('window._lpRestaurant = rest;'), iPflege = lp.indexOf("if (typeof barLookPflegen === 'function') barLookPflegen();");
t('Lokalseite: erst das Lokal merken, dann pflegen', iMerk > 0 && iPflege > iMerk, { iMerk: iMerk, iPflege: iPflege });
var mm = schneide('async function openMenuModal(');
t('Speisekarte: pflegt nach dem Oeffnen', mm.indexOf("modal.classList.add('active')") > 0 && mm.indexOf('barLookPflegen()') > mm.indexOf("modal.classList.add('active')"), null);
t('closeModal(menuModal) pflegt erst NACH dem Schliessen', /setTimeout\(function \(\) \{ if \(typeof barLookPflegen === 'function'\) barLookPflegen\(\); \}, 0\)/.test(schneide('function closeModal(')), null);
t('und ausserdem bei jeder Aenderung an <body>', /new MutationObserver\(function \(\) \{ try \{ barLookPflegen\(\); \} catch \(e\) \{\} \}\)/.test(H), null);

// ---------------------------------------------------------------------
console.log('\n-- 3. Der Schalter des Wirts --');
var tf = schneide('async function toggleFeature(');
var iLook = tf.indexOf("} else if (feature === 'look_dunkel') {"), iSonst = tf.indexOf("var flagName = feature === 'ordering' ? 'no_ordering' : 'no_reservations';");
t('look_dunkel hat einen eigenen Zweig', iLook > 0, iLook);
t('und der steht VOR der Standardregel -- sonst gingen die Reservierungen aus', iLook > 0 && iSonst > iLook, { look: iLook, standard: iSonst });
t('der Schalter zeigt den Zustand beim Laden', /lookDunkelToggle\.classList\.remove\('off'\)/.test(schneide('function updateFeatureToggles(')), null);
t('der Schalter steht im Dashboard', /id="lookDunkelToggle"[^>]*onclick="toggleFeature\('look_dunkel'\)"/.test(H), null);

// ---------------------------------------------------------------------
console.log('\n-- 4. Kontrast, aus den Farbwerten im CSS gerechnet --');
// Alle Regeln mit genau diesem Waehler (es gibt mehrere -- eine setzt nur
// den Hintergrund) zusammenlegen, wie der Browser es auch tut.
function block(sel) {
    var re = new RegExp('\\n\\s*' + sel.replace(/[.#()-]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
    var v = {}, m, gefunden = false;
    while ((m = re.exec(H))) { gefunden = true; m[1].replace(/(--lp-[a-z-]+)\s*:\s*([^;]+);/g, function (_, k, w) { v[k] = w.trim(); }); }
    return gefunden ? v : null;
}
function rgb(s) {
    s = String(s || '').trim();
    var m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4), 16), a: 1 };
    m = s.match(/^rgba?\(([^)]+)\)$/); if (!m) return null;
    var p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function drauf(v, h) { return { r: v.r * v.a + h.r * (1 - v.a), g: v.g * v.a + h.g * (1 - v.a), b: v.b * v.a + h.b * (1 - v.a), a: 1 }; }
function leucht(c) { var f = [c.r, c.g, c.b].map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
function kontrast(a, b) { var x = leucht(a), y = leucht(b); return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100; }

var D = block('.dark-mode #restaurantLanding') || {};
var GRUND = rgb('#0e0e0e');
var karte = rgb(D['--lp-karte']);
t('Dunkel-Werte der Lokalseite sind da', !!karte && !!rgb(D['--lp-akzent']) && !!rgb(D['--lp-tinte']), D);
if (karte) {
    var paare = [
        ['Gold ("Über uns", "Bei uns") auf dem Seitengrund', D['--lp-akzent'], GRUND],
        ['Titel einer Aktionskarte', D['--lp-tinte'], karte],
        ['Zeitplan einer Aktionskarte', D['--lp-gedaempft'], karte],
        ['Beschreibung einer Aktionskarte', D['--lp-text'], karte],
        ['Vorteil-Pille ("10 % auf ...")', D['--lp-akzent-text'], drauf(rgb(D['--lp-akzent-hell']), karte)]
    ];
    paare.forEach(function (p) {
        var vorne = rgb(p[1]), k = vorne ? kontrast(drauf(vorne, p[2]), p[2]) : 0;
        t(p[0] + ': ' + k + ' : 1 (mind. 4,5)', k >= 4.5, { farbe: p[1], k: k });
    });
}
var Hll = block('#restaurantLanding') || {};
t('im Hellen traegt --lp-akzent genau das alte Gold #735c00', Hll['--lp-akzent'] === '#735c00', Hll['--lp-akzent']);
t('im Hellen bleibt der Zeitplan beim alten Grau #6b7280', Hll['--lp-gedaempft'] === '#6b7280', Hll['--lp-gedaempft']);
t('--lp-text gibt es NUR im Dunkeln (hell gilt weiter --text-secondary)', !('--lp-text' in Hll) && ('--lp-text' in D), null);

var lpGold = (lp.match(/color:#735c00/g) || []).length;
t('auf der Lokalseite steht kein festes Gold mehr', lpGold === 0, lpGold);

console.log('\n-- 5. Das Farbfeld "Besuche uns" --');
t('das Feld traegt seine Klasse', /<div class="lp-marke-feld" style="padding:48px;background:var\(--marke,#003d33\);color:white;">/.test(lp), null);
t('im Dunkeln ist seine Schrift weiss -- nicht das allgemeine Grau #9ca8a4',
  /\.dark-mode \.lp-marke-feld h2,\s*\.dark-mode \.lp-marke-feld p,\s*\.dark-mode \.lp-marke-feld a\s*\{\s*color:\s*#ffffff !important;/.test(H), null);
var labels = (lp.match(/class="lp-marke-label" style="color:var\(--marke-label,#75a89b\);/g) || []).length;
t('alle drei kleinen Ueberschriften folgen --marke-label', labels === 3, labels);
t('beim Standard-Gruen bleibt das Mint, bei jeder anderen Farbe Weiss',
  /'--marke-label:' \+ \(_marke === MARKE\.STANDARD \? '#75a89b' : '#ffffff'\)/.test(lp), null);
// Mint auf Bernstein (#b45309) waren im Hellen 1,87 : 1 -- jetzt Weiss:
t('Weiss auf Bernstein #b45309: ' + kontrast(rgb('#ffffff'), rgb('#b45309')) + ' : 1', kontrast(rgb('#ffffff'), rgb('#b45309')) >= 4.5, null);
t('und das Mint bleibt nur dort, wo es reicht (Standard #003d33: ' + kontrast(rgb('#75a89b'), rgb('#003d33')) + ' : 1)', kontrast(rgb('#75a89b'), rgb('#003d33')) >= 4.5, null);

console.log('\n-- 6. Die Aktionskarten drehen mit --');
var ak = schneide('function aktionKarteHtml(');
t('Karte: Grund aus --lp-karte', /background:var\(--lp-karte,#ffffff\)/.test(ak), null);
t('Karte: Titel aus --lp-tinte', /color:var\(--lp-tinte,var\(--ink-deep\)\)/.test(ak), null);
t('Karte: Beschreibung aus --lp-text', /color:var\(--lp-text,var\(--text-secondary\)\)/.test(ak), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
