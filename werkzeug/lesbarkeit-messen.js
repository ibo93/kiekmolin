// LESBARKEIT DER GANZEN APP -- IM ECHTEN BROWSER.
//
// Entstanden am 06.10.2026, nach "es muss lesbar sein ueberall". Misst den
// Kontrast jedes sichtbaren Textes (Schwelle 4,5 : 1, WCAG) in den
// Ansichten, die ohne Anmeldung erreichbar sind -- plus das Dashboard, dessen
// Bereiche dafuer eingeblendet werden (ohne echte Daten, das ist die Grenze).
//
// Ansichten: Startseite, Lokalseite, Speisekarte, Reservierung, Dashboard
// (Uebersicht, Reservierungen, Angebote, Kunden) -- jeweils hell und dunkel.
//
// AUFRUF   node werkzeug/lesbarkeit-messen.js [datei]     LISTE=10 fuer Details
// Laeuft nicht in run-all (braucht Chromium).
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8880);

function messe(wurzelSel) {
  function zahlen(x) { var m = String(x).match(/rgba?\(([^)]+)\)/); if (!m) return null; var t = m[1].split(',').map(parseFloat); return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 }; }
  function drauf(v, h) { return [v.r * v.a + h[0] * (1 - v.a), v.g * v.a + h[1] * (1 - v.a), v.b * v.a + h[2] * (1 - v.a)]; }
  function L(c) { var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
  var gf = document.body.classList.contains('dark-mode') ? [14, 14, 14] : [250, 250, 250];
  function grund(el) { var sch = []; for (var k = el; k && k !== document.documentElement; k = k.parentElement) { var st = getComputedStyle(k); if (st.backgroundImage && st.backgroundImage !== 'none') return null; var f = zahlen(st.backgroundColor); if (f && f.a > 0) { sch.push(f); if (f.a >= 0.999) break; } } var c = gf.slice(); for (var i = sch.length - 1; i >= 0; i--) c = drauf(sch[i], c); return c; }
  function sichtbar(e) { var r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; for (var p = e; p && p !== document.body; p = p.parentElement) { var ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || parseFloat(ps.opacity) < 0.3) return false; } return true; }
  var w = document.querySelector(wurzelSel) || document.body, raus = [], n = 0;
  w.querySelectorAll('*').forEach(function (el) {
    var t = ''; for (var j = 0; j < el.childNodes.length; j++) if (el.childNodes[j].nodeType === 3) t += el.childNodes[j].nodeValue;
    t = t.trim(); if (t.length < 2 || el.classList.contains('material-symbols-outlined') || !sichtbar(el)) return;
    var tf = zahlen(getComputedStyle(el).color), g = grund(el); if (!tf || !g) return; n++;
    var sc = drauf(tf, g), a = L(sc), b = L(g), k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (k < 4.5) raus.push(Math.round(k * 100) / 100 + ' "' + t.slice(0, 32) + '"');
  });
  return { n: n, schwach: raus };
}
function dashboard(abschnitt) {
  document.getElementById('guestView').style.setProperty('display', 'none', 'important');
  var d = document.getElementById('dashboardView'); var p = d; while (p && p !== document.body) { p.style.setProperty('display', p === d ? 'flex' : 'block', 'important'); p = p.parentElement; }
  document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === abschnitt ? 'block' : 'none', 'important'); });
}
(async function () {
  var srv = http.createServer(function (q, r) { var p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var summe = 0, texte = 0;
  for (var dunkel of [false, true]) {
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); } catch (e) {} }, dunkel);
    var s = await ctx.newPage(); s.on('pageerror', function () {});
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(2500);
    var erg = [];
    erg.push(['Startseite', await s.evaluate(messe, '#guestView')]);
    await s.evaluate(async function () { var bar = { id: 'probe-lokal', name: 'Probe Lokal', slug: 'probe', city: 'Emden', features: ['kohle_ruf'], opening_hours: {}, is_active: true, images: [], tags: [], cuisine_type: ['Bar'], rating: 4.5 };
      APP_DATA.restaurants = (APP_DATA.restaurants || []).concat([bar]); await showRestaurantLanding(bar); });
    await s.waitForTimeout(1200); erg.push(['Lokalseite', await s.evaluate(messe, '#restaurantLanding')]);
    await s.evaluate(async function () { var l = document.getElementById('restaurantLanding'); if (l) l.remove(); try { await openMenuModal('probe-lokal'); } catch (e) {} });
    await s.waitForTimeout(1200); erg.push(['Speisekarte', await s.evaluate(messe, '#menuModal')]);
    await s.evaluate(function () { closeModal('menuModal'); openReservation('probe-lokal'); });
    await s.waitForTimeout(1200); erg.push(['Reservierung', await s.evaluate(messe, '#reservationModal')]);
    await s.evaluate(function () { closeModal('reservationModal'); });
    for (var a of ['sectionDashboard', 'sectionReservations', 'sectionOffers', 'sectionCustomers']) {
      await s.evaluate(dashboard, a); await s.waitForTimeout(300);
      erg.push(['Dashboard ' + a.replace('section', ''), await s.evaluate(messe, '#dashboardView')]);
    }
    erg.forEach(function (e) { summe += e[1].schwach.length; texte += e[1].n;
      console.log(((dunkel ? 'dunkel ' : 'hell   ') + e[0]).padEnd(32) + ' Texte ' + String(e[1].n).padStart(4) + ' | unter 4,5 : 1: ' + e[1].schwach.length + (process.env.LISTE ? '\n      ' + e[1].schwach.slice(0, +process.env.LISTE).join('\n      ') : '')); });
    await ctx.close();
  }
  console.log('SUMME: ' + texte + ' Texte, ' + summe + ' unter 4,5 : 1');
  await b.close(); srv.close(); process.exit(summe ? 1 : 0);
})();
