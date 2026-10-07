// KARTE: NADELN WIE FRUEHER, TIPPEN OEFFNET, ALLE LOKALE IM BILD (07.10.2026).
//
// Ibo nach dem Karten-Umbau (Bild vom Mac, 09:30): fast leere graue Flaeche,
// eine Nadel -- "wo ist die karte?"; dann: "wenn ich drauf klicke ... kommt
// nichts, sieht komisch aus ... frueher mit den Nadeln war es besser".
//
//  1. Die Karte setzte sich auf den MITTELWERT aller Lokale (Zoom 15). In
//     verschiedenen Orten ist das freies Land. Jetzt fitBounds ueber die
//     aktiven Lokale, unter der Leiste, ueber der Karte unten.
//  2. Nadel wieder rund, gold mit Besteck; gewaehlt dunkelgruen mit Stern.
//  3. Tipp auf Foto/Name in der Karte unten oeffnet die Seite des Lokals.
//
// Gegenprobe (jede rot): setView auf den Mittelwert zurueck, inaktive Lokale
// wieder mitgezaehlt, Tropfen-Nadel zurueck, onclick an Name/Foto entfernt.
// Im Browser: werkzeug/karte-messen.js (54 Pruefungen, Fall "3 Orte").
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var aufruf = null;
var karte = { getContainer: function () { return { getBoundingClientRect: function () { return { top: 0, bottom: 844, height: 844 }; } }; },
              fitBounds: function (b, o) { aufruf = { b: b, o: o }; }, setView: function (p, z) { aufruf = { setView: p, z: z }; } };
var el = { karteLeiste: { getBoundingClientRect: function () { return { bottom: 270 }; } },
           fullscreenMapCard: { style: { display: '' }, getBoundingClientRect: function () { return { top: 575, height: 180 }; } } };
var sb = { Math: Math, L: { latLngBounds: function (p) { return p; }, divIcon: function (o) { return o; } },
           document: { getElementById: function (id) { return el[id] || null; } }, window: {},
           escapeHtml: function (x) { return String(x).replace(/</g, '&lt;'); } };
vm.createContext(sb);
vm.runInContext(fn('karteAufAlle') + fn('karteNadel'), sb);

var liste = [{ lat: 53.50, lng: 7.10 }, { lat: 53.65, lng: 7.43 }, { lat: 53.60, lng: 7.21 }];
sb.karteAufAlle(karte, liste, 53.58, 7.25);
t('mehrere Lokale: fitBounds ueber ALLE Punkte, kein setView auf die Mitte', aufruf && aufruf.b && aufruf.b.length === 3 && !aufruf.setView, JSON.stringify(aufruf));
t('... unter der Leiste (oben >= 270 + 24) und ueber der Karte unten', aufruf.o.paddingTopLeft[1] === 294 && aufruf.o.paddingBottomRight[1] === 844 - 575 + 32, JSON.stringify(aufruf.o));
t('... hoechstens Zoom 15, rechts Platz fuer die Seitenknoepfe', aufruf.o.maxZoom === 15 && aufruf.o.paddingBottomRight[0] >= 64, JSON.stringify(aufruf.o));
sb.karteAufAlle(karte, [liste[0]], 53.5, 7.1);
t('ein Lokal: setView Zoom 16 darauf', aufruf.setView && aufruf.z === 16, JSON.stringify(aufruf));
var init = fn('initFullscreenMap');
t('Start: nur aktive Lokale, und am Ende karteAufAlle statt setView auf den Mittelwert',
  /filter\(function\(r\) \{ return r\.lat && r\.lng && r\.is_active !== false; \}\)/.test(init) && /karteAufAlle\(fullscreenMap, restWithCoords, initLat, initLng\)/.test(init) && !/setView\(\[initLat, initLng\], restWithCoords\.length > 1 \? 15 : 16\)/.test(init), '');

var i1 = sb.karteNadel({ name: 'Börse' }, { text: 'Geschlossen' }, false), i2 = sb.karteNadel({ name: 'Börse' }, { text: 'Geschlossen' }, true);
t('Nadel wie frueher: rund, Besteck, 44 px', /class="kn-punkt"/.test(i1.html) && />restaurant</.test(i1.html) && i1.iconSize[0] === 44 && i1.iconAnchor[1] === 22, JSON.stringify(i1));
t('gewaehlt: Stern, 56 px', /kn-punkt gewaehlt/.test(i2.html) && />star</.test(i2.html) && i2.iconSize[0] === 56, JSON.stringify(i2));
t('Vorleser: Name und Zustand im aria-label', /aria-label="Börse, Geschlossen"/.test(i1.html), i1.html);
t('Farben wie frueher: gold #fed65b / Besteck #735c00, gewaehlt #00251e / Stern gold, ohne Schatten',
  /\.kn-punkt \{[^}]*background: #fed65b; color: #735c00;[^}]*\}/.test(H) && /\.kn-punkt\.gewaehlt \{[^}]*background: #00251e; color: #fed65b;/.test(H) && !/\.kn-punkt[^{]*\{[^}]*box-shadow/.test(H), '');

var card = fn('_updateMapFloatingCard');
t('Tipp auf Foto/Name/Zeile oeffnet die Lokalseite', /\['mapCardImage', 'mapCardName', 'mapCardMeta'\]\.forEach/.test(card) && /closeModal\('fullscreenMapModal'\); openRestaurantBySlug\(r\.slug \|\| r\.id\)/.test(card) && /e\.onclick = _oeffne/.test(card), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
