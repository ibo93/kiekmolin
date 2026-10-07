// LADEZEIT BEIM ERSTEN BESUCH -- IM ECHTEN BROWSER, MIT LANGSAMEM HANDY.
//
// Entstanden am 06.10.2026 bei "schneller laden". Misst, wie lange ein Gast
// beim allerersten Oeffnen wartet: so, wie es ein Mittelklasse-Handy auf dem
// Land erlebt (Netz "Slow 4G": 1,6 Mbit/s, 150 ms Laufzeit; Rechner 4x
// gebremst -- dieselben Werte wie Lighthouse fuer Mobilgeraete).
//
// Die Seite wird gzip-komprimiert ausgeliefert, wie bei Netlify.
//
// GRENZEN (ehrlich): externe Bibliotheken (Supabase, Leaflet, DOMPurify) sperrt
// hier der Proxy -- sie fehlen in der Messung, ein echter Erstbesuch laedt sie
// zusaetzlich. Kein echtes Geraet, keine echten Daten.
//
// AUFRUF   node werkzeug/ladezeit-messen.js [datei]
// Laeuft nicht in run-all (braucht Chromium).
'use strict';
var path = require('path'), fs = require('fs'), http = require('http'), zlib = require('zlib');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8881);
var TYP = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

(async function () {
  var gesendet = 0;
  var srv = http.createServer(function (q, r) {
    var p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!f.startsWith(WURZEL) && f !== DATEI || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    var roh = fs.readFileSync(f), ext = path.extname(f);
    var gz = /\.(html|js|css|json|svg)$/.test(f) ? zlib.gzipSync(roh, { level: 6 }) : null;
    var daten = gz || roh; gesendet += daten.length;
    var kopf = { 'Content-Type': TYP[ext] || 'application/octet-stream', 'Content-Length': daten.length };
    if (gz) kopf['Content-Encoding'] = 'gzip';
    r.writeHead(200, kopf); r.end(daten);
  }).listen(PORT);

  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var laeufe = [];
  for (var lauf = 0; lauf < 3; lauf++) {
    gesendet = 0;
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { rt.abort(); });
    var s = await ctx.newPage(); s.on('pageerror', function () {});
    var cdp = await ctx.newCDPSession(s);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1638.4 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load', timeout: 120000 });
    await s.waitForTimeout(1500);
    var m = await s.evaluate(function () {
      var nav = performance.getEntriesByType('navigation')[0];
      var fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
      return { html: nav.responseEnd, fcp: fcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
    });
    var met = (await cdp.send('Performance.getMetrics')).metrics;
    var w = {}; met.forEach(function (x) { w[x.name] = x.value; });
    m.skript = w.ScriptDuration * 1000; m.layout = (w.LayoutDuration + w.RecalcStyleDuration) * 1000; m.kb = gesendet / 1024;
    laeufe.push(m); await ctx.close();
  }
  await b.close(); srv.close();
  function mitte(k) { var v = laeufe.map(function (x) { return x[k]; }).sort(function (a, c) { return a - c; }); return v[1]; }
  function s_(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
  console.log('Erstbesuch, Slow 4G + Rechner 4x gebremst, Mitte aus 3 Laeufen  (' + path.basename(DATEI) + ')');
  console.log('  uebertragen          ' + Math.round(mitte('kb')) + ' KB (gzip, ohne externe Bibliotheken)');
  console.log('  Seite angekommen     ' + s_(mitte('html')));
  console.log('  erstes Bild (FCP)    ' + s_(mitte('fcp')));
  console.log('  bereit (DOMContent)  ' + s_(mitte('dcl')));
  console.log('  fertig geladen       ' + s_(mitte('load')));
  console.log('  davon Skript         ' + s_(mitte('skript')));
  console.log('  davon Stil/Layout    ' + s_(mitte('layout')));
})().catch(function (e) { console.error(e); process.exit(1); });
