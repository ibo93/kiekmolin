// GERADE BEI UNS -- im echten Browser: wie sieht der Hinweis aus, ist er lesbar?
//
// Entstanden am 07.10.2026. Laedt index.html, setzt bei einem Lokal
// "andrang:voll:<in 1 h>" und misst auf Startseiten-Leiste, Restaurantkarte,
// Lokalseite und im Dashboard-Schalter den Kontrast (hell und dunkel).
// Supabase beantwortet das Werkzeug selbst (der Proxy sperrt es).
// GRENZE: kein echtes Geraet, keine echte Datenbank.
// AUFRUF   node werkzeug/andrang-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8885);

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
  var KONTRAST = function (sel) {
    function farbe(c) { var m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; }
    function L(f) { return [f.r, f.g, f.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
    function grund(e) { while (e) { var f = farbe(getComputedStyle(e).backgroundColor); if (f.a > 0.9) return f; e = e.parentElement; } return { r: 255, g: 255, b: 255 }; }
    return Array.prototype.map.call(document.querySelectorAll(sel), function (e) {
      var a = L(farbe(getComputedStyle(e).color)), c = L(grund(e));
      return { t: e.textContent.trim().slice(0, 40), k: +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2), sichtbar: e.getBoundingClientRect().width > 0 };
    });
  };
  for (var dunkel of [false, true]) {
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); } catch (e) {} }, dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { return /supabase\.co/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort(); });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    var w = dunkel ? 'dunkel' : 'hell';
    var erg = await s.evaluate(function () {
      var bis = new Date(Date.now() + 3600000).toISOString();
      window.checkIfOpen = function () { return true; };
      APP_DATA.restaurants = [
        { id: 'a1', name: 'Hafenkneipe', city: 'Greetsiel', is_active: true, features: ['andrang:voll:' + bis], cuisine_type: ['Fisch'] },
        { id: 'a2', name: 'Teestube', city: 'Greetsiel', is_active: true, features: ['andrang:warten:' + bis] },
        { id: 'a3', name: 'Café Ruh', city: 'Greetsiel', is_active: true, features: ['andrang:ruhig:' + bis] }
      ];
      try { heuteAbendZeichnen(); } catch (e) { return 'heuteAbend: ' + e.message; }
      var box = document.createElement('div'); box.id = 'probeLp'; box.innerHTML = lpVisitenkarte(APP_DATA.restaurants[0], true, '22:00') + lpVisitenkarte(APP_DATA.restaurants[1], true, '22:00') + lpVisitenkarte(APP_DATA.restaurants[2], true, '22:00');
      box.style.cssText = 'padding:16px;background:var(--bg-primary, #fff)'; document.getElementById('heuteAbend').after(box);
      return document.querySelectorAll('#heuteAbendReihe .kmi-andrang').length + '/' + box.querySelectorAll('.kmi-andrang').length;
    });
    pruef(w + ': Hinweis in Leiste (3) und Lokalseite (3)', erg === '3/3', erg);
    var k = await s.evaluate(KONTRAST, '.kmi-andrang');
    var schlecht = k.filter(function (x) { return x.sichtbar && x.k < 4.5; });
    pruef(w + ': alle ' + k.length + ' Hinweise lesbar (>= 4,5)', !schlecht.length, JSON.stringify(schlecht));
    // Teilmengen-Schrift: fehlt ein Zeichen, steht das WORT da (breit). Ein Zeichen ist ~15 px.
    var breit = await s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.kmi-andrang .material-symbols-outlined'), function (e) { return e.textContent + ':' + Math.round(e.getBoundingClientRect().width); }).filter(function (x) { return +x.split(':')[1] > 24; }); });
    pruef(w + ': jedes Symbol ist ein Zeichen, kein Wort', !breit.length, breit.join(', '));
    await s.evaluate(function () { document.getElementById('heuteAbend').scrollIntoView(); });
    await s.screenshot({ path: path.join(__dirname, 'ausgabe', 'andrang-' + w + '.png') });
    pruef(w + ': kein Seitenfehler', !fehler.length, fehler.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
