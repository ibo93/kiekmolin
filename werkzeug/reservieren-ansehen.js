// RESERVIEREN ANSEHEN -- Handy und Rechner, mit Probe-Belegung.
//
// Ibo, 19.10.2026: das neue Reservieren aus dem Entwurf (vier Seiten
// "BAUEN") soll in die App -- "alles was du gemacht hast". Oeffnet
// openReservation im echten Browser, waehlt einen Tag und eine Uhrzeit,
// geht zu den Angaben und macht Bilder von jedem Schritt. Misst: ragt
// etwas seitlich heraus, JS-Fehler, ist die gewaehlte Zeit markiert, steht
// das Ticket mit der richtigen Zeit da, kommt Schritt 2.
// Supabase und res-availability beantwortet das Werkzeug selbst.
// AUFRUF   node werkzeug/reservieren-ansehen.js [name]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var W = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe', 'reservieren'); fs.mkdirSync(AUS, { recursive: true });
var NAME = (process.argv[2] || 'jetzt') + (process.env.KMI_DUNKEL ? '-dunkel' : '');
var RID = '33333333-3333-4333-8333-333333333333';
// naechster Dienstag, mind. 2 Tage voraus
var TAG = (function () { var d = new Date(); d.setDate(d.getDate() + 2); while (d.getDay() !== 2) d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); })();
var OH = {}; ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].forEach(function (k) { OH[k + '_start'] = '11:30'; OH[k + '_end'] = '22:00'; });
var REST = { id: RID, name: 'Die Millis', city: 'Emden', opening_time: '11:30', closing_time: '22:00', slot_interval_minutes: 30, rest_day: 0, opening_hours: OH, features: [] };
// 4 Tische; 19:00 drei belegt (knapp), 19:30 vier (voll), 18:00 einer
var BEL = [['18:00', 1], ['19:00', 3], ['19:30', 4], ['12:30', 2]].reduce(function (a, z) { for (var i = 0; i < z[1]; i++) a.push({ reservation_time: z[0] + ':00', status: 'confirmed', table_id: null }); return a; }, []);
var n = 0, rot = 0;
function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/' || !/\.[a-z0-9]+$/.test(p)) p = '/index.html';
    var f = path.join(W, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(8894);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  for (var [w, h, art] of [[390, 844, 'handy'], [1280, 860, 'rechner']]) {
    var c = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
    await c.addInitScript(function (DUNKEL) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', DUNKEL ? 'dark' : 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} }, !!process.env.KMI_DUNKEL);
    await c.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url(), json = function (d) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/rest\/v1\/restaurant_tables/.test(u)) return json([{ id: 't1', area: 'main' }, { id: 't2', area: 'main' }, { id: 't3', area: 'main' }, { id: 't4', area: 'main' }]);
      if (/rest\/v1\/restaurants/.test(u)) return json([REST]);
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    await c.route(/\/\.netlify\/functions\//, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await c.route(/\/\.netlify\/functions\/res-availability/, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, belegung: BEL }) }); });
    var s = await c.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:8894/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(async function (a) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.querySelectorAll('.bottom-nav, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      APP_DATA.restaurants = [a.r];
      openReservation(a.r.id, a.tag);
      await new Promise(function (ok) { setTimeout(ok, 600); });
      if (typeof loadAvailableSlots === 'function') await loadAvailableSlots();
    }, { r: REST, tag: TAG });
    await s.waitForTimeout(1500);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-1.png') });
    var m1 = await s.evaluate(function () {
      var mod = document.querySelector('#reservationModal > .modal');
      return { zeiten: Array.prototype.map.call(document.querySelectorAll('#availableSlotsContainer .slot-btn'), function (b) { return b.dataset.time; }).join(','), ragt: mod ? mod.scrollWidth - mod.clientWidth : -1 };
    });
    console.log(art + ' Schritt 1: ' + JSON.stringify(m1));
    pruef(art + ': Uhrzeiten stehen da (18:30 frei)', /18:30/.test(m1.zeiten), m1.zeiten);
    pruef(art + ': nichts ragt seitlich heraus', m1.ragt <= 1, m1.ragt);
    // Mittag/Abend umschalten (nur neu)
    var teil = await s.evaluate(function () {
      var k = document.querySelectorAll('#resTeilSchalter button'); if (k.length !== 2) return 'kein Umschalter';
      k[0].click(); var m = Array.prototype.map.call(document.querySelectorAll('#availableSlotsContainer .slot-btn'), function (b) { return b.dataset.time; }).join(',');
      document.querySelectorAll('#resTeilSchalter button')[1].click(); return m;
    });
    pruef(art + ': Umschalter Mittag zeigt die Mittagszeiten, 12:30 dabei', /^11:30.*12:30/.test(teil) && !/18:/.test(teil), teil);
    var voll = await s.evaluate(function () { var k = document.querySelector('#availableSlotsContainer .slot-btn[data-time="19:30"]'); return k ? (k.disabled ? 'gesperrt' : 'waehlbar') : 'fehlt'; });
    pruef(art + ': volle Zeit (19:30) steht da, ist aber nicht wählbar', voll === 'gesperrt', voll);
    // 18:30 waehlen
    await s.evaluate(function () { var k = document.querySelector('#availableSlotsContainer .slot-btn[data-time="18:30"]'); if (k) k.click(); });
    await s.waitForTimeout(500);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-2.png') });
    var m2 = await s.evaluate(function () {
      var k = document.querySelector('#availableSlotsContainer .slot-btn[data-time="18:30"]');
      return { markiert: !!(k && k.classList.contains('selected')), zeit: document.getElementById('reservationTime').value, ticket: (document.getElementById('selectedTimeText') || {}).textContent || '' };
    });
    pruef(art + ': 18:30 markiert, Zeit gesetzt, steht im Ticket', m2.markiert && m2.zeit === '18:30:00' && /18:30/.test(m2.ticket), JSON.stringify(m2));
    // weiter zu den Angaben (neu: Knopf im Ticket; alt: Formular steht schon da)
    await s.evaluate(function () { var w = document.getElementById('resWeiterBtn'); if (w) w.click(); });
    await s.waitForTimeout(500);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-3.png') });
    await s.evaluate(function () { var m = document.querySelector('#reservationModal > .modal'); m.scrollTop = m.scrollHeight; });
    await s.waitForTimeout(200);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-4.png') });
    var m3 = await s.evaluate(function () {
      var g = document.getElementById('guestName'); var r = g.getBoundingClientRect();
      var mod = document.querySelector('#reservationModal > .modal'), W = mod.getBoundingClientRect().right, aus = [];
      mod.querySelectorAll('*').forEach(function (e) { var b = e.getBoundingClientRect(); if (b.width > 0 && b.right > W + 1 && getComputedStyle(e).display !== 'none') aus.push((e.id || e.className || e.tagName).toString().slice(0, 30) + ' r=' + Math.round(b.right)); });
      return { sichtbar: r.height > 0 && getComputedStyle(document.getElementById('reservationStep2')).display !== 'none', ragt: mod.scrollWidth - mod.clientWidth, zuBreit: aus.slice(0, 5) };
    });
    console.log(art + ' Schritt 2: ' + JSON.stringify(m3));
    pruef(art + ': Schritt 2: nichts ragt seitlich heraus', m3.ragt <= 1 && !m3.zuBreit.length, JSON.stringify(m3.zuBreit));
    pruef(art + ': Schritt 2 (Angaben) sichtbar', m3.sichtbar, JSON.stringify(m3));
    var s2 = await s.evaluate(function () {
      var e = document.getElementById('guestEmail'); e.value = 'lena@gmial.com'; e.dispatchEvent(new Event('input'));
      var tipp = document.getElementById('resMailTipp'); var sicht = tipp.style.display !== 'none' && /gmail\.com/.test(tipp.textContent);
      tipp.click(); var neu = e.value;
      var chip = Array.prototype.find.call(document.querySelectorAll('#resAnlassChips button'), function (b) { return /Geburtstag/.test(b.textContent); }); chip.click();
      var an = document.getElementById('reservationOccasion').value;
      return sicht + '|' + neu + '|' + an + '|' + document.getElementById('resSubmitText').textContent;
    });
    pruef(art + ': Tippfehler-Hilfe (gmial -> gmail), Anlass-Knopf setzt Anlass, Knopf nennt die Zeit', s2 === 'true|lena@gmail.com|birthday|Tisch für 18:30 reservieren', s2);
    var zur = await s.evaluate(function () { document.querySelector('.res-s2-aendern').click(); return getComputedStyle(document.getElementById('reservationStep1')).display !== 'none' && document.getElementById('reservationTime').value === '18:30:00'; });
    pruef(art + ': „Ändern“ führt zurück zu Schritt 1, Uhrzeit bleibt', zur === true, zur);
    pruef(art + ': keine JS-Fehler', fehler.length === 0, fehler.join(' | '));
    await c.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/reservieren/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
