// BESTELLUNG IN DREI SCHRITTEN -- im echten Browser durchgeklickt.
//
// Ibo, 12.10.2026: "in drei Schritten wie bei Lieferando". Für Lieferung,
// Abholung und Vor Ort: Annehmen (Zeit wählen) -> nächster Knopf -> letzter
// Knopf. Gezählt wird, was der Wirt wirklich antippt, und was in der
// "Datenbank" ankommt. Supabase beantwortet das Werkzeug selbst.
// AUFRUF   node werkzeug/drei-schritte-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8898);
var RID = '22222222-2222-4222-8222-222222222222';

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }

  var patches = [];
  var ctx = await b.newContext({ viewport: { width: 1180, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
  await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
    var rq = rt.request(), u = rq.url(), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
    if (/rest\/v1\/orders\?id=eq\./.test(u) && rq.method() === 'PATCH') {
      var id = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]), body = JSON.parse(rq.postData());
      patches.push({ id: id, body: body });
      return json([Object.assign({ id: id }, body)]);
    }
    if (/supabase\.co/.test(u)) return json([]);
    return rt.abort();
  });
  await ctx.route(/\/\.netlify\/functions\//, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
  await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
  await s.evaluate(function (rid) {
    document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
    document.getElementById('guestView').style.setProperty('display', 'none', 'important');
    var d = document.getElementById('dashboardView'); for (var q = d; q && q !== document.body; q = q.parentElement) q.style.setProperty('display', 'block', 'important');
    document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === 'sectionOrders' ? 'block' : 'none', 'important'); });
    document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
    APP_DATA.restaurants = [{ id: rid, name: 'Die Millis', features: [] }];
    window._gastroOnlyRestaurantId = rid;
    try { autoPrintKitchenBon = false; } catch (e) {}
    var jetzt = new Date().toISOString();
    var mk = function (id, nr, typ) { return { id: id, order_number: nr, order_type: typ, status: 'received', customer_name: 'Gast ' + nr, customer_phone: '0176 1', total: 25, items: [{ name: 'Pizza', quantity: 1, price: 25 }], created_at: jetzt, restaurant_id: rid }; };
    dashboardOrders = [mk('o-lief', 101, 'delivery'), mk('o-abh', 102, 'pickup'), mk('o-ort', 103, 'dine_in')];
    renderDashboardOrders();
  }, RID);
  await s.waitForTimeout(300);

  async function karte(id) {
    return s.evaluate(function (id) {
      var btn = Array.prototype.find.call(document.querySelectorAll('button'), function (b) { return (b.getAttribute('onclick') || '').indexOf("'" + id + "'") >= 0 && /kin-order-btn (accept|next)/.test(b.className); });
      var o = dashboardOrders.find(function (x) { return x.id === id; });
      return { knopf: btn ? btn.textContent.replace(/\s+/g, ' ').trim().replace(/^\S+\s/, '') : null, status: o && o.status, zubereiten: Array.prototype.some.call(document.querySelectorAll('button'), function (b) { return (b.getAttribute('onclick') || '').indexOf("'" + id + "', 'preparing'") >= 0; }) };
    }, id);
  }
  async function tippen(id) {
    var art = await s.evaluate(function (id) {
      var btn = Array.prototype.find.call(document.querySelectorAll('button'), function (b) { return (b.getAttribute('onclick') || '').indexOf("'" + id + "'") >= 0 && /kin-order-btn (accept|next)/.test(b.className); });
      if (!btn) return 'keiner';
      btn.click(); return /accept/.test(btn.className) ? 'annehmen' : 'weiter';
    }, id);
    await s.waitForTimeout(300);
    if (art === 'annehmen') { await s.evaluate(function () { return confirmAcceptOrder(); }); await s.waitForTimeout(300); }
    return art;
  }
  for (var w of [['o-lief', 'Lieferung', 'Annehmen → Unterwegs → Zugestellt', 'delivered'], ['o-abh', 'Abholung', 'Annehmen → Fertig → Abgeholt', 'picked_up'], ['o-ort', 'Vor Ort', 'Annehmen → Fertig → Serviert', 'picked_up']]) {
    var klicks = [], zub = false;
    for (var i = 0; i < 6; i++) {
      var k = await karte(w[0]); if (k.zubereiten) zub = true;
      if (!k.knopf) break;
      klicks.push(k.knopf); await tippen(w[0]);
    }
    var ende = (await karte(w[0])).status;
    pruef(w[1] + ': ' + w[2] + ' (im Browser getippt)', klicks.join(' → ') === w[2] && ende === w[3] && !zub, klicks.join(' → ') + ' / Ende ' + ende + (zub ? ' / Zubereiten-Knopf da' : ''));
  }
  var ann = patches.filter(function (p) { return p.body.accepted_at; });
  pruef('Annehmen speichert gleich "preparing" mit Zeit und Wartezeit', ann.length === 3 && ann.every(function (p) { return p.body.status === 'preparing' && p.body.preparing_at && p.body.estimated_minutes; }), JSON.stringify(ann.map(function (p) { return p.body.status; })));
  pruef('pro Bestellung genau 3 Speichervorgänge', ['o-lief', 'o-abh', 'o-ort'].every(function (id) { return patches.filter(function (p) { return p.id === id; }).length === 3; }), JSON.stringify(patches.map(function (p) { return p.id + ':' + p.body.status; })));
  var tabs = await s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.kin-filter-tab'), function (x) { return x.textContent.replace(/\s+/g, ' ').replace(/\d+/g, '').trim(); }); });
  pruef('Filter-Reiter ohne "Angenommen"', tabs.join('|').indexOf('Angenommen') < 0 && tabs.join('|').indexOf('Zubereitung') >= 0, tabs.join(' | '));
  pruef('kein Seitenfehler', !fehler.length, fehler.join(' | '));

  // Bild: eine Karte je Schritt
  await s.evaluate(function (rid) {
    var jetzt = new Date().toISOString();
    var mk = function (id, nr, typ, st) { return { id: id, order_number: nr, order_type: typ, status: st, customer_name: 'Gast ' + nr, customer_phone: '0176 1', total: 25, items: [{ name: 'Pizza', quantity: 1, price: 25 }], created_at: jetzt, restaurant_id: rid, estimated_minutes: 25 }; };
    dashboardOrders = [mk('b1', 201, 'delivery', 'received'), mk('b2', 202, 'delivery', 'preparing'), mk('b3', 203, 'pickup', 'preparing'), mk('b4', 204, 'delivery', 'out_for_delivery')];
    renderDashboardOrders();
  }, RID);
  await s.waitForTimeout(300);
  await s.evaluate(function () { document.querySelectorAll('.toast, #toastContainer, .kmi-toast').forEach(function (x) { x.style.display = 'none'; }); document.getElementById('ordersGrid').scrollIntoView(); });
  await s.locator('#ordersGrid').screenshot({ path: path.join(AUS, 'drei-schritte.png') });

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bild: werkzeug/ausgabe/drei-schritte.png');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
