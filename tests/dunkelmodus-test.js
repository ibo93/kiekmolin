// DER DUNKELMODUS WAR HELL AUF HELL.
//
// Gemeldet am 27.08.2026, mit Bildschirmfotos: "der Dunkel Modus muss
// viel besser sein es ist eine reine Katastrophe". Auf den Bildern war
// die Restaurant-Verwaltung kaum zu lesen -- graue Schrift auf fast
// weissen Karten, mitten auf schwarzem Grund.
//
// NACHGEZAEHLT, STATT GERATEN
// 217 CSS-Regeln und 453 Stellen im Quelltext malen einen WEISSEN
// Hintergrund. Der Dunkelmodus kannte davon acht Klassennamen.
//
// Und einer davon war der falsche: aufgezaehlt war .restaurant-card,
// die Karte in der Verwaltung heisst .rest-card. Ein Buchstabendreher.
// Er faellt nur auf, wenn man mit dunklem Handy auf genau diese Seite
// geht -- kein Fehler in der Konsole, kein roter Test.
//
// WARUM DIESE DATEI MEHR IST ALS EINE LISTE
// Eine Liste von Klassennamen veraltet mit der naechsten neuen Karte.
// Deshalb baut dieser Test die Liste JEDES MAL NEU aus dem Stylesheet
// und vergleicht sie mit dem, was der Dunkelmodus abdeckt. Kommt morgen
// eine weisse Karte dazu und niemand denkt an den Dunkelmodus, wird er
// rot. Das ist der eigentliche Schutz.

