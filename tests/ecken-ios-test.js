// ECKEN WIE iOS 27 -- FENSTER 34, KARTEN 28, INNEN 12, KNOEPFE RUND.
//
// 06.10.2026, Ibo: "Mein Design ist besser -- nur das Glas, die Cards, das
// Runde von iOS 27". Aufbau und Farben bleiben; nur die Ecken folgen iOS.
//
// Gemessen (werkzeug/ecken-messen.js, Chromium): verschachtelte Ecken, die
// ineinanderpassen, vorher 27 von 43, nachher 44 von 44. Lesbarkeit
// unveraendert (werkzeug/lesbarkeit-messen.js: 417 Texte, 1 Meldung -- die
// Ueberschrift, die das Werkzeug nicht messen kann).
//
// WAS SCHIEFGEHEN KANN
//   - Knoepfe und Felder fallen unter die Karten-Regel und werden eckig --
//     aus Pillen werden Rechtecke mit 28er Ecken.
//   - Kreise (50 %) werden zu Quadraten mit runden Ecken.
//   - Die Innen-Regel fehlt: dann ist innen wieder runder als aussen.
//
// GEGENPROBEN (06.10.2026) -- jede wurde rot:
//   - :not(button) aus der Karten-Regel entfernt
//   - die Innen-Regel entfernt
//   - Karten wieder 48 px
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

var OHNE = ':not(button):not(a):not(.btn):not([class*="btn"]):not(input):not(select):not(.chip)';
var aussen = H.match(/:is\(html, #kmi-glas\) :is\(([^{]*?)\)(:not\(button\)[^{]*) \{\s*border-radius: 28px !important;\s*\}/);
t('Karten-Regel: 28 px', !!aussen, null);
t('Knoepfe, Links, Felder und Pillen sind ausgenommen', !!aussen && aussen[2] === OHNE, aussen && aussen[2]);
['.panel', '.stat-box', '.glass-card', '.oc-glass-card', '.lp-hero-karte', '[style*="border-radius:48px"]', '[style*="border-radius:32px"]', '[style*="border-radius:24px"]'].forEach(function (k) {
    t('  Karte erfasst: ' + k, !!aussen && aussen[1].indexOf(k) >= 0, k);
});
t('Kreise bleiben Kreise: keine Regel auf 50 %', !/:is\(html, #kmi-glas\)[^{]*border-radius:50%[^{]*\{\s*border-radius:/.test(H), null);
var innen = /:is\(html, #kmi-glas\) :is\([^{]*?\) :is\([^{]*?\.cal-day[^{]*?\)(:not\(button\)[^{]*) \{\s*border-radius: 12px !important;\s*\}/.exec(H);
t('Innen-Regel: 12 px in einer Karte (28 minus 16)', !!innen && innen[1] === OHNE, null);
t('Fenster 34 px', /:is\(html, #kmi-glas\) :is\(\.modal, \.onboarding-card, \.assistant-chat\):not\(button\)[^{]*\{\s*border-radius: 34px !important;/.test(H), null);
t('Fenster von unten: oben 34 px, unten eckig', /\{\s*border-radius: 34px 34px 0 0 !important;/.test(H), null);
t('Glas-Leisten mit dunklem Rand (iOS 27)', /:not\(\.dark-mode\) :is\(\.kmi-glas-leiste:not\(\.kmi-glas-dunkel\), \.install-banner\) \{\s*border: 1px solid rgba\(0,37,30,0\.16\) !important;/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
