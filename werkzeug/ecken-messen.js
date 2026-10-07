// ECKEN MESSEN -- PASSEN SIE INEINANDER (iOS 27)?
//
// Entstanden am 06.10.2026, Ibo: "das Runde von iOS 27". Bei iOS ist ein
// Element in einer Karte nie runder als die Karte minus dem Abstand zum Rand
// (mindestens 12 px). Das Werkzeug blendet Lokalseite und alle Dashboard-
// Bereiche ein und zaehlt verschachtelte Ecken, die passen bzw. nicht.
// Gemessen: vor dem Umbau 27 von 43, danach 44 von 44.
//
// AUFRUF   INDEX=<datei> node werkzeug/ecken-messen.js
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const W = '/home/user/kiekmolin', INDEX = process.env.INDEX || path.join(W, 'index.html');
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = p === '/index.html' ? INDEX : path.join(W, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(+(process.env.PORT || 8890));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); });
  const s = await ctx.newPage(); s.on('pageerror', () => {});
  await s.goto('http://localhost:' + (process.env.PORT || 8890) + '/', { waitUntil: 'load' }); await s.waitForTimeout(2500);
  const r = await s.evaluate(async () => {
    // alles einblenden, was es gibt: Dashboard-Bereiche + eine Lokalseite
    var bar = { id: 'p', name: 'Probe', slug: 'p', city: 'Emden', features: [], opening_hours: {}, is_active: true, images: [], tags: [], cuisine_type: ['Bar'], rating: 4.5 };
    APP_DATA.restaurants = (APP_DATA.restaurants || []).concat([bar]); await showRestaurantLanding(bar);
    var d = document.getElementById('dashboardView'); var p = d; while (p && p !== document.body) { p.style.setProperty('display', p === d ? 'flex' : 'block', 'important'); p = p.parentElement; }
    document.querySelectorAll('.dash-section').forEach(x => x.style.setProperty('display', 'block', 'important'));
    await new Promise(r => setTimeout(r, 500));
    function px(v) { return parseFloat(v) || 0; }
    var stat = {}, kreise = [], konz = { ok: 0, schlecht: 0, bsp: [] };
    function flaeche(e, st) { var c = st.backgroundColor; var m = c.match(/rgba?\(([^)]+)\)/); var a = m ? (m[1].split(',')[3] !== undefined ? parseFloat(m[1].split(',')[3]) : 1) : 0; return a > 0.05 || (st.borderTopWidth !== '0px' && st.borderTopStyle !== 'none') || st.backgroundImage !== 'none'; }
    document.querySelectorAll('body *').forEach(function (e) {
      var st = getComputedStyle(e); var rad = px(st.borderTopLeftRadius); if (!rad || st.borderTopLeftRadius.indexOf('%') > -1) return;
      var rc = e.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) return;
      if (!flaeche(e, st)) return;
      var kurz = Math.min(rc.width, rc.height);
      var pill = rad >= kurz / 2 - 0.5;
      var key = pill ? 'Pille/Kreis' : (rad + 'px');
      stat[key] = (stat[key] || 0) + 1;
      if (!pill && rad >= 24 && kurz < 2 * rad + 8) kreise.push(e.tagName + ' ' + Math.round(rc.width) + 'x' + Math.round(rc.height) + ' r' + rad);
      // Konzentrisch? Elternflaeche mit Radius suchen
      if (pill) return;
      for (var q = e.parentElement; q && q !== document.body; q = q.parentElement) {
        var qs = getComputedStyle(q); var qr = px(qs.borderTopLeftRadius);
        if (qr && flaeche(q, qs)) {
          var qrc = q.getBoundingClientRect(); var abstand = Math.min(rc.left - qrc.left, rc.top - qrc.top);
          if (abstand < 0 || abstand > 40) break;     // nicht in der Ecke -> egal
          var soll = Math.max(qr - abstand, 12);
          if (rad <= soll + 2 && rad <= qr) konz.ok++; else { konz.schlecht++; if (konz.bsp.length < 8) konz.bsp.push(q.tagName + '.' + String(q.className).split(' ')[0] + (q.id ? '#' + q.id : '') + ' aussen ' + qr + ', Abstand ' + Math.round(abstand) + ', innen ' + rad + ' (hoechstens ' + Math.round(soll) + ') ' + e.tagName + '.' + String(e.className).split(' ')[0]); }
          break;
        }
      }
    });
    return { stat, kreise: kreise.slice(0, 10), konz };
    var herkunft = {};
    document.querySelectorAll('body *').forEach(function (e) {
      var st = getComputedStyle(e); var rad = px(st.borderTopLeftRadius); if ([48, 40, 32, 24].indexOf(rad) < 0) return;
      var inl = /border-radius/.test(e.getAttribute('style') || '');
      var k = (inl ? 'inline' : 'klasse:' + (typeof e.className === 'string' ? e.className.split(' ').slice(0, 2).join('.') : e.tagName)) + ' r' + rad;
      herkunft[k] = (herkunft[k] || 0) + 1;
    });
    return { herkunft: herkunft };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close(); srv.close();
})();
