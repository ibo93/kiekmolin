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
             bild: v ? [v.videoWidth, v.videoHeight] : null, dpr: devicePixelRatio,
             maske: v ? getComputedStyle(v).webkitMaskImage || getComputedStyle(v).maskImage || 'none' : null, weg: sp ? sp.classList.contains('weg') : null };
  }

  // cover: Massstab = max(Breite/Bildbreite, Hoehe/Bildhoehe) in Geraete-Pixeln;
  // sichtbar = Anteil des Originals (1080 breit), der nicht abgeschnitten wird.
  function rechne(z) {
    if (!z || !z.bild || !z.bild[0]) return null;
    var k = Math.max(z.breite / z.bild[0], z.hoehe / z.bild[1]);
    var sichtbarBreite = Math.min(1, z.breite / (z.bild[0] * k));
    var orig = z.bild[0] >= z.bild[1] ? 1440 * 9 / 16 : 1080;   // Breite des Originals in dieser Fassung
    var origSichtbar = Math.min(1, (z.bild[0] * sichtbarBreite) / orig);
    return { hoch: Math.round(k * z.dpr * 100) / 100, sichtbar: Math.round(origSichtbar * 100) / 100 };
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
  var r1 = rechne(z1);
  // Ibo: "warum hat das so einen Rahmen -- einfach 1 zu 1"
  pruef('Handy: 1:1 randlos über den ganzen Schirm, kein Rand (Maske), Hochfassung', z1.breite === z1.fenster[0] && z1.hoehe === z1.fenster[1] && /none/.test(z1.maske) && /hoch/.test(z1.quelle || ''), JSON.stringify(z1));
  pruef('Handy: kaum hochgerechnet (' + (r1 && r1.hoch) + 'x), das ganze Logo sichtbar (' + (r1 && Math.round(r1.sichtbar * 100)) + ' % der Breite)', r1 && r1.hoch <= 1.2 && r1.sichtbar >= 0.98, JSON.stringify(r1));
  pruef('Handy: kleine Datei wird geladen (webm/mp4 aus /intro/)', /^kiek-start-v5-(hoch|quer)\.(webm|mp4)$/.test(z1.quelle || ''), z1.quelle);
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
  var r3 = rechne(z3);
  pruef('iPad quer: Querfassung randlos, Original in voller Höhe, nicht hochgerechnet (' + (r3 && r3.hoch) + 'x)', /quer/.test(z3.quelle || '') && z3.breite === z3.fenster[0] && /none/.test(z3.maske) && r3 && r3.hoch <= 1.2 && r3.sichtbar >= 0.99 && z3.zeit > 0.5, JSON.stringify(z3) + ' ' + JSON.stringify(r3));
  await p.ctx.close();

  // 3b. Flug durch das i: das Original deckt den ganzen Schirm -- keine Kante, keine Streifen
  for (var fi = 0; fi < 2; fi++) {
    var vp = fi ? { width: 1180, height: 820 } : { width: 390, height: 844 };
    p = await seite({ viewport: vp, dpr: fi ? 2 : 3 });
    await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
    await p.s.waitForFunction(function () { var v = document.getElementById('splashVideo'); return v && v.currentTime > 1.75; }, null, { timeout: 5000, polling: 16 }).catch(function () {});
    var zf = await p.s.evaluate(function () {
      var v = document.getElementById('splashVideo'), sp = document.getElementById('splashScreen'); if (!v || !sp) return null;
      var quer = v.videoWidth > v.videoHeight, bw = v.videoWidth, bh = v.videoHeight, ow = quer ? 810 : 1080, oh = quer ? 1440 : 1920;
      var m = new DOMMatrix(getComputedStyle(v).transform), k = m.a || 1, W = innerWidth, H = innerHeight;
      var c = Math.max(W / bw, H / bh) * k;   // so gross erscheint ein Bildpunkt
      return { flug: sp.classList.contains('flug'), zeit: v.currentTime, deckt: ow * c >= W - 1 && oh * c >= H - 1, original: [Math.round(ow * c), Math.round(oh * c)], schirm: [W, H] };
    });
    await p.s.screenshot({ path: path.join(AUS, 'intro-flug-' + (fi ? 'ipad' : 'handy') + '.png') });
    pruef((fi ? 'iPad' : 'Handy') + ': beim Flug (1,75 s) deckt das Original den ganzen Schirm -- keine Kante', zf && zf.flug && zf.deckt, JSON.stringify(zf));
    await p.ctx.close();
  }

  // 4. Sehr schmales Handy: ganz zeigen, sonst wäre das K abgeschnitten
  p = await seite({ viewport: { width: 360, height: 800 } });
  await p.s.goto('http://localhost:' + PORT + '/', { waitUntil: 'domcontentloaded' });
  await p.s.waitForTimeout(1100);
  var z4 = await p.s.evaluate(zustand);
  await p.s.screenshot({ path: path.join(AUS, 'intro-schmal.png') });
  var r4 = rechne(z4);
  pruef('schmales Handy (360 x 800, 20:9): Logo (10-90 % der Breite) bleibt ganz im Bild (' + (r4 && Math.round(r4.sichtbar * 100)) + ' % sichtbar)', r4 && r4.sichtbar >= 0.9, JSON.stringify(z4) + ' ' + JSON.stringify(r4));
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
