// SPERRUNGEN -- im echten Browser.
//
// Ibo, 14.10.2026: "hab zeiten gesperrt für ein kunde, die sperrungen sind
// weg, aber auf dem reservierungen kalender sind die". Misst den Fall, wie
// er war: Admin, zwei Lokale, gesperrt wird fuer das ZWEITE (den Kunden).
//   - oben steht das Lokal
//   - Zeitraum 18:00-20:00 am 31.12. speichert beim Kunden, Liste zeigt EINE
//     Zeile "18:00 – 20:00 Uhr"
//   - anderen Tag waehlen und zurueck: Sperrung ist noch da (der Fehler)
//   - jede Anfrage der Seite geht an den Kunden, keine an das erste Lokal
//   - mehrere Tage "ganzer Tag", Kalender-Punkte, kommende Sperrungen
//   - Aufheben, Kontrast, Handybreite, Dunkelmodus
// Supabase beantwortet das Werkzeug selbst (der Proxy sperrt es).
// AUFRUF   node werkzeug/sperrung-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8898);
var ERSTES = '11111111-1111-4111-8111-111111111111';
var KUNDE = '22222222-2222-4222-8222-222222222222';
var JAHR = new Date().getFullYear();
var SILVESTER = JAHR + '-12-31';

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

  async function seite(breite, dunkel) {
    var db = { zeilen: [], anfragenLokale: [], features: ['delivery'] }, naechste = 1;
    var ctx = await b.newContext({ viewport: { width: breite, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} }, !!dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var rq = rt.request(), u = decodeURIComponent(rq.url()), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      var lok = (u.match(/restaurant_id=eq\.([0-9a-f-]+)/) || [])[1];
      if (/rest\/v1\/reservations/.test(u) && lok) db.anfragenLokale.push(lok);
      if (/rest\/v1\/reservations$/.test(u.split('?')[0]) && rq.method() === 'POST') {
        var neu = JSON.parse(rq.postData()); if (!Array.isArray(neu)) neu = [neu];
        neu.forEach(function (z) { z.id = 'aaaaaaaa-0000-4000-8000-' + String(naechste++).padStart(12, '0'); db.zeilen.push(z); db.anfragenLokale.push(z.restaurant_id); });
        return json(neu, 201);
      }
      if (/rpc\/update_reservation_details/.test(u)) {
        var k = JSON.parse(rq.postData()); db.zeilen.forEach(function (z) { if (z.id === k.p_reservation_id) z.status = k.p_status; }); return json(null);
      }
      if (/rest\/v1\/reservations\?id=eq\./.test(u)) {
        var id = (u.match(/id=eq\.([0-9a-f-]+)/) || [])[1]; return json(db.zeilen.filter(function (z) { return z.id === id; }));
      }
      if (/rest\/v1\/reservations\?/.test(u) && /status=eq\.blocked/.test(u)) {
        var eq = (u.match(/reservation_date=eq\.([\d-]+)/) || [])[1], gte = (u.match(/reservation_date=gte\.([\d-]+)/) || [])[1], lte = (u.match(/reservation_date=lte\.([\d-]+)/) || [])[1];
        return json(db.zeilen.filter(function (z) {
          return z.status === 'blocked' && z.restaurant_id === lok && (!eq || z.reservation_date === eq) && (!gte || z.reservation_date >= gte) && (!lte || z.reservation_date <= lte);
        }).sort(function (a, c) { return (a.reservation_date + a.reservation_time) < (c.reservation_date + c.reservation_time) ? -1 : 1; }));
      }
      if (/restaurant_tables/.test(u)) return json([{ id: 't1', table_number: 1, max_capacity: 4 }, { id: 't2', table_number: 2, max_capacity: 6 }]);
      if (/rest\/v1\/restaurants\?id=eq\./.test(u)) {
        if (rq.method() === 'PATCH') { db.features = JSON.parse(rq.postData()).features; db.patchLokal = (u.match(/id=eq\.([0-9a-f-]+)/) || [])[1]; return json([{ id: db.patchLokal, features: db.features }]); }
        return json([{ id: KUNDE, features: db.features }]);
      }
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    await ctx.route(/\/\.netlify\/functions\/res-availability/, function (rt) {
      // Gaesteseite: am Messtag zwei Reservierungen um 19:00
      return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, belegung: [
        { reservation_time: '19:00:00', party_size: 2, status: 'confirmed', table_id: null },
        { reservation_time: '19:00:00', party_size: 4, status: 'pending', table_id: null }] }) });
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function (a) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #cartPanel, .cart-panel, #cartOverlay, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      var zeiten = { opening_time: '17:00', closing_time: '22:30', slot_interval_minutes: 30, opening_hours: { pause_enabled: false } };
      APP_DATA.restaurants = [Object.assign({ id: a.erstes, name: 'Erstes Lokal' }, zeiten), Object.assign({ id: a.kunde, name: 'Lütt Italia' }, zeiten)];
      window._gastroOnlyRestaurantId = null;
      window.currentRestaurantId = a.erstes;      // so stand es beim Admin
      window.resCurrentRestaurant = a.kunde;      // im Reservierungskalender gewaehlt
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var tab = document.getElementById('resTabBlocking');
      for (var q = tab; q && q !== document.body; q = q.parentElement) if (getComputedStyle(q).display === 'none') q.style.setProperty('display', 'block', 'important');
      document.querySelectorAll('.dash-section').forEach(function (x) { if (!x.contains(tab)) x.style.setProperty('display', 'none', 'important'); });
      document.querySelectorAll('.res-tab-content').forEach(function (x) { if (x !== tab) x.style.setProperty('display', 'none', 'important'); });
      tab.scrollIntoView({ block: 'start' });
      loadBlockingUI();
    }, { erstes: ERSTES, kunde: KUNDE });
    await s.waitForTimeout(500);
    return { s: s, ctx: ctx, fehler: fehler, db: db };
  }
  var KONTRAST = function (sel) {
    function rgb(c) { var m = String(c).match(/[\d.]+/g) || [0, 0, 0, 1]; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; }
    function lum(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
    var el = document.querySelector(sel); if (!el) return 0;
    var fg = rgb(getComputedStyle(el).color), bg = null;
    for (var q = el; q; q = q.parentElement) { var c = rgb(getComputedStyle(q).backgroundColor); if (c.a > 0.5) { bg = c; break; } }
    bg = bg || { r: 255, g: 255, b: 255 }; var a = lum(fg), z = lum(bg); return Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 10) / 10;
  };

  var p = await seite(1180, false);

  // VORHER-FASSUNG (ohne #blockLokalName): den alten Ablauf nachspielen --
  // eine Uhrzeit sperren, anderen Tag waehlen, zurueck.
  if (!(await p.s.$('#blockLokalName'))) {
    console.log('(alte Fassung erkannt -- spiele den gemeldeten Ablauf nach)');
    await p.s.evaluate(function (d) { _blockSelectedDate = d; selectBlockType('slot'); }, SILVESTER);
    await p.s.selectOption('#blockTime', '18:00');
    await p.s.evaluate(function () { return createBlock(); }); await p.s.waitForTimeout(500);
    await p.s.evaluate(function (j) { blockCalSelectDate(j + '-12-30'); }, JAHR); await p.s.waitForTimeout(300);
    await p.s.evaluate(function (d) { blockCalSelectDate(d); }, SILVESTER); await p.s.waitForTimeout(400);
    var altListe = await p.s.textContent('#blockList');
    var angelegt = p.db.zeilen.map(function (z) { return z.restaurant_id === KUNDE ? 'Kunde' : 'Erstes'; });
    pruef('anderen Tag gewählt und zurück: Sperrung ist noch da', !/Keine Sperrungen/.test(altListe), 'angelegt bei: ' + angelegt.join() + ' · Liste: ' + altListe.replace(/\s+/g, ' ').trim());
    var fremdAlt = p.db.anfragenLokale.filter(function (x) { return x !== KUNDE; }).length;
    pruef('keine einzige Anfrage der Sperrungen ging an das erste Lokal', fremdAlt === 0, fremdAlt + ' von ' + p.db.anfragenLokale.length + ' Anfragen beim ersten Lokal');
    await b.close(); srv.close();
    console.log('\n' + (rot ? rot + ' von ' + n + ' Messungen ROT.' : 'Alle ' + n + ' Messungen gruen.'));
    process.exit(rot ? 1 : 0);
  }

  var kopf = await p.s.textContent('#blockLokalName');
  pruef('oben steht das Lokal, für das gesperrt wird', /Sperrungen für Lütt Italia/.test(kopf), kopf);

  // Zeitraum 18:00-20:00 am 31.12.
  await p.s.evaluate(function (d) { blockCalSelectDate(d); selectBlockType('slot'); }, SILVESTER);
  await p.s.selectOption('#blockTime', '18:00');
  await p.s.selectOption('#blockTimeBis', '20:00');
  await p.s.dispatchEvent('#blockTimeBis', 'change');
  await p.s.fill('#blockReason', 'Privatfeier');
  var vorschau = await p.s.textContent('#blockVorschau');
  pruef('Vorschau sagt vorher, was gesperrt wird (5 Uhrzeiten)', /5 Uhrzeiten/.test(vorschau), vorschau);
  await p.s.click('#blockSperrKnopf'); await p.s.waitForTimeout(700);
  var gespeichert = p.db.zeilen.filter(function (z) { return z.status === 'blocked'; });
  pruef('5 Zeilen gespeichert, alle beim Kunden', gespeichert.length === 5 && gespeichert.every(function (z) { return z.restaurant_id === KUNDE; }), JSON.stringify(gespeichert.map(function (z) { return z.restaurant_id.slice(0, 4) + ' ' + z.reservation_time; })));
  var liste = await p.s.textContent('#blockList');
  pruef('Liste zeigt EINE Zeile „18:00 – 20:00 Uhr · Privatfeier“', /18:00 – 20:00 Uhr · Privatfeier/.test(liste) && (await p.s.$$('#blockList button')).length === 1, liste.replace(/\s+/g, ' ').slice(0, 160));

  // DER FEHLER: anderen Tag waehlen, zurueck -> war leer
  await p.s.evaluate(function (j) { blockCalSelectDate(j + '-12-30'); }, JAHR); await p.s.waitForTimeout(300);
  await p.s.evaluate(function (d) { blockCalSelectDate(d); }, SILVESTER); await p.s.waitForTimeout(400);
  liste = await p.s.textContent('#blockList');
  pruef('anderen Tag gewählt und zurück: Sperrung ist noch da (vorher „Keine Sperrungen“)', /18:00 – 20:00 Uhr/.test(liste), liste.replace(/\s+/g, ' ').slice(0, 120));
  var fremd = p.db.anfragenLokale.filter(function (x) { return x !== KUNDE; });
  pruef('keine einzige Anfrage der Sperrungen ging an das erste Lokal', fremd.length === 0 && p.db.anfragenLokale.length > 4, fremd.length + ' von ' + p.db.anfragenLokale.length);

  // Kalender-Punkt
  var punkt = await p.s.evaluate(function () { var b = Array.prototype.find.call(document.querySelectorAll('#blockCalendar button'), function (x) { return x.textContent.trim() === '31'; }); return b ? b.getAttribute('aria-label') + '|' + !!b.querySelector('.sperr-punkt') : ''; });
  pruef('Kalender markiert den 31. als teilweise gesperrt', /teilweise gesperrt\|true/.test(punkt), punkt);

  // Mehrere Tage, ganzer Tag
  await p.s.evaluate(function () { selectBlockType('day'); });
  await p.s.fill('#blockVonDatum', JAHR + '-12-24'); await p.s.dispatchEvent('#blockVonDatum', 'change');
  await p.s.fill('#blockBisDatum', JAHR + '-12-26'); await p.s.dispatchEvent('#blockBisDatum', 'change');
  vorschau = await p.s.textContent('#blockVorschau');
  pruef('Vorschau: 3 Tage, ganzer Tag', /3 Tage/.test(vorschau) && /ganzer Tag/.test(vorschau), vorschau);
  await p.s.click('#blockSperrKnopf'); await p.s.waitForTimeout(800);
  var tage = p.db.zeilen.filter(function (z) { return z.status === 'blocked' && z.reservation_time === '00:00:00'; }).map(function (z) { return z.reservation_date; });
  pruef('drei Ganztags-Sperren 24.–26.12.', tage.join() === [JAHR + '-12-24', JAHR + '-12-25', JAHR + '-12-26'].join(), tage.join());
  var kommende = await p.s.textContent('#blockKommende');
  pruef('„Kommende Sperrungen“ zeigt 24., 25., 26. (ganzer Tag) und 31. (18:00 – 20:00)', (kommende.match(/ganzer Tag/g) || []).length === 3 && /18:00 – 20:00 Uhr/.test(kommende), kommende.replace(/\s+/g, ' ').slice(0, 200));
  var punktTag = await p.s.evaluate(function () { var b = Array.prototype.find.call(document.querySelectorAll('#blockCalendar button'), function (x) { return x.textContent.trim() === '25'; }); return b ? b.getAttribute('aria-label') : ''; });
  pruef('Kalender: 25. als ganzer Tag gesperrt', /ganzer Tag gesperrt/.test(punktTag), punktTag);
  await p.s.screenshot({ path: path.join(AUS, 'sperrung-hell.png'), fullPage: false });

  // Kontrast
  for (var sel of ['#blockLokalName', '#blockVorschau', '#blockKommende button span', '#blockDateLabel']) {
    var k = await p.s.evaluate(KONTRAST, sel);
    pruef('Kontrast ' + sel + ' >= 4.5', k >= 4.5, k);
  }

  // Aufheben
  await p.s.evaluate(function (d) { blockCalSelectDate(d); }, SILVESTER); await p.s.waitForTimeout(400);
  await p.s.click('#blockList button'); await p.s.waitForTimeout(900);
  liste = await p.s.textContent('#blockList');
  pruef('Aufheben nimmt alle 5 Uhrzeiten auf einmal weg', /Keine Sperrungen an diesem Tag/.test(liste) && p.db.zeilen.filter(function (z) { return z.reservation_date === SILVESTER && z.status === 'blocked'; }).length === 0, liste.replace(/\s+/g, ' ').slice(0, 100));

  // Vorlage "Ruhetag jede Woche" ab einem Montag
  var montag = await p.s.evaluate(function () { var d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toLocaleDateString('sv-SE'); });
  await p.s.evaluate(function (d) { blockCalSelectDate(d); blockVorlage('ruhetag'); }, montag); await p.s.waitForTimeout(300);
  vorschau = await p.s.textContent('#blockVorschau');
  var wtSicht = await p.s.evaluate(function () { var z = document.getElementById('blockWochentageZeile'); return getComputedStyle(z).display + '|' + Array.prototype.filter.call(document.querySelectorAll('.block-wt'), function (c) { return c.checked; }).map(function (c) { return c.value; }).join(); });
  pruef('Vorlage „Ruhetag jede Woche“: 12 Montage, Gäste lesen „Ruhetag“, Wochentage sichtbar (nur Mo)',
    /12 Tage/.test(vorschau) && /Ruhetag/.test(vorschau) && wtSicht === 'block|1', vorschau + ' · ' + wtSicht);
  await p.s.click('#blockSperrKnopf'); await p.s.waitForTimeout(900);
  var ruhe = p.db.zeilen.filter(function (z) { return z.status === 'blocked' && z.source === 'admin_block:ruhetag'; });
  pruef('12 Ruhetage gespeichert, alle montags', ruhe.length === 12 && ruhe.every(function (z) { return new Date(z.reservation_date + 'T12:00:00').getDay() === 1; }), ruhe.length);
  liste = await p.s.textContent('#blockList');
  pruef('Liste sagt, was Gäste lesen („Ruhetag“)', /Gäste lesen „Ruhetag“/.test(liste), liste.replace(/\s+/g, ' ').slice(0, 140));

  // Online-Tische
  await p.s.fill('#blockOnlineTische', '3');
  await p.s.click('#blockOnlineSpeichern'); await p.s.waitForTimeout(500);
  var ot = await p.s.textContent('#blockOnlineStand');
  pruef('Online-Tische 3 gespeichert, beim Kunden, Stand sichtbar', p.db.features.indexOf('online_tische:3') !== -1 && p.db.patchLokal === KUNDE && /höchstens 3 Tische/.test(ot), JSON.stringify(p.db.features) + ' ' + ot);

  var dienstag = await p.s.evaluate(function (m) { var d = new Date(m + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); }, montag);
  // Gaesteseite: 2 von 3 um 19:00 belegt -> "noch 1 Tisch"; andere "noch 3 Tische"
  var gast = await p.s.evaluate(async function (a) {
    var r = APP_DATA.restaurants.find(function (x) { return x.id === a.k; }); r.features = ['online_tische:3'];
    window._realTableCount = 10;
    var box = document.getElementById('availableSlotsContainer');
    document.getElementById('reservationRestaurantId').value = a.k;
    document.getElementById('reservationDate').value = a.d;
    var ps = document.getElementById('partySize'); if (ps.tagName === 'SELECT' && !Array.prototype.some.call(ps.options, function (o) { return o.value === '2'; })) { var o = document.createElement('option'); o.value = '2'; ps.appendChild(o); }
    ps.value = '2';
    await loadAvailableSlots();
    await new Promise(function (ok) { setTimeout(ok, 400); });
    var t19 = box.querySelector('.slot-btn[data-time="19:00"]'), t18 = box.querySelector('.slot-btn[data-time="18:00"]');
    return (t19 ? t19.textContent : '-') + ' | ' + (t18 ? t18.textContent : '-');
  }, { k: KUNDE, d: dienstag });
  var kn = await p.s.evaluate(KONTRAST, '#availableSlotsContainer .slot-noch');
  pruef('„noch N Tische“ lesbar (Kontrast >= 4.5)', kn >= 4.5, kn);
  var sb = await p.s.$('#availableSlotsContainer');
  if (sb) { await p.s.evaluate(function () { var b = document.getElementById('availableSlotsContainer'); for (var q = b; q && q !== document.body; q = q.parentElement) if (getComputedStyle(q).display === 'none') q.style.setProperty('display', 'block', 'important'); b.scrollIntoView({ block: 'center' }); }); await sb.screenshot({ path: path.join(AUS, 'sperrung-gast-uhrzeiten.png') }).catch(function () {}); }
  pruef('Gast sieht „19:00 noch 1 Tisch“ (3 online, 2 belegt) und „18:00 noch 3 Tische“', /19:00.*noch 1 Tisch\b/.test(gast) && /18:00.*noch 3 Tische/.test(gast), gast);

  pruef('keine JS-Fehler', p.fehler.length === 0, p.fehler.join(' | '));
  await p.ctx.close();

  // Handy + dunkel
  var m = await seite(390, true);
  var unten = await m.s.evaluate(function () {
    var k = document.getElementById('blockSperrKnopf'), r = k.getBoundingClientRect();
    var huelle = null;
    for (var q = k.parentElement; q && q !== document.body; q = q.parentElement) {
      var cs = getComputedStyle(q);
      if ((cs.overflow !== 'visible' || cs.overflowY !== 'visible') && q.getBoundingClientRect().bottom < r.bottom) { huelle = (q.id || q.className || q.tagName) + ' ' + cs.overflowY + ' h=' + Math.round(q.getBoundingClientRect().height); break; }
    }
    return { y: Math.round(r.top + scrollY), h: Math.round(r.height), abgeschnitten: huelle };
  });
  console.log('Sperren-Knopf auf dem Handy:', JSON.stringify(unten));
  var breit = await m.s.evaluate(function () { var t = document.getElementById('resTabBlocking'); return Math.round(t.scrollWidth) + '/' + Math.round(t.clientWidth); });
  var w = breit.split('/');
  pruef('Handy 390 px: nichts ragt seitlich heraus', +w[0] <= +w[1] + 1, breit);
  var kd = await m.s.evaluate(KONTRAST, '#blockLokalName');
  pruef('Dunkelmodus: Lokal-Name lesbar (>= 4.5)', kd >= 4.5, kd);
  await m.s.evaluate(function () { document.querySelectorAll('.toast, #toast, .toast-container').forEach(function (x) { x.remove(); }); document.getElementById('blockSperrKnopf').scrollIntoView({ block: 'end' }); });
  await m.s.waitForTimeout(300);
  await m.s.screenshot({ path: path.join(AUS, 'sperrung-handy-dunkel.png') });
  var kv = await m.s.evaluate(KONTRAST, '#blockVorschau');
  pruef('Dunkelmodus: Vorschau-Zeile lesbar (>= 4.5)', kv >= 4.5, kv);
  pruef('keine JS-Fehler (Handy)', m.fehler.length === 0, m.fehler.join(' | '));
  await m.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Messungen ROT.' : 'Alle ' + n + ' Messungen gruen.') + '  Bilder: werkzeug/ausgabe/sperrung-*.png');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
