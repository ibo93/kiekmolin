// Der Balken ueber der Speisekarte war im Dunkelmodus weiss.
//
// GEMELDET WURDE
// "design ist dunkel modus oben den balken das muss schwarz sein und die
//  pillen in weiss oder grün oder gelb kiekmolin farben".
//
// NACHGEMESSEN, bei eingeschaltetem Dunkelmodus:
//   #menuModal        rgb(248,249,250)       fast weiss
//   .menu-categories  rgba(255,255,255,0.85) weiss
//   header            rgb(26,26,26)          dunkelgrau
//
// Die PILLEN waren laengst umgestellt -- nur die Flaeche, auf der sie
// liegen, nicht. Dunkle Pillen auf weissem Balken ueber schwarzen
// Karten.
//
// ZWEIMAL DIESELBE FALLE: SPEZIFITAET
// Es gab bereits Dunkel-Fassungen. Sie haben nur nicht gewonnen.
//   1. ".liquid-glass #menuModal" steht SPAETER in der Datei -- gleiche
//      Spezifitaet, also gewinnt die spaetere.
//   2. Eine Sammelregel faerbt jeden inline-weissen Hintergrund im
//      Menuefenster auf #1a1a1a. Mit [style*="background:rgba(255,255,255"]
//      ist sie spezifischer als ein blosses "header" -- und der
//      Kopfbalken traegt genau so einen Inline-Stil.
//
// Deshalb pruefen die Tests hier nicht nur, DASS eine Regel existiert,
// sondern dass sie auch die Form hat, mit der sie sich durchsetzt.

var KMI = require('path').join(__dirname, '..');
var fs = require('fs');
var h = fs.readFileSync(KMI + '/index.html', 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

console.log('\n-- 1. Die Grundflaeche wird schwarz --');
// Muss NACH ".liquid-glass #menuModal" stehen und mehr Klassen tragen,
// sonst gewinnt die helle Regel wieder.
var hell = h.indexOf('.liquid-glass #menuModal {');
var dunkel = h.indexOf('.liquid-glass.dark-mode #menuModal,');
t('die helle Regel gibt es', hell > 0, hell);
t('die dunkle Regel gibt es', dunkel > 0, dunkel);
t('die dunkle steht SPAETER in der Datei', dunkel > hell, hell + ' / ' + dunkel);
t('sie traegt zwei Klassen, ist also spezifischer',
  /\.liquid-glass\.dark-mode #menuModal/.test(h), 'nur eine Klasse');
t('auch die Schreibweise mit Vorfahr ist abgedeckt',
  /\.dark-mode \.liquid-glass #menuModal/.test(h), 'fehlt');
t('sie setzt schwarz',
  /\.dark-mode #menuModal\.modal-overlay \{\s*\n\s*background: #0a0a0a !important;/.test(h), 'nicht schwarz');

console.log('\n-- 2. Der Kopfbalken wird schwarz --');
// [style] ist noetig, um die Sammelregel zu schlagen.
t('die Header-Regel greift den Inline-Stil ab',
  /\.dark-mode #menuModal header\[style\] \{/.test(h), 'ohne [style]');
t('und setzt denselben Ton wie die Leiste darunter',
  /\.dark-mode #menuModal header\[style\] \{\s*\n\s*background: #0e0e0e !important;/.test(h), 'anderer Ton');
// Die Sammelregel bleibt -- sie faengt viele andere Inline-Weiss ab.
t('die Sammelregel fuer inline-weiss bleibt bestehen',
  /\.dark-mode #menuModal \[style\*="background:rgba\(255,255,255"\]/.test(h), 'entfernt');
t('der Grund fuer \[style\] steht als Kommentar dabei',
  h.indexOf('Der Zusatz [style] ist noetig') > -1, 'keine Begruendung');

console.log('\n-- 3. Die Pillenleiste wird schwarz --');
[['\\.menu-categories', 'Kategorieleiste'],
 ['#menuCategoryTabs', 'die Leiste per Kennung'],
 ['#menuSearchBar', 'die Suchzeile'],
 ['#menuSpracheBar', 'die Sprachzeile']
].forEach(function (p) {
    t(p[1] + ' wird dunkel gesetzt',
      new RegExp('\\.dark-mode #menuModal ' + p[0]).test(h), p[0]);
});
t('alle vier auf denselben Ton',
  /#menuSearchBar \{\s*\n\s*background: #0e0e0e !important;/.test(h), 'unterschiedlich');

console.log('\n-- 4. Die Pillen tragen die Hausfarben --');
// Gewuenscht: "weiss oder grün oder gelb kiekmolin farben".
// Gewaehlt: dasselbe Gelb wie im hellen Modus -- #fed65b auf #745c00.
// Das ist die Farbe, an der man Kiek mol in erkennt.
t('die gewaehlte Pille ist gelb',
  /\.dark-mode #menuModal \.menu-category-tab\.active \{[\s\S]{0,200}?background: #fed65b !important;/.test(h),
  'nicht gelb');
t('mit dunkelgoldener Schrift darauf',
  /\.dark-mode #menuModal \.menu-category-tab\.active \{[\s\S]{0,200}?color: #745c00 !important;/.test(h),
  'andere Schrift');
// Genau dieselben Werte wie im hellen Modus -- eine Marke, nicht zwei.
var hellPille = h.match(/\.menu-category-tab\.active \{[\s\S]{0,200}?\}/);
t('dasselbe Gelb wie im hellen Modus', /#fed65b/.test(hellPille ? hellPille[0] : ''), hellPille && hellPille[0]);
t('die uebrigen Pillen sind dunkel mit heller Schrift',
  /\.dark-mode #menuModal \.menu-category-tab \{[\s\S]{0,220}?background: #1a1a1a !important;[\s\S]{0,120}?color: #e8eeec !important;/.test(h),
  'anders');
t('der Grund fuer das Gelb steht dabei',
  h.indexOf('an der man Kiek mol') > -1, 'keine Begruendung');

console.log('\n-- 5. Die Messung ist festgehalten --');
// Ohne die Zahlen liest das jemand spaeter und haelt es fuer Geschmack.
t('die gemessenen Werte stehen im Code',
  h.indexOf('rgb(248,249,250)') > -1 && h.indexOf('rgba(255,255,255,.85) weiss') > -1,
  'keine Messung');
t('die Meldung steht dabei',
  h.indexOf('das muss') > -1 && h.indexOf('schwarz sein') > -1, 'keine Meldung');

console.log('\n-- 6. Der helle Modus bleibt unberuehrt --');
// Alle neuen Regeln haengen an .dark-mode. Eine ohne waere ein Eingriff
// in den hellen Modus, den niemand bestellt hat.
var neueRegeln = (h.match(/^\s*\.(?:liquid-glass\.)?dark-mode[^\n]*#menuModal[^\n]*\{/gm) || []);
t('es gibt mehrere neue Dunkel-Regeln', neueRegeln.length >= 3, neueRegeln.length);
t('jede haengt an .dark-mode',
  neueRegeln.every(function (r) { return r.indexOf('dark-mode') > -1; }), neueRegeln);
t('die helle Kategorieleiste ist unveraendert',
  /\.menu-category-tab\.active \{\s*\n\s*background: #fed65b;/.test(h), 'veraendert');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