var fs = require('fs');
var path = require('path');
var KMI = path.join(__dirname, '..');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var h = fs.readFileSync(path.join(KMI, 'index.html'), 'utf8');
var css = (h.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n');

// ---- Dieselbe Auswahl wie beim Erzeugen des Blocks ------------------
//
// ERST HABE ICH NACH "WEISS" GESUCHT -- das war zu eng.
// #fff, white, rgba(255,255,255,...) fand 220 Flaechen. Im Browser
// nachgemessen fielen sofort die auf, die hell sind, ohne weiss zu
// heissen: #edeeef, #f8f9fa, #fafafa. 151 Stueck.
//
// Also entscheidet die HELLIGKEIT, nicht der Name der Farbe. Alles ab
// 0.75 ist eine helle Flaeche. Unter 0.15 Deckkraft ist es ein Hauch,
// kein Hintergrund -- das stoert auf dunklem Grund niemanden.
// ::before/::after sind Deko-Punkte, keine Flaechen. Und was schon
// unter .dark-mode steht, ist die Loesung, nicht das Problem.
function farbeLesen(txt) {
    txt = String(txt).trim();
    var m = txt.match(/^#([0-9a-fA-F]{3,8})/);
    if (m) {
        var x = m[1];
        if (x.length === 3) x = x[0]+x[0]+x[1]+x[1]+x[2]+x[2];
        if (x.length < 6) return null;
        return [parseInt(x.slice(0,2),16), parseInt(x.slice(2,4),16), parseInt(x.slice(4,6),16), 1];
    }
    m = txt.match(/^rgba?\(([^)]+)\)/);
    if (m) {
        var t = m[1].split(',').map(function (v) { return parseFloat(v); });
        if (t.length < 3 || t.slice(0,3).some(isNaN)) return null;
        return [t[0], t[1], t[2], t.length > 3 ? t[3] : 1];
    }
    if (/^white\b/.test(txt)) return [255,255,255,1];
    return null;
}
function helligkeit(c) { return (0.299*c[0] + 0.587*c[1] + 0.114*c[2]) / 255; }

function helleFlaechen(quelle) {
    var regeln = quelle.match(/[^{}]+\{[^{}]*\}/g) || [];
    var raus = [];
    regeln.forEach(function (regel) {
        var teilung = regel.indexOf('{');
        var sel  = regel.slice(0, teilung);
        var body = regel.slice(teilung + 1, -1);
        var m = body.match(/background(?:-color)?\s*:\s*(?:linear-gradient\([^;]*?[,(]\s*)?([^;!}]+)/i);
        if (!m) return;
        var c = farbeLesen(m[1]);
        if (!c || c[3] < 0.15 || helligkeit(c) < 0.75) return;
        sel = sel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
        if (!sel || sel.charAt(0) === '@' || sel.indexOf('dark-mode') > -1) return;
        sel.split(',').forEach(function (teil) {
            teil = teil.trim();
            if (teil && teil.indexOf('::') === -1) raus.push(teil);
        });
    });
    return raus.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

console.log('\n-- 1. Jede helle Flaeche ist im Dunkelmodus abgedeckt --');
var flaechen = helleFlaechen(css);
t('es gibt ueberhaupt helle Flaechen zu pruefen', flaechen.length > 300, flaechen.length);

// HIER STAND ERST  css.indexOf('.dark-mode ' + sel) === -1  --
// UND DAS HAT NICHTS GEPRUEFT.
//
// Beim Gegenprobieren aufgefallen: .rest-card aus der Liste geloescht,
// Test blieb gruen. Grund: '.dark-mode .rest-card' steckt als Anfang in
// '.dark-mode .rest-card-badge'. Die Textsuche fand also immer etwas,
// auch wenn genau der gesuchte Name fehlte.
//
// Ein Test, der den Fehler nicht einfordert, ist schlimmer als keiner
// -- er behauptet Sicherheit. Deshalb jetzt kein Textvergleich mehr,
// sondern eine echte Menge: alle Selektoren, die unter .dark-mode
// wirklich als eigener Selektor dastehen.
function dunkelSelektoren(quelle) {
    var raus = {};
    (quelle.match(/[^{}]+\{[^{}]*\}/g) || []).forEach(function (regel) {
        var sel = regel.slice(0, regel.indexOf('{'));
        sel.replace(/\/\*[\s\S]*?\*\//g, '').split(',').forEach(function (teil) {
            teil = teil.replace(/\s+/g, ' ').trim();
            if (teil.indexOf('.dark-mode ') === 0) raus[teil.slice(11)] = true;
        });
    });
    return raus;
}
var abgedeckt = dunkelSelektoren(css);
var fehlt = flaechen.filter(function (sel) { return !abgedeckt[sel]; });
t(flaechen.length + ' helle Flaechen, alle abgedeckt', fehlt.length === 0,
  fehlt.length + ' ohne Dunkelmodus-Regel: ' + fehlt.slice(0, 6).join(' | '));

// Der Fall aus dem Bildschirmfoto, noch einmal einzeln benannt -- damit
// beim naechsten Lesen klar ist, worum es ging.
t('die Karte der Restaurant-Verwaltung (.rest-card) ist dabei',
  css.indexOf('.dark-mode .rest-card') > -1, 'wieder hell auf hell');
t('und die Zahlenkacheln daneben (.rest-stat-box)',
  css.indexOf('.dark-mode .rest-stat-box') > -1, 'wieder hell auf hell');

console.log('\n-- 2. Und die 453 Stellen mit Weiss im style-Attribut --');
// Die lassen sich nicht einzeln aufzaehlen. Eine Regel auf das
// style-Attribut greift auch bei jeder Stelle, die morgen dazukommt.
t('weisser Grund im style-Attribut wird abgefangen',
  /\.dark-mode \[style\*="background:rgba\(255,255,255" i\]/.test(css), 'keine Regel dafuer');
t('auch mit Leerzeichen geschrieben',
  /\.dark-mode \[style\*="background: rgba\(255,255,255" i\]/.test(css), 'nur die eine Schreibweise');
t('auch als Verlauf',
  /\.dark-mode \[style\*="background:linear-gradient\(135deg,rgba\(255,255,255" i\]/.test(css), 'Verlaeufe bleiben weiss');
// #003d33 steht 77 mal fest im Quelltext, #00251e 60 mal. Keine
// Variable -- die Palette erreicht sie nicht.
t('fest eingetragene dunkle Schrift wird aufgehellt',
  /\.dark-mode \[style\*="color:#003d33" i\]/.test(css) && /\.dark-mode \[style\*="color:#00251e" i\]/.test(css),
  'dunkle Schrift bleibt dunkel');

console.log('\n-- 2b. Im Browser gemessen, nicht im Quelltext gelesen --');
// werkzeug/dunkelmodus-messen.js laedt index.html in einem echten
// Chromium und misst den Kontrast von 4822 Elementen. Erst dabei fielen
// zwei Dinge auf, die kein Textvergleich findet:
//
//   "Installieren"        weiss auf hellem Minzgruen   1.70:1
//   Personen-Symbol       Minzgruen auf #edeeef        1.47:1
//
// --primary ist im Hellen ein tiefes Gruen und im Dunkeln ein helles
// Minz. Weiss darauf ist leer.
// Gegen die MENGE pruefen, nicht mit einer Textsuche: '.dark-mode
// .install-btn-install' steckt auch in '.dark-mode .install-btn-install
// .material-symbols-outlined'. Beim Gegenprobieren blieb der Test
// deshalb erst gruen, obwohl die Regel weg war -- schon zum zweiten Mal
// in dieser Datei dieselbe Falle.
t('weisse Schrift auf der Hauptfarbe wird dunkel',
  abgedeckt['[style*="background:var(--primary)"]'] === true
  && abgedeckt['.install-btn-install'] === true, 'Weiss auf Minzgruen bleibt');

// Und neutrales Hellgrau direkt im style-Attribut -- graue Kreise und
// Leisten, an die keine Klassenregel herankommt.
t('neutrales Hellgrau im style-Attribut wird dunkel',
  /\.dark-mode \[style\*="background:#edeeef" i\]/.test(css)
  && /\.dark-mode \[style\*="background:#f3f4f5" i\]/.test(css), 'graue Flaechen bleiben hell');

// ABER: die farbigen NICHT. #fed65b ist das Marken-Bernstein mit
// dunkler Schrift darauf, #fef2f2 und #dcfce7 sind Warnung und
// Bestaetigung. Wer die mitdunkelt, macht aus einer Warnung eine graue
// Flaeche -- und der Gast sieht nicht mehr, dass etwas nicht stimmt.
t('die farbigen Abzeichen bleiben farbig',
  css.indexOf('[style*="background:#fed65b"') === -1
  && css.indexOf('[style*="background:#fef2f2"') === -1
  && css.indexOf('[style*="background:#dcfce7"') === -1,
  'Warnfarben werden zu grauen Flaechen');

console.log('\n-- 3. Zwei Kaesten, die dunkel auf dunkel waren --');
// GEMESSEN im Verlauf: beide standen einmal auf einem Hauch und wurden
// in dc15139 auf 0.85 gesetzt. Dass es ein Versehen war, steht im Code
// selbst: die Hover-Werte daneben blieben bei 0.12 / 0.06 -- beim
// Drueberfahren reparierte sich der Knopf von selbst.
t('die Gaeste-Notiz liegt wieder auf einem Hauch, nicht auf Dunkelgruen',
  /if \(r\.notes\)[\s\S]{0,160}background:rgba\(0,61,51,0\.04\)/.test(h),
  'dunkle Schrift auf dunkelgruenem Kasten');
t('und der Ablehnen-Knopf ist nicht mehr rot auf rot',
  /background:rgba\(239,68,68,0\.06\);color:#dc2626/.test(h), 'rot auf rot');
t('nirgends mehr ein 0.85-Grund unter dunkler Schrift',
  h.indexOf('background:rgba(0,61,51,0.85);border-radius:12px') === -1
  && h.indexOf('background:rgba(239,68,68,0.85);color:#dc2626') === -1, 'wieder da');

console.log('\n-- 4. Der Auto-Knopf --');
// Gemeldet: "Das Auto geht auch nicht". Er ging nicht, weil es ihn im
// Profil gar nicht gab -- nur Hell und Dunkel.
var profilKnoepfe = (h.match(/wert: 'auto', *symbol: 'brightness_auto'/g) || []).length;
t('beide Profil-Schalter bieten Automatisch an', profilKnoepfe === 2, profilKnoepfe + ' von 2 Schaltern');
t('mit eigenem Symbol', (h.match(/brightness_auto/g) || []).length >= 3, 'kein Symbol');

// Der zweite Fehler: gefragt wurde der BODY ("bist du gerade dunkel?").
// Damit sieht "Automatisch, und draussen ist Nacht" genauso aus wie
// "Dunkel fest eingestellt" -- die Einstellung war nicht wiederzuerkennen.
t('welcher Knopf leuchtet, entscheidet die Einstellung -- nicht die Uhrzeit',
  /themeWahl = localStorage\.getItem\('kmi_theme'\)/.test(h)
  && /themeWahlG = localStorage\.getItem\('kmi_theme'\)/.test(h), 'fragt wieder den body');
t('und der body wird dafuer nicht mehr befragt',
  h.indexOf("var isDark = document.body.classList.contains('dark-mode')") === -1
  && h.indexOf("var isDarkG = document.body.classList.contains('dark-mode')") === -1,
  'fragt wieder den body');

console.log('\n-- 5. Die Knopf-Kennungen, die es wirklich gibt --');
// Gesucht wurde 'themeBtnLight', im Quelltext steht
// 'themeBtnLightSimple'. Kein Treffer, kein Fehler, keine Wirkung.
t('die Knoepfe im Darstellungs-Fenster heissen ...Simple',
  h.indexOf('id="themeBtnLightSimple"') > -1 && h.indexOf('id="themeBtnAutoSimple"') > -1, 'anders benannt');
var fn = h.slice(h.indexOf('function updateThemeButtons'));
fn = fn.slice(0, fn.indexOf('\n}'));
t('und genau die werden auch gesucht', /'themeBtn' \+ btn \+ 'Simple'/.test(fn), fn.slice(0, 120));

console.log('\n-- 6. Automatisch heisst: der Wechsel kommt auch spaeter an --');
// Wer abends umschaltet, will nicht neu laden muessen.
t('die App hoert auf den Wechsel des Geraets',
  /matchMedia\('\(prefers-color-scheme: dark\)'\)/.test(h), 'hoert nicht zu');
t('und nur, solange Automatisch eingestellt ist',
  /localStorage\.getItem\('kmi_theme'\) === 'auto'/.test(h), 'ueberschreibt die feste Wahl');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
