// SONDERZEITEN -- im echten Browser.
//
// Ibo, 16.10.2026: "spezial Zeit Freigabe ... 1 Stunde" -> Extra-Zeit
// ausserhalb der Oeffnung. Misst: Karte in den Sperrungen, Vorschau,
// Freigeben speichert beim richtigen Lokal (andere Einstellungen bleiben),
// 0 Zeilen -> Fehler statt "freigegeben", Gast sieht die Uhrzeiten am
// Ruhetag und kann den Tag im Kalender waehlen, Entfernen, Kontrast hell
// und dunkel, Handybreite. Supabase beantwortet das Werkzeug selbst.
// AUFRUF   node werkzeug/sonderzeiten-messen.js
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8897);
var KUNDE = '22222222-2222-4222-8222-222222222222';
// naechster Montag, mindestens 3 Tage voraus (Ruhetag des Messlokals)
var MONTAG = (function () { var d = new Date(); d.setDate(d.getDate() + 3); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); })();

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

  async function seite(breite, dunkel, keineRechte) {
    var db = { oh: { pause_enabled: false, res_fenster: true }, patches: [] };
    var ctx = await b.newContext({ viewport: { width: breite, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} }, !!dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var rq = rt.request(), u = decodeURIComponent(rq.url()), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/rest\/v1\/restaurants\?id=eq\./.test(u)) {
        var lok = (u.match(/id=eq\.([0-9a-f-]+)/) || [])[1];
        if (rq.method() === 'PATCH') {
          db.patches.push(lok);
          if (keineRechte) return json([]);
          db.oh = JSON.parse(rq.postData()).opening_hours; return json([{ id: lok, opening_hours: db.oh }]);
        }
        return json([{ id: KUNDE, opening_hours: db.oh, features: [] }]);
      }
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    await ctx.route(/\/\.netlify\/functions\/res-availability/, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, belegung: [] }) }); });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function (a) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #cartPanel, .cart-panel, #cartOverlay, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      APP_DATA.restaurants = [{ id: a.kunde, name: 'Lütt Italia', opening_time: '17:00', closing_time: '22:00', slot_interval_minutes: 30, rest_day: 0, opening_hours: a.oh }];
      window.resCurrentRestaurant = a.kunde;
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var tab = document.getElementById('resTabBlocking');
      for (var q = tab; q && q !== document.body; q = q.parentElement) if (getComputedStyle(q).display === 'none') q.style.setProperty('display', 'block', 'important');
      document.querySelectorAll('.dash-section').forEach(function (x) { if (!x.contains(tab)) x.style.setProperty('display', 'none', 'important'); });
      document.querySelectorAll('.res-tab-content').forEach(function (x) { if (x !== tab) x.style.setProperty('display', 'none', 'important'); });
      loadBlockingUI();
      document.getElementById('sonderKarte').scrollIntoView({ block: 'center' });
    }, { kunde: KUNDE, oh: db.oh });
    await s.waitForTimeout(500);
    return { s: s, ctx: ctx, fehler: fehler, db: db };
  }

  var p = await seite(1180, false);
  pruef('Karte „Sonderzeiten – extra buchbar“ sichtbar, leer: „Keine Sonderzeiten.“', /Keine Sonderzeiten/.test(await p.s.textContent('#sonderListe')) && await p.s.isVisible('#sonderKarte'), await p.s.textContent('#sonderListe'));
  await p.s.fill('#sonderDatum', MONTAG); await p.s.fill('#sonderVon', '12:00'); await p.s.fill('#sonderBis', '13:00');
  await p.s.evaluate(function () { sonderVorschau(); });
  var vor = await p.s.textContent('#sonderVorschauText');
  pruef('Vorschau: „zusätzlich buchen: 12:00 · 12:30 · 13:00 Uhr“', /zusätzlich buchen: 12:00 · 12:30 · 13:00 Uhr/.test(vor), vor);
  await p.s.click('#sonderHinzu'); await p.s.waitForTimeout(600);
  pruef('gespeichert beim Lokal, andere Einstellung (res_fenster) bleibt', p.db.patches[0] === KUNDE && p.db.oh.res_fenster === true && JSON.stringify(p.db.oh.sonderzeiten) === JSON.stringify([{ datum: MONTAG, von: '12:00', bis: '13:00' }]), JSON.stringify(p.db));
  var liste = await p.s.textContent('#sonderListe');
  pruef('Liste zeigt „12:00–13:00 Uhr“ mit Entfernen', /12:00–13:00 Uhr/.test(liste) && /Entfernen/.test(liste), liste);
  for (var sel of ['#sonderVorschauText', '#sonderListe span[style*="flex:1"]', '#sonderKarte p']) {
    var k = await p.s.evaluate(KONTRAST, sel); pruef('Kontrast hell ' + sel + ' >= 4.5', k >= 4.5, k);
  }
  await (await p.s.$('#sonderKarte')).screenshot({ path: path.join(AUS, 'sonderzeiten-hell.png') });

  // Gaesteseite: Montag ist Ruhetag -- mit Sonderzeit waehlbar, Uhrzeiten da
  var gast = await p.s.evaluate(async function (a) {
    window._realTableCount = 10;
    var r = APP_DATA.restaurants[0];
    window._resCurrentRestaurantData = r;
    var d = new Date(a.d + 'T12:00:00'); _resCalYear = d.getFullYear(); _resCalMonth = d.getMonth();
    resCalRender();
    var zelle = Array.prototype.find.call(document.querySelectorAll('#resCalGrid [onclick], #resCalGrid div, #resCalendarGrid div'), function (x) { return x.getAttribute('onclick') && x.getAttribute('onclick').indexOf(a.d) > -1; });
    document.getElementById('reservationRestaurantId').value = a.k;
    document.getElementById('reservationDate').value = a.d;
    var ps = document.getElementById('partySize'); if (ps.tagName === 'SELECT' && !Array.prototype.some.call(ps.options, function (o) { return o.value === '2'; })) { var o = document.createElement('option'); o.value = '2'; ps.appendChild(o); }
    ps.value = '2';
    await loadAvailableSlots();
    await new Promise(function (ok) { setTimeout(ok, 400); });
    var zeiten = Array.prototype.map.call(document.querySelectorAll('#availableSlotsContainer .slot-btn'), function (x) { return x.getAttribute('data-time'); });
    return { kalender: !!zelle, zeiten: zeiten.join(' ') };
  }, { k: KUNDE, d: MONTAG });
  pruef('Gast: Ruhetag mit Sonderzeit im Kalender anklickbar', gast.kalender, JSON.stringify(gast));
  pruef('Gast: Uhrzeiten 12:00 12:30 13:00 am Ruhetag', gast.zeiten === '12:00 12:30 13:00', gast.zeiten);

  await p.s.evaluate(function () { document.getElementById('sonderKarte').scrollIntoView({ block: 'center' }); });
  await p.s.click('#sonderListe button'); await p.s.waitForTimeout(600);
  pruef('Entfernen: weg in der Datenbank und in der Liste', p.db.oh.sonderzeiten.length === 0 && /Keine Sonderzeiten/.test(await p.s.textContent('#sonderListe')), JSON.stringify(p.db.oh));
  pruef('keine JS-Fehler', p.fehler.length === 0, p.fehler.join(' | '));
  await p.ctx.close();

  var o = await seite(1180, false, true);
  await o.s.fill('#sonderDatum', MONTAG);
  await o.s.click('#sonderHinzu'); await o.s.waitForTimeout(600);
  var ot = await o.s.textContent('#sonderVorschauText');
  pruef('ohne Rechte (0 Zeilen): „Nicht gespeichert … Gäste sehen den alten Stand“', /Nicht gespeichert: keine Berechtigung/.test(ot) && /Keine Sonderzeiten/.test(await o.s.textContent('#sonderListe')), ot);
  await o.ctx.close();

  var m = await seite(390, true);
  await m.s.fill('#sonderDatum', MONTAG); await m.s.click('#sonderHinzu'); await m.s.waitForTimeout(600);
  for (var sel2 of ['#sonderVorschauText', '#sonderListe span[style*="flex:1"]', '#sonderKarte p', '#sonderKarte label']) {
    var kd = await m.s.evaluate(KONTRAST, sel2); pruef('Kontrast dunkel ' + sel2 + ' >= 4.5', kd >= 4.5, kd);
  }
  var breit = await m.s.evaluate(function () { var k = document.getElementById('sonderKarte'); return Math.round(k.scrollWidth) + '/' + Math.round(k.clientWidth); });
  pruef('Handy: nichts ragt heraus', +breit.split('/')[0] <= +breit.split('/')[1] + 1, breit);
  await (await m.s.$('#sonderKarte')).screenshot({ path: path.join(AUS, 'sonderzeiten-handy-dunkel.png') });
  await m.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Messungen ROT.' : 'Alle ' + n + ' Messungen gruen.') + '  Bilder: werkzeug/ausgabe/sonderzeiten-*.png');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
