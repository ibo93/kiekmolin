// LOKALSEITE ANSEHEN -- Handy und Rechner, mit Beispielfotos.
//
// Baut im echten Browser die Seite eines Lokals (showRestaurantLanding) mit
// Beispieldaten und fuenf erzeugten Fotos (Canvas, kein Netz noetig) und
// macht Bilder: oben, ganze Seite. Misst dabei, was das Auge sonst
// uebersieht: ragt etwas seitlich heraus, wie viel vom Foto ist oben zu
// sehen, ist das Karussell da und blaetterbar.
// AUFRUF   node werkzeug/lokalseite-ansehen.js [name]
'use strict';
var path = require('path'), http = require('http'), fs = require('fs');
var W = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe', 'lokalseite'); fs.mkdirSync(AUS, { recursive: true });
var NAME = process.argv[2] || 'jetzt';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var n = 0, rot = 0;
function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/' || !/\.[a-z0-9]+$/.test(p)) p = '/index.html';
    var f = path.join(W, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    var typ = p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
    r.writeHead(200, { 'Content-Type': typ }); r.end(fs.readFileSync(f));
  }).listen(8892);
  var b = await chromium.launch({ executablePath: process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (var [w, h, art] of [[390, 844, 'handy'], [1280, 860, 'rechner']]) {
    var c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await c.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    await c.route(/^https?:\/\/(?!localhost)/, function (rt) { return /supabase\.co/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort(); });
    var s = await c.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:8892/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(async function () {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      function foto(a, b, seed) {
        var cv = document.createElement('canvas'); cv.width = 800; cv.height = 560; var g = cv.getContext('2d');
        var gr = g.createLinearGradient(0, 0, 0, 560); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 800, 560);
        var x = seed; function rnd() { x = (x * 9301 + 49297) % 233280; return x / 233280; }
        g.filter = 'blur(14px)';
        for (var i = 0; i < 16; i++) { g.fillStyle = 'rgba(255,' + Math.round(150 + rnd() * 100) + ',' + Math.round(60 + rnd() * 120) + ',0.55)'; g.beginPath(); g.arc(rnd() * 800, rnd() * 560, 30 + rnd() * 110, 0, 7); g.fill(); }
        return cv.toDataURL('image/jpeg', 0.8);
      }
      var bilder = [foto('#5a2c12', '#e0a35a', 1), foto('#223a2a', '#c8b47a', 2), foto('#4a1616', '#f0c896', 3), foto('#1c2c48', '#d2bea0', 4), foto('#3c2a18', '#fadca8', 5)];
      var rest = { id: 'r-millis', slug: 'die-millis', name: 'Die Millis', city: 'Emden', street: 'Auricher Straße 150', phone: '04921 9234444',
        image: bilder[0], images: bilder, rating: 4.6, review_count: 128, cuisine_type: ['Italienisch', 'Pizza'], description: 'Hausgemachte Pasta, Pizza aus dem Steinofen und eine Terrasse am Kanal.',
        opening_time: '11:30', closing_time: '22:00', features: [], opening_hours: { mo_start: '11:30', mo_end: '22:00', di_start: '11:30', di_end: '22:00', mi_start: '11:30', mi_end: '22:00', do_start: '11:30', do_end: '22:00', fr_start: '11:30', fr_end: '23:00', sa_start: '11:30', sa_end: '23:00', so_start: '12:00', so_end: '21:30' } };
      APP_DATA.restaurants = [rest];
      await showRestaurantLanding(rest);
    });
    await s.waitForTimeout(1800);
    var m = await s.evaluate(function () {
      var l = document.getElementById('restaurantLanding');
      var hero = document.getElementById('lpHero'), hr = hero ? hero.getBoundingClientRect() : null;
      var karte = document.querySelector('.lp-hero-karte'), kr = karte ? karte.getBoundingClientRect() : null;
      // sichtbares Foto oben: Heldenflaeche im Fenster minus Karte
      var fotoSicht = hr ? Math.max(0, Math.min(hr.bottom, innerHeight) - Math.max(hr.top, 0)) : 0;
      var verdeckt = kr ? Math.max(0, Math.min(kr.bottom, innerHeight) - Math.max(kr.top, 0)) * Math.min(1, kr.width / innerWidth) : 0;
      var kar = document.getElementById('lpKarussell');
      return { ragt: l.scrollWidth - l.clientWidth, fotoAnteil: Math.round(100 * Math.max(0, fotoSicht - verdeckt) / innerHeight),
        karussell: kar ? kar.querySelectorAll('img').length : 0, hoehe: l.scrollHeight };
    });
    console.log(art + ': ' + JSON.stringify(m));
    if (m.ragt > 1) console.log('  zu breit: ' + JSON.stringify(await s.evaluate(function () {
      var W = document.getElementById('restaurantLanding').clientWidth, aus = [];
      document.querySelectorAll('#restaurantLanding *').forEach(function (e) { var r = e.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0 && !e.closest('.lp-karussell') && !e.closest('[style*="overflow-x:auto"],[style*="overflow-x: auto"]')) aus.push((e.id || e.className || e.tagName).toString().slice(0, 40) + ' r=' + Math.round(r.right) + ' in ' + ((e.parentElement && (e.parentElement.id || e.parentElement.className)) || '').toString().slice(0, 30) + ' style=' + (e.getAttribute('style') || '').slice(0, 90)); });
      return aus.slice(0, 8);
    })));
    pruef(art + ': nichts ragt seitlich heraus', m.ragt <= 1, m.ragt + 'px');
    pruef(art + ': keine JS-Fehler', fehler.length === 0, fehler.join(' | '));
    pruef(art + ': Karussell mit allen 5 Fotos', m.karussell === 5, m.karussell);
    // Kopf: Punkte da, Weiter blaettert, Selbstwechsel haelt danach an
    var kopf = await s.evaluate(function () {
      var p = document.querySelectorAll('#lpHeroPunkte button'); if (!p.length) return 'keine Punkte';
      lpDiashowGehe(1);
      return p.length + '|' + Array.prototype.findIndex.call(p, function (x) { return x.getAttribute('aria-selected') === 'true'; }) + '|' + _lpDia.selbst;
    });
    pruef(art + ': Kopf-Punkte (5), Weiter -> Foto 2, Selbstwechsel aus', kopf === '5|1|true', kopf);
    // Grossansicht: oeffnen, weiter, Escape schliesst
    await s.evaluate(function () { document.getElementById('lpKarussell').scrollIntoView(); });
    await s.click('#lpKarussell .lp-karussell-bild:nth-child(3)');
    await s.waitForTimeout(200);
    var lb1 = await s.evaluate(function () { var b = document.getElementById('lpLightbox'); return b ? b.querySelector('.lp-lb-nr').textContent : 'zu'; });
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-gross.png') });
    await s.keyboard.press('ArrowRight');
    var lb2 = await s.evaluate(function () { return document.querySelector('#lpLightbox .lp-lb-nr').textContent; });
    await s.keyboard.press('Escape');
    var lb3 = await s.evaluate(function () { return !document.getElementById('lpLightbox'); });
    pruef(art + ': Großansicht: Foto 3 öffnet, → zu 4, Escape schließt', lb1 === '3 / 5' && lb2 === '4 / 5' && lb3, lb1 + ' ' + lb2 + ' ' + lb3);
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-oben.png') });
    await s.evaluate(function () { var l = document.getElementById('restaurantLanding'); l.style.position = 'static'; l.style.overflow = 'visible'; document.querySelectorAll('body > *').forEach(function (x) { if (x !== l && !x.contains(l)) x.style.display = 'none'; }); });
    await s.screenshot({ path: path.join(AUS, NAME + '-' + art + '-ganz.png'), fullPage: true });
    await c.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/lokalseite/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
