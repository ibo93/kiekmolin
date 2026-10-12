// RESERVIERUNGEN AUSGEBUCHT -- im echten Browser.
//
// Ibo, 12.10.2026: "diesen Monat voll -- dass man diesen Monat ausgebucht
// schreiben kann". Misst:
//   - Dashboard: Block sichtbar und lesbar, "Rest dieses Monats" speichert
//     den richtigen Zeitraum, Liste zeigt ihn, Löschen nimmt ihn weg
//   - Speichern ohne Recht (leere Antwort): Meldung statt "gespeichert"
//   - Gast: Datum im Zeitraum -> "Ausgebucht" + Warteliste, keine Uhrzeiten;
//     Kalender streicht die Tage durch; Tag danach normal
// Supabase beantwortet das Werkzeug selbst (der Proxy sperrt es).
// AUFRUF   node werkzeug/res-ausgebucht-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8897);
var RID = '22222222-2222-4222-8222-222222222222';
function tag(plus) { var d = new Date(); d.setDate(d.getDate() + plus); return d.toLocaleDateString('sv-SE'); }
var HEUTE = tag(0);
function monatsEnde(t) { var j = +t.slice(0, 4), m = +t.slice(5, 7); return t.slice(0, 8) + String(new Date(j, m, 0).getDate()).padStart(2, '0'); }

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

  async function seite(stand) {
    // stand.features = was die "Datenbank" hat; stand.ohneRecht = PATCH ohne Zeile
    var ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var rq = rt.request(), u = rq.url(), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/rest\/v1\/restaurants\?id=eq\./.test(u)) {
        if (rq.method() === 'PATCH') { var body = JSON.parse(rq.postData()); stand.letzterPatch = body; if (stand.ohneRecht) return json([]); stand.features = body.features; return json([{ id: RID, features: stand.features }]); }
        return json([{ id: RID, features: stand.features }]);
      }
      if (/res-availability/.test(u)) return json({ ok: true, belegung: [] });
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    await ctx.route(/\/\.netlify\/functions\/res-availability/, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, belegung: [] }) }); });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function (a) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #cartPanel, .cart-panel, #cartOverlay, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      APP_DATA.restaurants = [{ id: a.rid, name: 'Die Millis', city: 'Emden', features: a.f, opening_hours: null, rest_day: null }];
      window._gastroOnlyRestaurantId = a.rid;
    }, { rid: RID, f: stand.features });
    return { s: s, ctx: ctx, fehler: fehler };
  }
  var KONTRAST = function (sel) {
    function rgb(c) { var m = String(c).match(/[\d.]+/g) || [0, 0, 0, 1]; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; }
    function lum(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
    var el = document.querySelector(sel); if (!el) return 0;
    var fg = rgb(getComputedStyle(el).color), bg = null;
    for (var q = el; q; q = q.parentElement) { var c = rgb(getComputedStyle(q).backgroundColor); if (c.a > 0.5) { bg = c; break; } }
    bg = bg || { r: 255, g: 255, b: 255 }; var a = lum(fg), z = lum(bg); return Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 10) / 10;
  };

  // ---------- Dashboard ----------
  var stand = { features: ['delivery'] };
  var p = await seite(stand);
  await p.s.evaluate(function () {
    document.getElementById('guestView').style.setProperty('display', 'none', 'important');
    var d = document.getElementById('dashboardView'); for (var q = d; q && q !== document.body; q = q.parentElement) q.style.setProperty('display', 'block', 'important');
    document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === 'sectionDashboard' ? 'block' : 'none', 'important'); });
    var blk = document.getElementById('ausgebuchtBlock'); for (var q2 = blk; q2 && q2 !== document.body; q2 = q2.parentElement) if (getComputedStyle(q2).display === 'none') q2.style.setProperty('display', 'block', 'important');
    blk.scrollIntoView({ block: 'center' });
  });
  var sicht = await p.s.evaluate(function () { var b = document.getElementById('ausgebuchtBlock'); var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  pruef('Dashboard: Block "Reservierungen ausgebucht" sichtbar', sicht, sicht);
  var k1 = await p.s.evaluate(KONTRAST, '#ausgebuchtBlock [data-ausgebucht="naechster"]'), k2 = await p.s.evaluate(KONTRAST, '#ausgebuchtStand');
  pruef('Dashboard: Knöpfe und Hinweis lesbar (Kontrast ≥ 4,5)', k1 >= 4.5 && k2 >= 4.5, k1 + ' / ' + k2);
  await p.s.click('#ausgebuchtBlock [data-ausgebucht="monat"]'); await p.s.waitForTimeout(500);
  var soll = 'ausgebucht:' + HEUTE + ':' + monatsEnde(HEUTE);
  var nach = await p.s.evaluate(function () { return { liste: Array.prototype.map.call(document.querySelectorAll('#ausgebuchtListe .ausgebucht-zeile span'), function (x) { return x.textContent; }), stand: document.getElementById('ausgebuchtStand').textContent }; });
  pruef('"Rest dieses Monats" speichert heute bis Monatsende', (stand.letzterPatch || {}).features && stand.letzterPatch.features.indexOf(soll) >= 0 && stand.letzterPatch.features.indexOf('delivery') >= 0, JSON.stringify(stand.letzterPatch));
  pruef('Liste zeigt den Zeitraum, Hinweis sagt was Gäste sehen', nach.liste.length === 1 && /ausgebucht/.test(nach.stand) && /Bestellen geht weiter/.test(nach.stand), JSON.stringify(nach));
  // Eingeblendete Meldungen (Toasts) liegen sonst ueber dem Bild.
  await p.s.waitForTimeout(3500);
  await p.s.evaluate(function () { document.querySelectorAll('.toast, #toastContainer, .kmi-toast').forEach(function (x) { x.style.display = 'none'; }); });
  await p.s.locator('#ausgebuchtBlock').screenshot({ path: path.join(AUS, 'ausgebucht-dashboard.png') });
  await p.s.click('#ausgebuchtListe [data-ausgebucht-weg]'); await p.s.waitForTimeout(500);
  pruef('Löschen nimmt den Zeitraum weg, sonst bleibt alles', stand.features.indexOf(soll) < 0 && stand.features.indexOf('delivery') >= 0 && (await p.s.$$('#ausgebuchtListe .ausgebucht-zeile')).length === 0, JSON.stringify(stand.features));
  stand.ohneRecht = true;
  await p.s.click('#ausgebuchtBlock [data-ausgebucht="naechster"]'); await p.s.waitForTimeout(500);
  var o = await p.s.textContent('#ausgebuchtStand');
  pruef('ohne Recht (leere Antwort): "Nicht gespeichert", nicht "eingetragen"', /^Nicht gespeichert/.test(o), o);
  pruef('kein Seitenfehler (Dashboard)', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- Gast ----------
  stand = { features: ['ausgebucht:' + HEUTE + ':' + tag(3)] };
  p = await seite(stand);
  await p.s.evaluate(function (rid) { openReservation(rid); }, RID);
  await p.s.waitForTimeout(1200);
  var g = await p.s.evaluate(function () {
    var c = document.getElementById('availableSlotsContainer'), wl = document.getElementById('waitlistOption');
    return { text: c.textContent.replace(/\s+/g, ' ').trim(), uhrzeiten: c.querySelectorAll('button').length, wl: wl && getComputedStyle(wl).display !== 'none', voll: document.querySelectorAll('.kmi-cal-voll').length };
  });
  pruef('Gast, Datum im Zeitraum: "Ausgebucht – Die Millis ist vom … bis … ausgebucht", keine Uhrzeiten', /Ausgebucht – Die Millis ist vom .+ bis .+ ausgebucht/.test(g.text) && g.uhrzeiten === 0, JSON.stringify(g));
  pruef('Gast: Warteliste wird angeboten', g.wl === true, JSON.stringify(g));
  pruef('Kalender: ausgebuchte Tage durchgestrichen (mind. 1 außer dem gewählten)', g.voll >= 1, g.voll);
  await p.s.locator('#reservationModal .modal, #reservationModal').first().screenshot({ path: path.join(AUS, 'ausgebucht-gast.png') });
  await p.s.evaluate(function (t) { resCalSelectDate(t); }, tag(4)); await p.s.waitForTimeout(800);
  var g2 = await p.s.evaluate(function () { var c = document.getElementById('availableSlotsContainer'); return { text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 80), aus: !!c.querySelector('.kmi-res-ausgebucht') }; });
  pruef('Gast, Tag danach: normal (kein Ausgebucht-Hinweis)', !g2.aus, JSON.stringify(g2));
  pruef('kein Seitenfehler (Gast)', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/ausgebucht-*.png');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
