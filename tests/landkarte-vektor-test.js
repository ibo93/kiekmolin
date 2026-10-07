// LANDKARTE NACH DEM ENTWURF (07.10.2026): Vektorkarte mit den Farben aus
// "Karte hell" / "Karte dunkel", deutsche Namen, Esri als Rueckfall.
//
// Ibo: "die map ist immer noch das alte ... nicht das andere drum herum".
// Fertige Kachelbilder lassen sich nicht umfaerben -- darum OpenFreeMap
// (OpenStreetMap-Daten) + eigener Stil. Im Browser: werkzeug/landkarte-messen.js.
//
// Gegenprobe (jede rot): Farben vertauscht, name:de raus, Esri sofort
// entfernt statt erst nach Daten, Rueckfall-Uhr weg, Quellenhinweis weg.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
var a = H.indexOf('var KARTE = {'), b = H.indexOf('window.KARTE = KARTE;');
var sb = { window: {}, document: { body: { classList: { contains: function () { return false; } } } }, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, String: String };
vm.createContext(sb);
vm.runInContext(H.slice(a, b) + '\nthis.KARTE = KARTE;', sb);
var K = sb.KARTE;
var hell = K.stil(false), dunkel = K.stil(true);
function lage(stil, id) { return stil.layers.filter(function (l) { return l.id === id; })[0] || {}; }
t('hell = Entwurf "Karte hell": Land #ecedeb, Wasser #cdd7da, Gruen #e1e9df, Strasse weiss mit Rand #d6d9d8',
  lage(hell, 'land').paint['background-color'] === '#ecedeb' && lage(hell, 'wasser').paint['fill-color'] === '#cdd7da' && lage(hell, 'park').paint['fill-color'] === '#e1e9df' && lage(hell, 'strasse').paint['line-color'] === '#ffffff' && lage(hell, 'strasse-rand').paint['line-color'] === '#d6d9d8', '');
t('dunkel = Entwurf "Karte dunkel": Land #232525, Wasser #181b1d, Orte #b9c0be', lage(dunkel, 'land').paint['background-color'] === '#232525' && lage(dunkel, 'wasser').paint['fill-color'] === '#181b1d' && lage(dunkel, 'ort').paint['text-color'] === '#b9c0be', '');
t('Ortsnamen deutsch zuerst (name:de), sonst Originalname', JSON.stringify(lage(hell, 'ort').layout['text-field']) === JSON.stringify(['coalesce', ['get', 'name:de'], ['get', 'name_de'], ['get', 'name']]), JSON.stringify(lage(hell, 'ort').layout['text-field']));
t('Wassernamen kursiv wie im Entwurf ("Nordsee · Watt")', lage(hell, 'wassername').layout['text-font'][0] === 'Noto Sans Italic' && lage(hell, 'wassername').paint['text-color'] === '#3f5357', '');
t('Quelle OpenFreeMap (kein Konto), feste Bibliotheks-Versionen', K.VEKTOR_QUELLE === 'https://tiles.openfreemap.org/planet' && /maplibre-gl@5\.24\.0/.test(K.VEKTOR_JS) && /maplibre-gl-leaflet@0\.1\.4/.test(K.BRUECKE_JS), '');
var v = H.slice(H.indexOf('vektor: function (karte, dunkel) {'), H.indexOf('dunkelSetzen: function'));
t('Esri bleibt liegen, bis die Vektorkarte eine echte Kachel hat (e.tile), erst dann weg', /!e\.isSourceLoaded \|\| !e\.tile\) return;/.test(v) && /karte\.removeLayer\(alt\)/.test(v) && v.indexOf('karte.removeLayer(alt)') > v.indexOf('!e.tile'), '');
t('Rueckfall: nach VEKTOR_WARTEN (8 s) oder Quellenfehler Vektor weg, Esri bleibt', K.VEKTOR_WARTEN === 8000 && /setTimeout\(aufgeben, KARTE\.VEKTOR_WARTEN\)/.test(v) && /e\.sourceId === 'omt'/.test(v), '');
t('ohne WebGL gar nicht erst laden', /if \(!KARTE\.webgl\(\)\) return schief/.test(H), '');
t('Quellenhinweis OSM wird eingetragen (Lizenz)', /attributionControl\.addAttribution\(KARTE\.VEKTOR_HINWEIS\)/.test(v) && /OpenStreetMap/.test(K.VEKTOR_HINWEIS), '');
t('hell/dunkel: bei Vektorkarte nur den Stil tauschen', /getMaplibreMap\(\)\.setStyle\(KARTE\.stil\(dunkel\)\)/.test(H), '');
t('jede Karte bekommt den Versuch (KARTE.ebene)', /if \(karte\.whenReady\) karte\.whenReady\(function \(\) \{ if \(karte\._kmiEbene === raster\) KARTE\.vektor\(karte, d\); \}\);/.test(H), '');
t('Messwerkzeug liegt bei', fs.existsSync(path.join(__dirname, '..', 'werkzeug', 'landkarte-messen.js')), '');
console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
process.exit(ok === n ? 0 : 1);
