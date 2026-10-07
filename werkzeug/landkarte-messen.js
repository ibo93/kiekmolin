// LANDKARTE (HINTERGRUND) IM ECHTEN BROWSER -- Vektorkarte nach dem Entwurf.
//
// Entstanden am 07.10.2026. Ibo: "die map ist immer noch das alte ... nicht
// das andere drum herum" -- gemeint war der Hintergrund. Seitdem malt eine
// Vektorkarte (OpenFreeMap, OpenStreetMap-Daten) mit den Farben des
// Entwurfs; die Esri-Karte liegt darunter und bleibt, wenn die Vektorkarte
// ausfaellt (Regel 6: sonst einfarbige Flaeche ohne Orte).
//
// Gemessen (WebGL per SwiftShader, Bibliotheken aus node_modules):
//   1. Vektorkarte liefert (Probe-Kacheln): Esri weg, Farben des Entwurfs,
//      Quellenhinweis "© OpenStreetMap" sichtbar
//   2. Umschalten hell/dunkel tauscht nur die Farben
//   3. Kartendaten fallen aus (503): nach 8 s bleibt Esri, kein leeres Bild
// GRENZE: echte Strassen/Wasser/Orte sieht das Werkzeug nicht -- der Proxy
// sperrt die Kartendaten. Das zeigt nur ein echtes Geraet bzw. die Vorschau.
// Braucht: npm i --no-save playwright-core leaflet@1.9.4 maplibre-gl@5.24.0 @maplibre/maplibre-gl-leaflet@0.1.4
// AUFRUF   node werkzeug/landkarte-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..'), NM = path.join(WURZEL, 'node_modules');
if (!fs.existsSync(path.join(NM, 'maplibre-gl'))) { console.log('maplibre-gl fehlt (npm i --no-save ...).'); process.exit(0); }
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8889);

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
  for (var fall of ['liefert', 'ausfall']) {
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url();
      var m = u.match(/unpkg\.com\/(leaflet@[^/]+\/dist\/(leaflet\.(js|css))|maplibre-gl@[^/]+\/dist\/(maplibre-gl\.(js|css))|@maplibre\/maplibre-gl-leaflet@[^/]+\/(leaflet-maplibre-gl\.js))$/);
      if (m) { var f = m[2] ? path.join(NM, 'leaflet/dist', m[2]) : m[4] ? path.join(NM, 'maplibre-gl/dist', m[4]) : path.join(NM, '@maplibre/maplibre-gl-leaflet', m[6]); return rt.fulfill({ status: 200, contentType: /\.css$/.test(f) ? 'text/css' : 'application/javascript', body: fs.readFileSync(f) }); }
      if (/tiles\.openfreemap\.org\/planet$/.test(u)) return fall === 'ausfall' ? rt.fulfill({ status: 503, body: 'nein' }) : rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/probe/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, vector_layers: [] }) });
      if (/tiles\.openfreemap\.org\/probe\//.test(u)) return rt.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
      if (/arcgisonline/.test(u)) return rt.fulfill({ status: 404, body: '' });
      return /supabase\.co/.test(u) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function () { window.karteNachSonnenuntergang = function () { return false; }; APP_DATA.restaurants = [{ id: 'a', name: 'A', city: 'Greetsiel', lat: 53.5021, lng: 7.0965, is_active: true, features: [] }, { id: 'b', name: 'B', city: 'Norden', lat: 53.596, lng: 7.206, is_active: true, features: [] }]; openFullscreenMap(); });
    var stand = function () { var c = fullscreenMap.getContainer(), v = fullscreenMap._kmiVektor ? fullscreenMap._kmiEbene.getMaplibreMap() : null; return { webgl: KARTE.webgl(), vektor: !!fullscreenMap._kmiVektor, fehler: !!fullscreenMap._kmiVektorFehler, raster: c.querySelectorAll('img.leaflet-tile').length, gl: c.querySelectorAll('.leaflet-gl-layer').length, hinweis: (c.querySelector('.leaflet-control-attribution') || {}).textContent || '', grund: v ? v.getStyle().layers[0].paint['background-color'] : '', wasser: v ? v.getStyle().layers.filter(function (l) { return l.id === 'wasser'; })[0].paint['fill-color'] : '' }; };
    if (fall === 'liefert') {
      await s.waitForTimeout(5000);
      var a = await s.evaluate(stand);
      pruef('WebGL vorhanden (sonst ist diese Messung leer)', a.webgl, JSON.stringify(a));
      pruef('Vektorkarte liefert: Esri-Kacheln entfernt', a.vektor && a.raster === 0 && !a.fehler, JSON.stringify(a));
      pruef('Farben aus dem Entwurf "Karte hell": Land #ecedeb, Wasser #cdd7da', a.grund === '#ecedeb' && a.wasser === '#cdd7da', JSON.stringify(a));
      pruef('Quellenhinweis OpenStreetMap sichtbar (Lizenz)', /OpenStreetMap/.test(a.hinweis) && /OpenFreeMap/.test(a.hinweis), a.hinweis);
      await s.evaluate(function () { toggleMapStyle(); });
      await s.waitForTimeout(1500);
      var d = await s.evaluate(stand);
      pruef('Umschalten dunkel: Farben aus "Karte dunkel" (#232525 / #181b1d), Nadeln dunkel', d.vektor && d.grund === '#232525' && d.wasser === '#181b1d' && await s.evaluate(function () { return fullscreenMap.getContainer().classList.contains('kd-dunkel'); }), JSON.stringify(d));
      await s.evaluate(function () { toggleMapStyle(); });
      await s.waitForTimeout(1000);
      var h = await s.evaluate(stand);
      pruef('zurück hell', h.grund === '#ecedeb', JSON.stringify(h));
      await s.screenshot({ path: path.join(__dirname, 'ausgabe', 'landkarte-vektor.png') });
    } else {
      await s.waitForTimeout(3000);
      var z = await s.evaluate(stand);
      pruef('Ausfall: in den ersten Sekunden liegt die Esri-Karte da (nie leer)', z.raster > 0 && !z.vektor, JSON.stringify(z));
      await s.waitForTimeout(7000);
      z = await s.evaluate(stand);
      pruef('Ausfall nach 8 s: Esri bleibt, keine leere Vektor-Flaeche darueber, Hinweis Esri', !z.vektor && z.fehler && z.raster > 0 && z.gl === 0 && /Esri/.test(z.hinweis), JSON.stringify(z));
    }
    pruef(fall + ': kein Seitenfehler', !fehler.length, fehler.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.'));
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
