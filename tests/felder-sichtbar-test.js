// FELDER SICHTBAR (07.10.2026).
//
// Ibo, Foto vom Handy: beim Reservieren sah man Name, Telefon, E-Mail,
// Uhrzeiten und Gaestezahl nicht -- weiss auf weiss. Der Glas-Umbau hatte
// die Fenster deckend gemacht, Felder und Knoepfe darin blieben halb
// durchsichtig weiss. Gemessen mit werkzeug/felder-messen.js im Browser:
// Reservierung hell 50 von 53 unsichtbar, dunkel 33 von 59 -> jetzt 0 / 0.
//
// Dieser Test prueft die Regel im Quelltext; die eigentliche Messung macht
// das Werkzeug (braucht Chromium, laeuft nicht in run-all).
// Gegenprobe (jede rot): Block entfernt, Ausnahme fuer weisse Schrift
// entfernt (Felder auf der dunkelgruenen Steuerungs-Karte wuerden hellgrau
// mit weisser Schrift), ":not(.selected)" entfernt (gewaehlte Uhrzeit
// verloere ihr Dunkelgruen), 0.4 aus der Liste (Kalendertage).
'use strict';
var fs = require('fs'), path = require('path');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
var a = H.indexOf('/* FELDER SICHTBAR (07.10.2026)'), b = H.indexOf('/* KLEINE MOMENTE (06.10.2026)', a);
var B = a > 0 && b > a ? H.slice(a, b) : '';
t('Block vorhanden', B.length > 500, a + '/' + b);
var hell = B.split('body.dark-mode')[0];
t('hell: Felder mit eigener Flaeche und Rand', /background-color: #f4f6f5 !important;[\s\S]*?border: 1px solid #b9c3bf !important;/.test(hell), '');
t('hell: Felder auf dunkler Karte (weisse Schrift) ausgenommen', /:not\(\[style\*="color:white"\]\):not\(\[style\*="color: white"\]\)/.test(hell), '');
t('Uhrzeit: nur nicht gewaehlte bekommen die helle Flaeche', /#reservationModal :is\(\.slot-btn:not\(\.selected\), \.modal-close\)/.test(B), '');
t('Kalendertage (rgba 0.4 im HTML) werden erfasst', /\[style\*="background:rgba\(255,255,255,0\.4\)"\]/.test(B), '');
t('Knoepfe: Flaeche, die sich abhebt (#e9edeb), Rand als outline (keine Schatten-Regel im Weg)', /background: #e9edeb !important;\s*outline: 1px solid #ccd5d1 !important;/.test(B), '');
t('nur in Fenstern und im Dashboard -- ueber Fotos bleibt Glas', (B.match(/:is\(\.modal, \.modal-content, \.dashboard-view\)/g) || []).length >= 6, '');
t('dunkel: eigene Farben fuer Felder und Knoepfe', /body\.dark-mode [\s\S]*?background-color: #262a29 !important;/.test(B) && /body\.dark-mode [\s\S]*?background: #2b302e !important;/.test(B), '');
t('Fokus sichtbar (dunkelgruener Rand)', /:focus \{\s*border-color: #003d33 !important;/.test(B), '');
t('Messwerkzeug liegt bei', fs.existsSync(path.join(__dirname, '..', 'werkzeug', 'felder-messen.js')), '');
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
