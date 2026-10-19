// BESTELLSEITE ANSEHEN -- Handy und Rechner, mit Probe-Speisekarte.
//
// Ibo, 19.10.2026: "Bestellseite auch aendern, guck was wir aendern
// koennen, was optimal waere". Erst messen, dann bauen: oeffnet die
// Speisekarte zum Bestellen (openMenuModal) im echten Browser, legt ein
// Gericht in den Korb und macht Bilder. Misst, was das Auge uebersieht:
// ragt etwas seitlich heraus, wie viele Gerichte sieht man auf dem ersten
// Bildschirm, wie gross sind die Tippflaechen, wo ist der Korb.
// Supabase beantwortet das Werkzeug selbst (der Proxy sperrt es).
// AUFRUF   node werkzeug/bestellseite-ansehen.js [name]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var W = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe', 'bestellseite'); fs.mkdirSync(AUS, { recursive: true });
var NAME = process.argv[2] || 'jetzt';
var RID = '11111111-1111-4111-8111-111111111111';
var KAT = [{ id: 'c1', restaurant_id: RID, name: 'Pizza', sort_order: 1 }, { id: 'c2', restaurant_id: RID, name: 'Pasta', sort_order: 2 }, { id: 'c3', restaurant_id: RID, name: 'Desserts', sort_order: 3 }];
var ITEMS = [];
[['Pizza Margherita', 'c1', 9.5], ['Pizza Diavola', 'c1', 12.9], ['Pizza Tonno', 'c1', 11.9], ['Tagliatelle al Ragù', 'c2', 14.5], ['Spaghetti Carbonara', 'c2', 13.5], ['Penne Arrabbiata', 'c2', 11.5], ['Tiramisù', 'c3', 6.9], ['Panna Cotta', 'c3', 5.9]].forEach(function (g, i) {
  ITEMS.push({ id: 'i' + i, restaurant_id: RID, category_id: g[1], name: g[0], description: 'Frisch zubereitet mit Zutaten aus der Region', base_price: g[2], price: g[2], is_available: true, sort_order: i });
});
var REST = { id: RID, name: 'Die Millis', city: 'Emden', street: 'Auricher Straße 150', is_active: true, features: ['delivery', 'pickup'], opening_hours: { mo_start: '00:00', mo_end: '23:59', di_start: '00:00', di_end: '23:59', mi_start: '00:00', mi_end: '23:59', do_start: '00:00', do_end: '23:59', fr_start: '00:00', fr_end: '23:59', sa_start: '00:00', sa_end: '23:59', so_start: '00:00', so_end: '23:59' } };
var n = 0, rot = 0;
function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/' || !/\.[a-z0-9]+$/.test(p)) p = '/index.html';
    var f = path.join(W, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'application/javascript' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(8893);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  for (var [w, h, art] of [[390, 844, 'handy'], [1280, 860, 'rechner']]) {
    var c = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    await c.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    await c.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url(), json = function (d) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/rest\/v1\/menu_categories/.test(u)) return json(KAT);
      if (/rest\/v1\/menu_items/.test(u)) return json(ITEMS);
      if (/rest\/v1\/restaurants/.test(u)) return json(/single|eq\.|id=eq/.test(u) ? [REST] : [REST]);
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    var s = await c.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:8893/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(async function (R) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      APP_DATA.restaurants = [R];
      await openMenuModal(R.id);
    }, REST);
    await s.waitForTimeout(1800);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-oben.png') });
    var m = await s.evaluate(function () {
      var modal = document.getElementById('menuModal') || document.querySelector('.modal-overlay.active, .modal-overlay[style*="flex"]');
      var karten = document.querySelectorAll('#menuItemsList .glass-card');
      var sicht = Array.prototype.filter.call(karten, function (k) { var r = k.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.height > 0; }).length;
      var klein = [];
      (modal || document).querySelectorAll('button, [role="button"], [onclick]').forEach(function (e) {
        var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.top > innerHeight) return;
        if (r.width < 44 || r.height < 40) klein.push((e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 22) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      var erste = karten[0] ? karten[0].getBoundingClientRect() : null;
      return { offen: !!modal, karten: karten.length, sichtbar: sicht, ersteOben: erste ? Math.round(erste.top) : -1, ersteHoehe: erste ? Math.round(erste.height) : -1, ragt: document.documentElement.scrollWidth - innerWidth, klein: klein.slice(0, 12) };
    });
    console.log(art + ': ' + JSON.stringify(m));
    pruef(art + ': Speisekarte zum Bestellen geht auf, Gerichte da', m.offen && m.karten === 8, JSON.stringify(m));
    pruef(art + ': keine JS-Fehler', fehler.length === 0, fehler.join(' | '));
    // Ein Gericht in den Korb: was sieht der Gast danach?
    await s.evaluate(function () { var k = document.querySelector('#menuItemsList .glass-card button:not([aria-label])') || Array.prototype.find.call(document.querySelectorAll('#menuItemsList button'), function (x) { return /Hinzuf/.test(x.textContent); }); if (k) k.click(); });
    await s.waitForTimeout(600);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-optionen.png') });
    var nachher = await s.evaluate(function () {
      var knopf = Array.prototype.find.call(document.querySelectorAll('button'), function (x) { var r = x.getBoundingClientRect(); return r.height > 0 && /in den Warenkorb|Hinzufügen ·|zum Warenkorb/i.test(x.textContent); });
      if (knopf) knopf.click();
      return knopf ? knopf.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) : 'kein Korb-Knopf';
    });
    await s.waitForTimeout(800);
    var korb = await s.evaluate(function () {
      var sicht = Array.prototype.filter.call(document.querySelectorAll('body *'), function (e) { var st = getComputedStyle(e); var r = e.getBoundingClientRect(); return (st.position === 'fixed' || st.position === 'sticky') && r.height > 30 && r.top > innerHeight * 0.6 && r.width > 100 && st.display !== 'none' && st.visibility !== 'hidden' && /€|Warenkorb|Korb/.test(e.textContent); });
      return sicht.map(function (e) { return (e.id || e.className || e.tagName).toString().slice(0, 30) + ': ' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50); }).slice(0, 3);
    });
    console.log(art + ': Optionen-Knopf = ' + nachher + ' | unten sichtbar: ' + JSON.stringify(korb));
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-korb.png') });
    await s.evaluate(function () { var k = Array.prototype.find.call(document.querySelectorAll('button'), function (x) { return /Weiter bestellen/.test(x.textContent) && x.getBoundingClientRect().height > 0; }); if (k) k.click(); });
    await s.waitForTimeout(600);
    var leiste = await s.evaluate(function () {
      return Array.prototype.filter.call(document.querySelectorAll('body *'), function (e) { var st = getComputedStyle(e), r = e.getBoundingClientRect(); return (st.position === 'fixed' || st.position === 'sticky') && r.height > 30 && r.top > innerHeight * 0.7 && r.bottom <= innerHeight + 2 && r.width > 120 && st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity > 0.1; })
        .map(function (e) { return (e.id || e.className).toString().slice(0, 30) + ': ' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50); }).slice(0, 4);
    });
    console.log(art + ': nach "Weiter bestellen" unten fest: ' + JSON.stringify(leiste));
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-danach.png') });
    // Ganze Liste
    await s.evaluate(function () { var l = document.getElementById('menuItemsList'); var sc = l; while (sc && sc.scrollHeight <= sc.clientHeight + 2) sc = sc.parentElement; if (sc) sc.scrollTop = 600; });
    await s.waitForTimeout(300);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-weiter.png') });
    await c.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/bestellseite/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
