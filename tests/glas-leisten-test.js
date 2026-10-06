// GLAS NUR FUER SCHWEBENDE LEISTEN -- WIE BEI APPLE.
//
// 06.10.2026, Ibo: "Apple Design liquid besser machen alles besser machen".
//
// Apple setzt Liquid Glass als eigene Ebene NUR fuer Bedienleisten ein, die
// ueber dem Inhalt schweben. Der Inhalt bleibt fest. Hier war es umgekehrt.
//
// Im Browser gemessen (Chromium, Gaesteseiten, alte gegen neue Fassung):
//   Glasflaechen je Ansicht           27-31        ->  8-10 (nur Leisten,
//                                                      Aktionsleiste, Karten-Knoepfe)
//   Glasflaeche (Bildschirme)         0,41-1,56    ->  0,20-0,35
//   Ueberschrift Startseite, hellste Stelle hinter der Schrift
//                                     1,75 : 1     ->  10,91 : 1 (dunkel 6,08 -> 15,48)
//   Untere Navigation, nicht gewaehlt 2,01 : 1     ->  bestanden
//   Kalender Wochentage / Sonntag     3,17 / 2,28  ->  bestanden
//   Texte unter 4,5 : 1, Textvergleich (Start/Lokalseite/Karte/Reservierung)
//                                     hell 5/5/5/12 -> 1/1/1/1, dunkel 0/0/0/1 -> 0
//     (die eine ist die Ueberschrift: das Textwerkzeug sieht den Verlauf
//      darunter nicht -- an den Bildpunkten gemessen 10,91 : 1)
//   "Transparenz reduzieren"          8 Glasflaechen -> 0, Leisten deckend
//
// Zweiter Schritt, Ibo: "Mach die ganze App". Dashboard, 16 Ansichten
// (4 Bereiche ohne Anmeldung eingeblendet, hell/dunkel, Rechner/Handy):
//   Glasflaechen                      88           ->  40 (nur Seitenleiste,
//                                                      Kopfzeile, Menue-Knopf)
//   Texte unter 4,5 : 1               30           ->  0
//     "Restaurant offen" 1,8 (weiss auf weissem Feld in der gruenen Karte),
//     Verbindungsanzeige 2,0, dunkel "Speichern" 1,2 und "Angebot" 2,37,
//     Kennzahl-Beschriftungen 4,45
//
// GEGENPROBEN (06.10.2026) -- jede wurde rot:
//   - #kmi-glas aus der Abschalt-Regel entfernt
//   - die Ausnahme fuer das Dashboard wieder eingebaut
//   - in "Transparenz reduzieren" die Leisten-Liste weggelassen
//   - den Verlauf der Startseite wieder ab 40 % hell
'use strict';
var fs = require('fs');
var path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + JSON.stringify(x))); }

