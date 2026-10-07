// KARTE 1:1 NACH DEM ENTWURF "Die Karte – sechs Ideen" (07.10.2026).
//
// Ibo, Bild vom Mac: fast leere graue Flaeche, eine Nadel -- "wo ist die
// karte?"; "wenn ich drauf klicke ... kommt nichts"; dann "ich will die
// karte die du erstellt hast" (Claude Design). Gemessen, was fehlte:
//  - "Mehrere": fuenf Lokale in Greetsiel lagen genau uebereinander -> man
//    sah EINE Nadel. Jetzt Kreis mit Zahl (karteGruppieren).
//  - Start auf dem MITTELWERT aller Lokale (Zoom 15) = freies Land.
//    Jetzt fitBounds ueber alle aktiven, zwischen Leiste und Zeitregler.
//  - Nadel: eigene Nachbildung -> jetzt Tropfen-Form und Zeichen 1:1.
//  - Tipp: Blatt unten mit Fakten, freien Zeiten, Route; Name oeffnet.
//
// Gegenprobe (jede rot): Gruppier-Abstand 0, Gruppen auch ab Zoom 16,
// gewaehltes Lokal mitgruppiert, setView auf die Mitte, Spitze nicht auf dem
// Ort (iconAnchor h/2), freie Zeiten auch aus der Vergangenheit.
// Im Browser: werkzeug/karte-messen.js (72 Pruefungen).
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } return ''; }

var aufruf = null;
var karte = { getContainer: function () { return { getBoundingClientRect: function () { return { top: 0, bottom: 844, height: 844 }; } }; },
              fitBounds: function (b, o) { aufruf = { b: b, o: o }; }, setView: function (p, z) { aufruf = { setView: p, z: z }; } };
var el = { karteLeiste: { getBoundingClientRect: function () { return { bottom: 120 }; } },
           fullscreenMapCard: { style: { display: 'none' }, getBoundingClientRect: function () { return { top: 400, height: 444 }; } },
           karteZeitKarte: { style: { display: '' }, getBoundingClientRect: function () { return { top: 520, height: 210 }; } } };
var sb = { Math: Math, String: String, L: { latLngBounds: function (p) { return p; }, divIcon: function (o) { return o; } },
           document: { getElementById: function (id) { return el[id] || null; } }, window: {},
           escapeHtml: function (x) { return String(x).replace(/</g, '&lt;'); },
           kuechenListe: function (r) { return r.k || ''; } };
vm.createContext(sb);
var a = H.indexOf('var KARTE_TROPFEN'), b = H.indexOf('function karteArt(');
vm.runInContext(H.slice(a, b) + ['karteArt', 'karteZeichen', 'karteSchild', 'karteNadel', 'karteGruppe', 'karteGruppieren', 'karteAufAlle'].map(fn).join('\n'), sb);

// --- Alle im Bild ---
var liste = [{ lat: 53.50, lng: 7.10 }, { lat: 53.65, lng: 7.43 }, { lat: 53.60, lng: 7.21 }];
sb.karteAufAlle(karte, liste, 53.58, 7.25);
t('mehrere Lokale: fitBounds ueber ALLE Punkte, kein setView auf die Mitte', aufruf && aufruf.b && aufruf.b.length === 3 && !aufruf.setView, JSON.stringify(aufruf));
t('... unter der Leiste und ueber dem Zeitregler (Blatt zu)', aufruf.o.paddingTopLeft[1] === 144 && aufruf.o.paddingBottomRight[1] === 844 - 520 + 32 && aufruf.o.maxZoom === 15, JSON.stringify(aufruf.o));
el.fullscreenMapCard.style.display = 'flex';
sb.karteAufAlle(karte, liste, 53.58, 7.25);
t('... bei offenem Blatt ueber dem Blatt', aufruf.o.paddingBottomRight[1] === 844 - 400 + 32, JSON.stringify(aufruf.o));
var init = fn('initFullscreenMap');
t('Start: nur aktive Lokale, karteAufAlle statt Mittelwert-setView', /r\.is_active !== false; \}\)/.test(init) && /karteAufAlle\(fullscreenMap, restWithCoords, initLat, initLng\)/.test(init) && !/setView\(\[initLat, initLng\], restWithCoords\.length > 1 \? 15 : 16\)/.test(init), '');

