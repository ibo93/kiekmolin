// JEDER KNOPF MUSS AUCH ETWAS AUFRUFEN, DAS ES GIBT.
//
// GEMELDET WURDE
// --------------
// "in der Speisekarte ist die Sprache Änderung der Icon geht nicht wenn ich
//  drauf klicke kommt nichts".
//
// DIE URSACHE
// -----------
// Der Weltkugel-Knopf in der Speisekarte trug onclick="toggleMenuSprache()".
// Diese Funktion gab es nicht. Eingebaut worden war damals nur das Markup --
// der Knopf und die Leiste mit Deutsch/English/Nederlands. Ein Klick warf
// eine ReferenceError in die Konsole, sichtbar passierte nichts.
//
// WARUM DIESE DATEI GENERELL PRUEFT UND NICHT NUR DIESEN EINEN KNOPF
// -------------------------------------------------------------------
// Das ist genau die Sorte Fehler, die diese Datei immer wieder produziert:
// etwas sieht fertig aus, tut aber nichts, und niemand merkt es, weil kein
// Fehlerbild erscheint. Dieselbe Familie wie die tote Filterleiste, die von
// nirgends aufgerufen wurde, und wie offsetParent bei position:fixed.
//
// Ein einzelner Test fuer toggleMenuSprache haette den naechsten Fall nicht
// gefunden. Deshalb werden ALLE Klick-Handler im Markup geprueft: rund 390
// Stueck. Auf dem Stand VOR der Reparatur meldet dieser Test genau einen
// Namen -- toggleMenuSprache.
var KMI = require('path').join(__dirname, '..');  // statt fest verdrahtetem Pfad
'use strict';
var fs = require('fs');
var H = fs.readFileSync(KMI + '/index.html', 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

function schneide(name) {
    var i = H.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('nicht gefunden: ' + name);
    var j = H.indexOf('{', i), d = 0;
    for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } }
}

// ---- 1. Alle Klick-Handler zeigen auf etwas, das existiert ------------------
var gerufen = new Set(), m;
var reRuf = /\bon(?:click|change|input|submit|focus|blur)="\s*([A-Za-z_$][\w$]*)\s*\(/g;
while ((m = reRuf.exec(H))) gerufen.add(m[1]);

var da = new Set();
[/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
 /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g,
 /window\.([A-Za-z_$][\w$]*)\s*=/g].forEach(function (re) {
    while ((m = re.exec(H))) da.add(m[1]);
});

// Schluesselwoerter aus Inline-Ausdruecken wie onclick="if(...)..." und die
// Handvoll Funktionen, die der Browser selbst mitbringt.
var KEIN_NAME = new Set(['if', 'for', 'while', 'switch', 'return', 'typeof', 'var',
                         'alert', 'confirm', 'prompt', 'open', 'print']);
var fehlen = [...gerufen].filter(function (x) { return !da.has(x) && !KEIN_NAME.has(x); });

t('mehr als 300 Klick-Handler gefunden (die Suche greift wirklich)',
  gerufen.size > 300, gerufen.size + ' gefunden');
t('JEDER Klick-Handler ruft eine Funktion auf, die es gibt',
  fehlen.length === 0, fehlen.join(', '));
t('toggleMenuSprache ist dabei -- der gemeldete Fall',
  gerufen.has('toggleMenuSprache') && da.has('toggleMenuSprache'));

// ---- 2. Der Sprach-Knopf tut auch das Richtige ------------------------------
function welt(startAnzeige, sprache) {
    var el = {
        menuSpracheBar: { style: { display: startAnzeige } },
        menuSearchBar: { style: { display: '' } }
    };
    var knoepfe = ['de', 'en', 'nl'].map(function (s) {
        return { s: s, style: {}, attrs: {},
                 getAttribute: function (k) { return k === 'data-sprache' ? s : null; },
                 setAttribute: function (k, v) { this.attrs[k] = v; } };
    });
    var gemessen = 0;
    var F = new Function('document', 'currentLanguage', 'katLeisteBedienbar',
        schneide('toggleMenuSprache') + '; return toggleMenuSprache;')(
        { getElementById: function (id) { return el[id] || null; },
          querySelectorAll: function () { return knoepfe; } },
        sprache || 'de',
        function () { gemessen++; });
    return { el: el, knoepfe: knoepfe, auf: F, gemessen: function () { return gemessen; } };
}

var w = welt('none');
w.auf();
t('ein Klick klappt die Sprachleiste auf', w.el.menuSpracheBar.style.display === 'flex',
  w.el.menuSpracheBar.style.display);
t('sie wird als flex gezeigt, nicht als block -- sonst steht das gap wirkungslos da',
  w.el.menuSpracheBar.style.display === 'flex');
t('die Suchleiste macht dabei zu -- nicht zwei Leisten uebereinander',
  w.el.menuSearchBar.style.display === 'none', w.el.menuSearchBar.style.display);
w.auf();
t('noch ein Klick klappt sie wieder zu', w.el.menuSpracheBar.style.display === 'none',
  w.el.menuSpracheBar.style.display);

// Das Markup startet mit style="...display:none;" -- aber ein leerer Wert
// muss genauso als "zu" gelten, sonst braucht es zwei Klicks.
var leer = welt('');
leer.auf();
t('auch aus dem leeren Anfangszustand geht sie beim ERSTEN Klick auf',
  leer.el.menuSpracheBar.style.display === 'flex', leer.el.menuSpracheBar.style.display);

// ---- 3. Die laufende Sprache ist zu sehen -----------------------------------
var nl = welt('none', 'nl');
nl.auf();
var anNl = nl.knoepfe.filter(function (b) { return b.attrs['aria-pressed'] === 'true'; });
t('beim Aufklappen ist genau eine Sprache hervorgehoben', anNl.length === 1, anNl.length);
t('und zwar die laufende (nl)', anNl[0] && anNl[0].s === 'nl', anNl[0] && anNl[0].s);
t('sie ist auch farblich abgesetzt, nicht nur fuer den Screenreader',
  anNl[0].style.background === 'var(--ink-strong)' && anNl[0].style.color === '#fff',
  JSON.stringify(anNl[0].style));
t('die anderen beiden bleiben unauffaellig',
  nl.knoepfe.filter(function (b) { return b.style.background === 'var(--bg-secondary)'; }).length === 2);

// ---- 4. Zusammenspiel mit der Kategorieleiste -------------------------------
// Die Leiste rutscht durch die aufklappende Sprachzeile nach unten; ihr
// Kantenhinweis wird sonst falsch.
var k = welt('none');
k.auf();
t('nach dem Umklappen wird die Kategorieleiste neu gemessen', k.gemessen() === 1, k.gemessen());
t('das kippt auch nicht, wenn es die Funktion nicht gibt',
  /typeof katLeisteBedienbar === 'function'/.test(schneide('toggleMenuSprache')));

// ---- 5. Der Grund steht im Quelltext ----------------------------------------
t('warum der Knopf nichts tat, steht in der Datei',
  /diese Funktion gab es nicht/.test(H));

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
