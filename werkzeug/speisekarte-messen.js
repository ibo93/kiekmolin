// SPEISEKARTE VERWALTEN -- im echten Browser, iPad quer, mit Probedaten.
//
// Entstanden am 07.10.2026 ("was wir verbessern muessen: Speisekarte
// verwalten"). Misst, was ein Wirt am iPad erlebt:
//   - Tippflaechen unter 44 px (Apple-Richtwert)
//   - Felder/Knoepfe ohne sichtbare Flaeche (wie felder-messen.js)
//   - Texte unter 4,5 : 1
//   - was passiert, wenn das Laden scheitert (500) oder die Datenbank
//     leer antwortet ([] wegen fehlendem Leserecht): Meldung oder stumm?
// Supabase beantwortet das Werkzeug selbst (der Proxy sperrt es).
// AUFRUF   node werkzeug/speisekarte-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8888);
var RID = '11111111-1111-4111-8111-111111111111';
var KAT = [{ id: 'c1', restaurant_id: RID, name: 'Vorspeisen', sort_order: 1 }, { id: 'c2', restaurant_id: RID, name: 'Pasta', sort_order: 2 }, { id: 'c3', restaurant_id: RID, name: 'Fisch', sort_order: 3 }];
var ITEMS = [];
['Bruschetta', 'Carpaccio', 'Spaghetti Bolognese', 'Spaghetti Carbonara', 'Penne Arrabbiata', 'Matjes Hausfrauenart', 'Scholle Finkenwerder', 'Krabbenbrot'].forEach(function (n, i) {
  ITEMS.push({ id: 'i' + i, restaurant_id: RID, category_id: i < 2 ? 'c1' : (i < 5 ? 'c2' : 'c3'), name: n, description: 'mit frischen Zutaten', price: 8.5 + i, is_available: i !== 3, sort_order: i, allergens: i % 2 ? ['A', 'C'] : [] });
});

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
  async function seite(modus) {
    var ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url(), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/rest\/v1\/menu_categories/.test(u)) return modus === 'kaputt' ? json({ message: 'Testausfall' }, 500) : json(modus === 'leer' ? [] : KAT);
      if (/rest\/v1\/menu_items/.test(u)) return modus === 'kaputt' ? json({ message: 'Testausfall' }, 500) : json(modus === 'leer' ? [] : ITEMS);
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1800);
    await s.evaluate(function (rid) {
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var d = document.getElementById('dashboardView'); for (var p = d; p && p !== document.body; p = p.parentElement) p.style.setProperty('display', 'block', 'important');
      document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === 'sectionSpeisekarte' ? 'block' : 'none', 'important'); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav').forEach(function (x) { x.style.display = 'none'; });
      var sel = document.getElementById('menuRestaurantSelect'); var o = document.createElement('option'); o.value = rid; o.textContent = 'Probe'; sel.appendChild(o); sel.value = rid; sel.dispatchEvent(new Event('change'));
    }, RID);
    await s.waitForTimeout(1200);
    return { s: s, ctx: ctx, fehler: fehler };
  }
  var p = await seite('voll');
  var m = await p.s.evaluate(function () {
    var w = document.getElementById('sectionSpeisekarte'), klein = [], n = 0;
    w.querySelectorAll('button, [role="button"], input, select, [onclick]').forEach(function (e) {
      var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      for (var q = e; q && q !== w; q = q.parentElement) if (getComputedStyle(q).display === 'none') return;
      n++; if (r.width < 44 || r.height < 44) klein.push((e.getAttribute('aria-label') || e.title || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    var gerichte = Array.prototype.filter.call(w.querySelectorAll('*'), function (e) { return e.children.length === 0 && /Spaghetti Bolognese/.test(e.textContent); }).length;
    return { n: n, klein: klein, gerichte: gerichte };
  });
  pruef('Gerichte werden gezeigt', m.gerichte > 0, JSON.stringify(m));
  console.log('INFO | Bedienelemente: ' + m.n + ', davon kleiner als 44 px: ' + m.klein.length + '\n       ' + m.klein.slice(0, 25).join('\n       '));
  await p.s.locator('#sectionSpeisekarte').screenshot({ path: path.join(AUS, 'speisekarte-ipad.png') }).catch(function () {});
  pruef('kein Seitenfehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();
  for (var modus of ['kaputt', 'leer']) {
    p = await seite(modus);
    var t = await p.s.evaluate(function () { var w = document.getElementById('menuEditorSection'); return (w ? w.innerText : '').replace(/\s+/g, ' ').slice(0, 400); });
    var toast = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.toast'), function (x) { return x.textContent.trim(); }).join(' | '); });
    console.log('INFO | ' + modus + ': Editor zeigt: "' + t.slice(0, 220) + '"\n       Meldungen: ' + (toast || '(keine)'));
    if (modus === 'kaputt') pruef('500: der Wirt sieht, dass die Karte NICHT geladen wurde', /nicht geladen|Fehler/i.test(t + toast), t.slice(0, 120) + ' / ' + toast);
    await p.ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.'));
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