// --- Nadel 1:1 ---
var offen = sb.karteNadel({ name: 'Börse', k: 'Fisch', cuisine_type: ['fisch'] }, { art: 'offen', bis: '22:00', text: 'Offen bis 22:00' }, false);
var zu = sb.karteNadel({ name: 'Teestube', cuisine_type: ['cafe'] }, { art: 'zu', text: 'Geschlossen' }, false);
var gew = sb.karteNadel({ name: 'Börse', cuisine_type: ['fisch'] }, { art: 'offen', bis: '22:00', text: 'Offen bis 22:00' }, true);
var akt = sb.karteNadel({ name: 'Lounge', cuisine_type: ['shisha'] }, { art: 'aktion', bis: '02:00', text: 'Offen bis 02:00', aktion: { titel: 'Happy Hour' } }, false);
t('Tropfen-Form 1:1 aus dem Entwurf', offen.html.indexOf('d="M20 50C20 50 4 33 4 19a16 16 0 1 1 32 0c0 14-16 31-16 31z"') > -1, offen.html.slice(0, 200));
t('Groessen wie im Entwurf: offen 40x52, zu 28x36, gewaehlt 52x68', offen.iconSize.join() === '40,52' && zu.iconSize.join() === '28,36' && gew.iconSize.join() === '52,68', [offen.iconSize, zu.iconSize, gew.iconSize].join(' / '));
t('Spitze steht auf dem Ort (iconAnchor unten Mitte)', offen.iconAnchor.join() === '20,51' && zu.iconAnchor.join() === '14,35', offen.iconAnchor.join());
t('Schild "Fisch · bis 22" / "Café · zu"; Aktion als Schild darueber', /class="kd-schild">Fisch · bis 22</.test(offen.html) && /class="kd-schild">Café · zu</.test(zu.html) && /class="kd-badge">Happy Hour</.test(akt.html) && !/kd-schild/.test(akt.html), '');
t('Zeichen = Art (Fisch, Café, Bar aus dem Entwurf), gewaehlt mit Hof', offen.html.indexOf('M10 19c3-4.5') > -1 && zu.html.indexOf('M12 15h11v5') > -1 && akt.html.indexOf('M12 12h16l-8 9z') > -1 && /kd-hof/.test(gew.html), '');
t('Vorleser: Name und Zustand', /aria-label="Börse, Offen bis 22:00"/.test(offen.html), '');

// --- Mehrere ---
var p = function (x, y, fest) { return { x: x, y: y, fest: !!fest }; };
var g = sb.karteGruppieren([p(100, 100), p(110, 105), p(120, 100), p(300, 300)], 13);
t('nah beieinander (< 40 px) -> eine Gruppe, weit weg -> eigene', g.length === 2 && g[0].liste.length === 3 && g[1].liste.length === 1, JSON.stringify(g.map(function (x) { return x.liste.length; })));
t('ab Zoom 16 nie gruppieren', sb.karteGruppieren([p(100, 100), p(101, 101)], 16).length === 2, '');
t('das gewaehlte Lokal wird nie in einen Kreis gesteckt (egal an welcher Stelle)', sb.karteGruppieren([p(100, 100, true), p(105, 100), p(108, 100)], 13).map(function (x) { return x.liste.length; }).join() === '1,2'
  && sb.karteGruppieren([p(105, 100), p(108, 100), p(100, 100, true)], 13).map(function (x) { return x.liste.length; }).join() === '2,1', '');
t('Kreis mit Zahl, 44 px, antippbar', /class="kd-mehrere" role="button"[^>]*>5</.test(sb.karteGruppe(5).html) && sb.karteGruppe(5).iconSize.join() === '44,44', '');

// --- Blatt ---
var card = fn('_updateMapFloatingCard'), frei = fn('karteFreieZeiten');
t('Name / "Zum Lokal" oeffnen die Seite des Lokals', /\['mapCardImage', 'mapCardName'\]\.forEach/.test(card) && /closeModal\('fullscreenMapModal'\); openRestaurantBySlug\(r\.slug \|\| r\.id\)/.test(card), '');
t('freie Zeiten: nur kuenftige, Fehler -> nichts (kein Raten), ohne Tischplan "Heute reservierbar"', /s\.time > jetzt/.test(frei) && /catch\(function \(\) \{ \/\* nicht pruefbar/.test(frei) && /'Heute reservierbar'/.test(frei), '');
t('Route zum Lokal, X schliesst, Tipp auf freie Karte schliesst', /maps\/dir\/\?api=1&destination=/.test(card) && /addEventListener\('click', karteBlattZu\)/.test(fn('karteVerbinden')) && /fullscreenMap\.on\('click', function \(\) \{ if \(window\._mapAktivId\) karteBlattZu\(\); \}\)/.test(init), '');
t('Markup: Suche oben, Seitenleiste, Zeitregler unten, Blatt', /class="kd-oben" id="karteLeiste"/.test(H) && /class="kd-seite"/.test(H) && /class="kd-zeit" id="karteZeitKarte"/.test(H) && /id="fullscreenMapCard" class="kd-blatt"/.test(H), '');

console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
