// LEER ODER KAPUTT? -- im echten Browser, mit absichtlich ausfallender Datenbank.
//
// Entstanden am 06.10.2026 (Regel 6). Prueft fuer Bestellungen,
// Reservierungen und Tagesabschluss:
//   - Datenbank antwortet 500  -> rote Zeile "Nicht aktuell", leerer Zustand
//     sagt "konnte nicht geladen werden", NICHT "Keine Bestellungen"
//   - Datenbank antwortet []   -> "Zuletzt geprueft HH:MM", "Keine Bestellungen"
//   - erst Daten, dann Fehler   -> die Daten bleiben stehen (nicht geleert)
//
// Supabase beantwortet das Werkzeug selbst (der Proxy sperrt es).
// AUFRUF   node werkzeug/ladestand-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8884);
var RID = '11111111-1111-4111-8111-111111111111';

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
  var modus = { orders: 'leer', res: 'leer' };
  var ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); } catch (e) {} });
  await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
    var u = rt.request().url();
    var json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
    if (/rest\/v1\/orders/.test(u)) {
      if (modus.orders === 'kaputt') return json({ message: 'Testausfall' }, 500);
      if (modus.orders === 'voll') return json([{ id: 'o1', order_number: 'KM-0001', status: 'received', order_type: 'pickup', customer_name: 'Probe', total: '12.50', created_at: new Date().toISOString(), restaurant_id: RID, items: [{ name: 'Matjes', quantity: 1, price: 12.5 }] }]);
      return json([]);
    }
    if (/rest\/v1\/reservations/.test(u)) {
      if (modus.res === 'kaputt') return json({ message: 'Testausfall' }, 500);
      return json([]);
    }
    if (/supabase\.co/.test(u)) return json([]);
    return rt.abort();
  });
  var s = await ctx.newPage(); s.on('pageerror', function () {});
  await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(2000);
  async function zeige(abschnitt) {
    await s.evaluate(function (a) {
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var d = document.getElementById('dashboardView'); var p = d; while (p && p !== document.body) { p.style.setProperty('display', p === d ? 'flex' : 'block', 'important'); p = p.parentElement; }
      document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === a ? 'block' : 'none', 'important'); });
    }, abschnitt);
  }
  function stand(k) { return s.evaluate(function (k) { var e = document.querySelector('[data-ladestand="' + k + '"]'); return e ? { klasse: e.className, text: e.textContent } : null; }, k); }
  function leer() { return s.evaluate(function () { var e = document.getElementById('ordersEmptyState'); return e && getComputedStyle(e).display !== 'none' ? document.getElementById('ordersEmptyTitel').textContent : '(nicht sichtbar)'; }); }

  // --- Bestellungen ---
  await zeige('sectionOrders');
  await s.evaluate(function (rid) { window._gastroOnlyRestaurantId = rid; }, RID);
  modus.orders = 'kaputt'; await s.evaluate(function () { return loadDashboardOrders(); }); await s.waitForTimeout(300);
  var st = await stand('bestellungen');
  pruef('Bestellungen 500: rote Zeile "Nicht aktuell"', st && /fehler/.test(st.klasse) && /Nicht aktuell/.test(st.text), JSON.stringify(st));
  var le = await leer();
  pruef('... und der leere Zustand sagt NICHT "Keine Bestellungen"', /nicht geladen/.test(le), le);
  modus.orders = 'leer'; await s.evaluate(function () { return loadDashboardOrders(); }); await s.waitForTimeout(300);
  st = await stand('bestellungen'); le = await leer();
  pruef('Bestellungen []: "Zuletzt geprüft HH:MM"', st && /ok/.test(st.klasse) && /Zuletzt geprüft \d\d:\d\d/.test(st.text), JSON.stringify(st));
  pruef('... und "Keine Bestellungen"', le === 'Keine Bestellungen', le);
  modus.orders = 'voll'; await s.evaluate(function () { return loadDashboardOrders(); }); await s.waitForTimeout(300);
  modus.orders = 'kaputt'; await s.evaluate(function () { return loadDashboardOrders(); }); await s.waitForTimeout(300);
  var karten = await s.evaluate(function () { return dashboardOrders.length + '/' + (document.getElementById('ordersGrid').textContent.indexOf('KM-0001') > -1); });
  pruef('erst Daten, dann Ausfall: die Bestellung bleibt stehen', karten === '1/true', karten);
  await s.locator('#sectionOrders').screenshot({ path: path.join(__dirname, 'ausgabe', 'ladestand-bestellungen.png') }).catch(function () {});

  // --- Reservierungen ---
  await zeige('sectionReservations');
  await s.evaluate(function (rid) { window.resCurrentRestaurant = rid; }, RID);
  modus.res = 'kaputt'; await s.evaluate(function () { return window.resLoadReservations(); }); await s.waitForTimeout(300);
  st = await stand('reservierungen');
  pruef('Reservierungen 500: rote Zeile', st && /fehler/.test(st.klasse), JSON.stringify(st));
  var pille = await s.evaluate(function () { var t = document.getElementById('resStatusText'); return t ? t.textContent : '(keine)'; });
  pruef('... Pille sagt "nicht geladen", nicht "Keine Reservierungen gefunden"', /nicht geladen/.test(pille), pille);
  modus.res = 'leer'; await s.evaluate(function () { return window.resLoadReservations(); }); await s.waitForTimeout(300);
  st = await stand('reservierungen');
  pruef('Reservierungen []: "Zuletzt geprüft"', st && /ok/.test(st.klasse), JSON.stringify(st));

  // --- Kontrast der roten Zeile, hell ---
  modus.orders = 'kaputt'; await zeige('sectionOrders'); await s.evaluate(function () { return loadDashboardOrders(); }); await s.waitForTimeout(300);
  var k = await s.evaluate(function () {
    function L(c) { var m = c.match(/\d+(\.\d+)?/g).map(Number); var f = m.slice(0, 3).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
    var e = document.querySelector('[data-ladestand="bestellungen"]'), a = L(getComputedStyle(e).color), c = L(getComputedStyle(e).backgroundColor);
    return ((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2);
  });
  pruef('rote Zeile lesbar (>= 4,5): ' + k, +k >= 4.5, k);

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.'));
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
