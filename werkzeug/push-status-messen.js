// BENACHRICHTIGUNGEN: STATUS-KARTE -- im echten Browser.
//
// Ibo, 14.10.2026: im Dashboard muss stehen, ob Benachrichtigungen
// ankommen, mit "Test senden". Misst: Text bei 2 Geraeten / 0 Geraeten /
// Fehler, Test-Knopf meldet "an 2 von 2", Kontrast hell und dunkel, Handy.
// push-status beantwortet das Werkzeug selbst.
// AUFRUF   node werkzeug/push-status-messen.js
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8899);
var RID = '22222222-2222-4222-8222-222222222222';

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
  var KONTRAST = function (sel) {
    function rgb(c) { var m = String(c).match(/[\d.]+/g) || [0, 0, 0, 1]; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; }
    function lum(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
    var el = document.querySelector(sel); if (!el) return 0;
    var fg = rgb(getComputedStyle(el).color), bg = null;
    for (var q = el; q; q = q.parentElement) { var c = rgb(getComputedStyle(q).backgroundColor); if (c.a > 0.5) { bg = c; break; } }
    bg = bg || { r: 255, g: 255, b: 255 }; var a = lum(fg), z = lum(bg); return Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 10) / 10;
  };

  async function seite(breite, dunkel, status) {
    var ctx = await b.newContext({ viewport: { width: breite, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} }, !!dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { return /supabase\.co/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort(); });
    var anfragen = [];
    await ctx.route(/\/\.netlify\/functions\/push-status/, function (rt) {
      var rq = rt.request(); anfragen.push({ m: rq.method(), auth: rq.headers().authorization || '' });
      if (rq.method() === 'POST') return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, gesendet: 2, von: 2 }) });
      return rt.fulfill({ status: status.code || 200, contentType: 'application/json', body: JSON.stringify(status.body) });
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function (rid) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #cartPanel, .cart-panel, #cartOverlay, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      APP_DATA.restaurants = [{ id: rid, name: 'Lütt Italia' }];
      window._gastroOnlyRestaurantId = rid;
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var k = document.getElementById('pushStatusKarte');
      for (var q = k; q && q !== document.body; q = q.parentElement) if (getComputedStyle(q).display === 'none') q.style.setProperty('display', 'block', 'important');
      document.querySelectorAll('.dash-section').forEach(function (x) { if (!x.contains(k)) x.style.setProperty('display', 'none', 'important'); });
      document.querySelectorAll('.res-tab-content').forEach(function (x) { if (!x.contains(k)) x.style.setProperty('display', 'none', 'important'); });
      k.scrollIntoView({ block: 'center' });
      pushStatusLaden();
    }, RID);
    await s.waitForTimeout(500);
    return { s: s, ctx: ctx, fehler: fehler, anfragen: anfragen };
  }

  var p = await seite(1180, false, { body: { ok: true, vapid: true, geraete: 2, letzte: new Date(Date.now() - 3600000).toISOString() } });
  var txt = await p.s.textContent('#pushStatusText');
  pruef('2 Geräte: "✓ Aktiv auf 2 Geräten · letzte Meldung heute …"', /✓ Aktiv auf 2 Geräten · letzte Meldung (heute|gestern) \d\d:\d\d/.test(txt), txt);
  pruef('fragt mit Anmeldung (Bearer)', p.anfragen[0] && /^Bearer /.test(p.anfragen[0].auth), JSON.stringify(p.anfragen));
  await p.s.click('#pushTestKnopf'); await p.s.waitForTimeout(500);
  var test = await p.s.textContent('#pushStatusTest');
  pruef('Test senden: "Test an 2 von 2 Geräten gesendet – kommt er auf dem Handy an?"', /Test an 2 von 2 Geräten gesendet/.test(test), test);
  for (var sel of ['#pushStatusText', '#pushStatusTest', '#pushStatusKarte p:last-child']) {
    var k = await p.s.evaluate(KONTRAST, sel); pruef('Kontrast hell ' + sel + ' >= 4.5', k >= 4.5, k);
  }
  await (await p.s.$('#pushStatusKarte')).screenshot({ path: path.join(AUS, 'push-status-hell.png') });
  pruef('keine JS-Fehler', p.fehler.length === 0, p.fehler.join(' | '));
  await p.ctx.close();

  var q = await seite(1180, false, { body: { ok: true, vapid: true, geraete: 0, letzte: null } });
  txt = await q.s.textContent('#pushStatusText');
  var farbe = await q.s.evaluate(KONTRAST, '#pushStatusText');
  pruef('0 Geräte: Warnung in Rot, lesbar', /Kein Gerät angemeldet/.test(txt) && farbe >= 4.5, txt + ' ' + farbe);
  await q.ctx.close();

  var f = await seite(1180, false, { code: 403, body: { ok: false, error: 'Kein Zugriff auf dieses Lokal' } });
  txt = await f.s.textContent('#pushStatusText');
  pruef('Fehler: wird gesagt, nicht leer', /Status nicht abrufbar \(Kein Zugriff/.test(txt), txt);
  await f.ctx.close();

  var d = await seite(390, true, { body: { ok: true, vapid: true, geraete: 1, letzte: null } });
  txt = await d.s.textContent('#pushStatusText');
  pruef('Handy dunkel: "✓ Aktiv auf 1 Gerät · noch keine Meldung verschickt"', /Aktiv auf 1 Gerät · noch keine Meldung/.test(txt), txt);
  for (var sel2 of ['#pushStatusText', '#pushStatusKarte p:last-child']) {
    var kd = await d.s.evaluate(KONTRAST, sel2); pruef('Kontrast dunkel ' + sel2 + ' >= 4.5', kd >= 4.5, kd);
  }
  var breit = await d.s.evaluate(function () { var k = document.getElementById('pushStatusKarte'); return Math.round(k.scrollWidth) + '/' + Math.round(k.clientWidth); });
  pruef('Handy: nichts ragt heraus', +breit.split('/')[0] <= +breit.split('/')[1] + 1, breit);
  await (await d.s.$('#pushStatusKarte')).screenshot({ path: path.join(AUS, 'push-status-handy-dunkel.png') });
  await d.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Messungen ROT.' : 'Alle ' + n + ' Messungen gruen.') + '  Bilder: werkzeug/ausgabe/push-status-*.png');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
