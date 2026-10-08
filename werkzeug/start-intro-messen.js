// START-INTRO IM ECHTEN BROWSER MESSEN (08.10.2026)
//
// Ibo: "ich will genau das haben, das andere geht dann weg" -- sein Video
// ersetzt den alten Splash. Ein Textvergleich sieht nicht, ob ein Video
// wirklich läuft, ob es danach verschwindet und ob ohne Video etwas hängt.
// Das hier lädt index.html in Chromium und schaut nach.
//
//   npm i --no-save playwright-core
//   node werkzeug/start-intro-messen.js
//
// Bilder: werkzeug/ausgabe/intro-*.png
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var chromium = require('playwright-core').chromium;
var WURZEL = path.join(__dirname, '..'), AUS = path.join(__dirname, 'ausgabe');
var CHROM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var PORT = 8787;
var TYP = { '.html': 'text/html; charset=utf-8', '.webm': 'video/webm', '.mp4': 'video/mp4', '.png': 'image/png', '.woff2': 'font/woff2', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
if (!fs.existsSync(AUS)) fs.mkdirSync(AUS);

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    var f = path.join(WURZEL, p);
    if (f.indexOf(WURZEL) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TYP[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(text, ok, mehr) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + text + (ok ? '' : '  -> ' + (mehr || ''))); }

  async function seite(opt) {
    opt = opt || {};
    var ctx = await b.newContext({ viewport: opt.viewport || { width: 390, height: 844 }, deviceScaleFactor: opt.dpr || 3, reducedMotion: opt.ruhig ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); } catch (e) {} });
    // Fremde Server (Supabase, Schriften) gibt es hier nicht -- leer antworten.
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
    if (opt.ohneVideo) await ctx.route(/\/intro\//, function (rt) { return rt.abort(); });
    var s = await ctx.newPage(), fehler = [];
    s.on('pageerror', function (e) { fehler.push(String(e.message || e).slice(0, 120)); });
    return { ctx: ctx, s: s, fehler: fehler };
  }
  function zustand() {
    var sp = document.getElementById('splashScreen'), v = document.getElementById('splashVideo');
    var rc = v ? v.getBoundingClientRect() : null;
    return { da: !!sp, zeit: v ? Math.round(v.currentTime * 100) / 100 : null, quelle: v ? v.currentSrc.split('/').pop() : null,
             breite: v ? v.offsetWidth : null, hoehe: v ? v.offsetHeight : null, fenster: [innerWidth, innerHeight],
             pixel: v ? Math.round(v.offsetHeight * devicePixelRatio) : null, weg: sp ? sp.classList.contains('weg') : null };
  }

  // 1. Handy hoch: das Video läuft und verschwindet danach
  var p = await seite();
  var t0 = Date.now();
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  // Erst messen, dann fotografieren: ein Foto mit dreifacher Pixeldichte dauert
  // fast so lange wie das ganze Intro.
  await p.s.waitForFunction(function () { var v = document.getElementById('splashVideo'); return v && v.currentTime > 0.9; }, null, { timeout: 4000, polling: 16 }).catch(function () {});
  var z1 = await p.s.evaluate(zustand);
  await p.s.screenshot({ path: path.join(AUS, 'intro-handy-1.png') });
  pruef('Handy: das Video läuft (' + z1.zeit + ' s weit)', z1.da && z1.zeit > 0.4, JSON.stringify(z1));
  pruef('Handy: kleiner als der Bildschirm, nie hochgerechnet (' + z1.pixel + ' von 1920 Bildpunkten)', z1.breite > 100 && z1.breite < z1.fenster[0] && z1.hoehe <= z1.fenster[1] * 0.79 && z1.pixel <= 1960, JSON.stringify(z1));
  pruef('Handy: kleine Datei wird geladen (webm/mp4 aus /intro/)', /^kiek-start-v5-hd\.(webm|mp4)$/.test(z1.quelle || ''), z1.quelle);
  var ende = await p.s.waitForFunction(function () { return !document.getElementById('splashScreen'); }, null, { timeout: 6000 }).then(function () { return Date.now() - t0; }).catch(function () { return -1; });
  pruef('Handy: danach ist es weg (nach ' + (ende / 1000).toFixed(1) + ' s, Video 1,9 s)', ende > 1500 && ende < 4800, ende);
  await p.s.screenshot({ path: path.join(AUS, 'intro-handy-danach.png') });
  pruef('kein Seitenfehler', !p.fehler.length, p.fehler.join(' | '));
  // 2. Gleiche Sitzung, neu laden: kein zweites Mal
  await p.s.reload({ waitUntil: 'domcontentloaded' }); await p.s.waitForTimeout(250);
  var z2 = await p.s.evaluate(zustand);
  pruef('gleiche Sitzung, neu geladen: kein zweites Intro', !z2.da, JSON.stringify(z2));
  await p.ctx.close();

  // 3. iPad quer: dasselbe Video randlos, Logo sichtbar
  p = await seite({ viewport: { width: 1180, height: 820 }, dpr: 2 });
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await p.s.waitForTimeout(1100);
  var z3 = await p.s.evaluate(zustand);
  await p.s.screenshot({ path: path.join(AUS, 'intro-ipad-quer.png') });
  // Ibo: "Bildqualität nicht gut, wirkt zu groß" -- vorher randlos, Logo ~1000 px.
  pruef('iPad quer: Video ' + z3.breite + ' x ' + z3.hoehe + ' px (Logo ~' + Math.round(z3.breite * 0.8) + ' px), nicht randlos, nie hochgerechnet', z3.breite > 100 && z3.breite < z3.fenster[0] * 0.35 && z3.pixel <= 1960 && z3.zeit > 0.5, JSON.stringify(z3));
  await p.ctx.close();

  // 3b. Der Flug durch das i füllt das ganze Bild (kein Oval)
  p = await seite({ viewport: { width: 1180, height: 820 }, dpr: 2 });
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  var flug = await p.s.waitForFunction(function () { var v = document.getElementById('splashVideo'); return v && v.currentTime > 1.85 ? true : false; }, null, { timeout: 5000, polling: 16 }).then(function () { return true; }).catch(function () { return false; });
  var zf = await p.s.evaluate(function () { var v = document.getElementById('splashVideo'), sp = document.getElementById('splashScreen'); if (!v || !sp) return null; var rc = v.getBoundingClientRect(); return { flug: sp.classList.contains('flug'), deckt: rc.left <= 1 && rc.top <= 1 && rc.right >= innerWidth - 1 && rc.bottom >= innerHeight - 1, zeit: v.currentTime }; });
  await p.s.screenshot({ path: path.join(AUS, 'intro-ipad-flug.png') });
  pruef('Flug durch das i (ab 1,3 s): bei 1,85 s deckt das Video den ganzen Schirm, kein Oval', flug && zf && zf.flug && zf.deckt, JSON.stringify(zf));
  await p.ctx.close();

  // 4. Sehr schmales Handy: ganz zeigen, sonst wäre das K abgeschnitten
  p = await seite({ viewport: { width: 360, height: 800 } });
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await p.s.waitForTimeout(1100);
  var z4 = await p.s.evaluate(zustand);
  await p.s.screenshot({ path: path.join(AUS, 'intro-schmal.png') });
  pruef('schmales Handy (360 x 800): ganz im Bild, links und rechts Luft', z4.breite > 100 && z4.breite <= z4.fenster[0] * 0.85, JSON.stringify(z4));
  await p.ctx.close();

  // 5. "Bewegung reduzieren": gar kein Intro
  p = await seite({ ruhig: true });
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await p.s.waitForTimeout(200);
  var z5 = await p.s.evaluate(zustand);
  pruef('"Bewegung reduzieren": kein Intro', !z5.da, JSON.stringify(z5));
  await p.ctx.close();

  // 6. Video kommt nicht (kein Netz, gesperrt): nichts hängt
  p = await seite({ ohneVideo: true });
  t0 = Date.now();
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  var weg6 = await p.s.waitForFunction(function () { return !document.getElementById('splashScreen'); }, null, { timeout: 6000 }).then(function () { return Date.now() - t0; }).catch(function () { return -1; });
  pruef('ohne Video: nach ' + (weg6 / 1000).toFixed(1) + ' s weiter, kein grüner Schirm', weg6 > 0 && weg6 < 2500, weg6);
  await p.ctx.close();

  // 7. Der alte Splash ist weg
  var H = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
  pruef('alter Splash (Partikel, Ringe, Ladebalken) ist raus', !/splashParticles|splash-ring|splashBar/.test(H), '');

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