console.log('\n-- 1. Glas aus, ausser auf den Leisten --');
t('jeder Weichzeichner aus, mit dem Gewicht einer Kennung',
  /\n        :is\(html, #kmi-glas\) body \* \{\s*backdrop-filter: none !important;\s*-webkit-backdrop-filter: none !important;/.test(H), null);
t('ohne Ausnahme -- auch das Dashboard (keine :not(#dashboardView)-Luecke mehr)', H.indexOf('body *:not(#dashboardView') < 0, null);
var LEISTEN = ['#guestTopNav', '.bottom-nav', '.kmi-glas-leiste', '#menuModal header', '#menuCategoryTabs', '.cart-button-fixed', '.install-banner', '.ptr-indicator', '#mapSection [style*="backdrop-filter"]', '.dash-sidebar', '.dash-header', '.dash-mobile-menu-btn'];
var frei = H.match(/:is\(html, #kmi-glas\) :is\(([^{]*)\) \{\s*backdrop-filter: blur\(20px\) saturate\(180%\) !important;/);
t('die Leisten bekommen EINEN gemeinsamen Glas-Look', !!frei, null);
LEISTEN.forEach(function (l) { t('  Leiste dabei: ' + l, !!frei && frei[1].indexOf(l) >= 0, l); });
t('die Leisten der Lokalseite sind markiert (Kopfleiste und Aktionsleiste)',
  /<nav class="kmi-glas-leiste" style="position:fixed;top:0;/.test(H) && /var bar = '<div class="kmi-glas-leiste kmi-glas-dunkel"/.test(H), null);
t('Grund der Leisten im Dunkeln dicht (nicht 5 % wie vorher beim Installieren-Banner)',
  /:is\(html, #kmi-glas\)\.dark-mode :is\(#guestTopNav[^{]*\.install-banner[^{]*\{\s*background-color: rgba\(18,20,20,0\.86\) !important;/.test(H), null);
t('Fenster sind Inhalt: hell deckend weiss',
  /:is\(html, #kmi-glas\):not\(\.dark-mode\) :is\(#menuModal \.modal, #reservationModal \.modal, \.lp-hero-karte\) \{\s*background-color: #ffffff !important;/.test(H), null);

console.log('\n-- 2. Transparenz reduzieren --');
var red = (H.match(/@media \(prefers-reduced-transparency: reduce\) \{([\s\S]*?)\n        \}\n/) || [])[1] || '';
t('es gibt die Regel', red.length > 0, null);
t('sie schaltet auch die Leisten ab (gleiches Gewicht wie die Freigabe)',
  /:is\(html, #kmi-glas\) :is\(#guestTopNav, \.bottom-nav, \.kmi-glas-leiste, #menuModal header,[^{]*\.dash-sidebar, \.dash-header, \.dash-mobile-menu-btn\) \{\s*backdrop-filter: none !important;/.test(red), null);
t('und macht die Leisten deckend, hell und dunkel',
  /background-color: #ffffff !important;/.test(red) && /background-color: #121414 !important;/.test(red) && /\.kmi-glas-dunkel \{ background-color: #00251e !important; \}/.test(red), null);

console.log('\n-- 3. Lesbar --');
function hx(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
function lum(c) { var f = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
function k(a, b) { var x = lum(a), y = lum(b); return Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100; }
function mix(c, a, g) { return c.map(function (v, i) { return v * a + g[i] * (1 - a); }); }
var scrim = H.match(/<div class="hero-scrim" style="position:absolute;inset:0;background:linear-gradient\(to bottom, rgba\(0,37,30,0\.15\) 0%, rgba\(0,37,30,0\.40\) 35%, rgba\(0,37,30,(0\.\d+)\) 56%, rgba\(0,37,30,(0\.\d+)\) 76%, #f8f9fa 100%\);"><\/div>/);
t('Startseite: dunkler Schleier hinter der Ueberschrift, hell erst unter dem Suchfeld', !!scrim, null);
if (scrim) {
    var schlimmst = mix([0, 37, 30], Math.min(+scrim[1], +scrim[2]), [255, 255, 255]);
    var kk = k([255, 255, 255], schlimmst);
    t('weiss bleibt selbst ueber einem rein weissen Foto lesbar: ' + kk + ' : 1', kk >= 4.5, kk);
}
var navFarbe = (H.match(/\.bottom-nav \.nav-item:not\(\.active\) span \{\s*color: (#[0-9a-f]{6}) !important;/) || [])[1];
t('untere Navigation, nicht gewaehlt: ' + (navFarbe ? k(hx(navFarbe), [255, 255, 255]) : '?') + ' : 1 auf Weiss', !!navFarbe && k(hx(navFarbe), [255, 255, 255]) >= 4.5, navFarbe);
t('Kalender: Wochentage in voller Zweitfarbe, Sonntag eigene Farbe hell und dunkel',
  /\.res-wt \{ color: var\(--text-secondary\); \}/.test(H) && /\.res-wt\.res-wt-so \{ color: #b91c1c; \}/.test(H) && /\.dark-mode \.res-wt\.res-wt-so \{ color: #ff8a80; \}/.test(H)
  && H.indexOf('color:rgba(64,73,70,0.6);padding:4px 0;">Mo</div>') < 0, null);
t('Sonntag hell ' + k(hx('#b91c1c'), [255, 255, 255]) + ' : 1, dunkel ' + k(hx('#ff8a80'), hx('#1a2e27')) + ' : 1',
  k(hx('#b91c1c'), [255, 255, 255]) >= 4.5 && k(hx('#ff8a80'), hx('#1a2e27')) >= 4.5, null);

console.log('\n-- 4. Lesbar im Dashboard --');
t('"Restaurant offen": in der gruenen Karte kein weisses Feld mehr',
  /\[style\*="background:#003d33"\] \.availability-control \{\s*background: rgba\(255,255,255,0\.08\) !important;/.test(H), null);
t('Verbindungsanzeige hell: dunkles Orange ' + k(hx('#92400e'), hx('#f3f4f5')) + ' : 1 statt #ff9500',
  /#connectionStatus\[style\*="var\(--warning\)"\] \{ color: #92400e !important; \}/.test(H) && k(hx('#92400e'), hx('#f3f4f5')) >= 4.5, null);
t('dunkel: Gold-Knoepfe behalten dunkle Schrift (' + k(hx('#00251e'), hx('#ffd54f')) + ' : 1)',
  /:is\(html, #kmi-glas\)\.dark-mode \[style\*="color:#00251e"\]\[style\*="background:#FFD54F" i\] \{\s*color: #00251e !important;/.test(H), null);
t('dunkel: "Angebot" behaelt sein Gold (' + k(hx('#5c4600'), hx('#fed65b')) + ' : 1)',
  /:is\(html, #kmi-glas\)\.dark-mode \.dash-btn-gold \{\s*background: #fed65b !important;\s*color: #5c4600 !important;/.test(H)
  && /class="dash-btn dash-btn-primary dash-btn-gold" onclick="showDashboardSection\('offers'\)"/.test(H), null);
t('dunkel: Kennzahl-Beschriftung 62 % statt 45 % Weiss', /\.dark-mode \.stat-box-label \{[^}]*color: rgba\(255,255,255,0\.62\) !important;/.test(H), null);

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
