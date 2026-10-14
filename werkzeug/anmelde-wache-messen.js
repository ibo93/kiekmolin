// ANMELDE-WACHE IM DASHBOARD -- im echten Browser.
// Gaesteseite: kein Banner. Dashboard ohne Anmeldung: rotes Banner, lesbar,
// mit "Neu anmelden". Anmeldung kommt zurueck: Banner weg.
// AUFRUF  node werkzeug/anmelde-wache-messen.js
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium; try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..'), AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8900);
(async function () {
  var srv = http.createServer(function (q, r) { var p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; var f = path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0; function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
  var ctx = await b.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
  await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
  await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { return /supabase\.co/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort(); });
  var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
  await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
  await s.evaluate(function () { return dashboardAnmeldungPruefen(); }); await s.waitForTimeout(200);
  pruef('Gästeseite: kein Banner', !(await s.$('#kmiAbgemeldetBanner')), 'Banner da');
  await s.evaluate(function () {
    window.supabaseClient = { auth: { refreshSession: async function () { return { data: { session: null } }; } } };
    document.getElementById('guestView').classList.add('hidden'); document.getElementById('dashboardView').classList.add('active');
    return dashboardAnmeldungPruefen();
  }); await s.waitForTimeout(300);
  var txt = await s.evaluate(function () { var b = document.getElementById('kmiAbgemeldetBanner'); return b ? b.textContent : ''; });
  pruef('Dashboard ohne Anmeldung: Banner „Anmeldung abgelaufen … nicht geladen“', /Anmeldung abgelaufen/.test(txt) && /nicht geladen/.test(txt), txt);
  var lage = await s.evaluate(function () { var b = document.getElementById('kmiAbgemeldetBanner').getBoundingClientRect(); var k = document.querySelector('#kmiAbgemeldetBanner button').getBoundingClientRect(); return { top: Math.round(b.top), breit: Math.round(b.width), knopfH: Math.round(k.height), sichtbar: k.bottom <= innerHeight }; });
  pruef('Banner oben, volle Breite, Knopf antippbar (≥ 30 px hoch)', lage.top === 0 && lage.breit >= 389 && lage.knopfH >= 30 && lage.sichtbar, JSON.stringify(lage));
  await s.screenshot({ path: path.join(AUS, 'anmelde-wache.png') });
  await s.evaluate(function () { kmiTokenSetzen({ access_token: 'x', expires_in: 3600 }); return dashboardAnmeldungPruefen(); }); await s.waitForTimeout(300);
  pruef('Anmeldung zurück: Banner weg', !(await s.$('#kmiAbgemeldetBanner')), 'Banner bleibt');
  pruef('keine JS-Fehler', fehler.length === 0, fehler.join(' | '));
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Messungen ROT.' : 'Alle ' + n + ' Messungen gruen.'));
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
