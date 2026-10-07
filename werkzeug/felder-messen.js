// FELDER UND KNOEPFE SICHTBAR? -- IM ECHTEN BROWSER.
//
// Entstanden am 07.10.2026. Ibo, Foto vom Handy: beim Reservieren sah man
// Name, Telefon, E-Mail, Uhrzeiten und Gaestezahl nicht als Felder -- weiss
// auf weiss. Ursache: der Glas-Umbau machte die Fenster deckend weiss, die
// Felder darin blieben halb durchsichtig weiss. Die Lesbarkeits-Messung sah
// das nicht: der TEXT war lesbar, nur die FORM des Feldes fehlte.
//
// Misst fuer jedes sichtbare Eingabefeld und jeden Knopf MIT eigener
// Flaeche, ob sich Flaeche oder Rand vom Grund dahinter abhebt
// (Leuchtdichte-Verhaeltnis; unter 1,15 gilt als unsichtbar). Knoepfe ohne
// eigene Flaeche (reine Textknoepfe, Symbole) zaehlen nicht.
//
// Ansichten wie lesbarkeit-messen.js, hell und dunkel.
// AUFRUF   node werkzeug/felder-messen.js [datei]     LISTE=10 fuer Details
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8879);

function messe(wurzelSel) {
  function zahlen(x) { var m = String(x).match(/rgba?\(([^)]+)\)/); if (!m) return null; var t = m[1].split(',').map(parseFloat); return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 }; }
  function drauf(v, h) { return [v.r * v.a + h[0] * (1 - v.a), v.g * v.a + h[1] * (1 - v.a), v.b * v.a + h[2] * (1 - v.a)]; }
  function L(c) { var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
  function verh(a, b) { var x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  var gf = document.body.classList.contains('dark-mode') ? [14, 14, 14] : [250, 250, 250];
  function grund(el) { var sch = []; for (var k = el; k && k !== document.documentElement; k = k.parentElement) { var st = getComputedStyle(k); if (st.backgroundImage && st.backgroundImage !== 'none' && !/gradient/.test(st.backgroundImage)) return null; var f = zahlen(st.backgroundColor); if (f && f.a > 0) { sch.push(f); if (f.a >= 0.999) break; } } var c = gf.slice(); for (var i = sch.length - 1; i >= 0; i--) c = drauf(sch[i], c); return c; }
  function sichtbar(e) { var r = e.getBoundingClientRect(); if (r.width < 16 || r.height < 16) return false; for (var p = e; p && p !== document.body; p = p.parentElement) { var ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || parseFloat(ps.opacity) < 0.3) return false; } return true; }
  var w = document.querySelector(wurzelSel) || document.body, raus = [], n = 0;
  w.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=color]), select, textarea, button, [role="button"]').forEach(function (el) {
    if (!sichtbar(el)) return;
    var st = getComputedStyle(el), f = zahlen(st.backgroundColor), feld = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    var rand = parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== 'none' ? zahlen(st.borderTopColor) : null;
    if (!feld && !(f && f.a > 0.02) && !(rand && rand.a > 0.02)) return; // reiner Textknopf
    var g = grund(el.parentElement); if (!g) return; n++;
    var fl = f ? drauf(f, g) : g, kf = verh(fl, g), kr = rand ? verh(drauf(rand, fl), g) : 1;
    if (Math.max(kf, kr) < 1.15) raus.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ' "' + (el.value || el.placeholder || el.textContent || '').trim().slice(0, 18) + '" ' + kf.toFixed(2) + '/' + kr.toFixed(2));
  });
  return { n: n, schwach: raus };
}
function dashboard(abschnitt) {
  document.getElementById('guestView').style.setProperty('display', 'none', 'important');
  var d = document.getElementById('dashboardView'); var p = d; while (p && p !== document.body) { p.style.setProperty('display', 'block', 'important'); p = p.parentElement; }
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
    for (var a of ['sectionDashboard', 'sectionReservations', 'sectionOffers', 'sectionCustomers', 'sectionOptions', 'sectionOrders', 'sectionSpeisekarte']) {
      await s.evaluate(dashboard, a); await s.waitForTimeout(300);
      erg.push(['Dashboard ' + a.replace('section', ''), await s.evaluate(messe, '#dashboardView')]);
    }
    erg.forEach(function (e) { summe += e[1].schwach.length; texte += e[1].n;
      console.log(((dunkel ? 'dunkel ' : 'hell   ') + e[0]).padEnd(32) + ' Felder/Knoepfe ' + String(e[1].n).padStart(4) + ' | unsichtbar: ' + e[1].schwach.length + (process.env.LISTE ? '\n      ' + e[1].schwach.slice(0, +process.env.LISTE).join('\n      ') : '')); });
    await ctx.close();
  }
  console.log('SUMME: ' + texte + ' Felder/Knoepfe, ' + summe + ' unsichtbar');
  await b.close(); srv.close(); process.exit(summe ? 1 : 0);
})();
