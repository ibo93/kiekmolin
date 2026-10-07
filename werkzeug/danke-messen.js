// DANKE-BILDSCHIRM -- im echten Browser, nach dem Entwurf "Stempel".
//
// Entstanden am 07.10.2026. Oeffnet die Bestellbestaetigung, fuellt sie wie
// submitOrder es tut, laesst den Bestellstand durchlaufen (eingegangen,
// in Zubereitung mit Zeit, fertig, storniert) und misst Kontrast, Balken und
// ob ein Symbol als WORT im Satz landet (hell und dunkel).
// GRENZE: kein echtes Geraet, keine echte Bestellung.
// AUFRUF   node werkzeug/danke-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8887);

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }
  var KONTRAST = function (sel) {
    function farbe(c) { var m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; }
    function L(f) { return [f.r, f.g, f.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
    function grund(e) { while (e) { var f = farbe(getComputedStyle(e).backgroundColor); if (f.a > 0.9) return f; e = e.parentElement; } return { r: 255, g: 255, b: 255 }; }
    return Array.prototype.map.call(document.querySelectorAll(sel), function (e) {
      var a = L(farbe(getComputedStyle(e).color)), c = L(grund(e));
      return { t: e.textContent.trim().slice(0, 40), k: +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2), sichtbar: e.getBoundingClientRect().width > 0 };
    });
  };
  for (var dunkel of [false, true]) {
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); } catch (e) {} }, dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { return /supabase\.co/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort(); });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    var w = dunkel ? 'dunkel' : 'hell';
    var kopf = await s.evaluate(function () {
      document.querySelectorAll('#installBanner, #toastContainer, .bottom-nav').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      document.getElementById('ocDankeTitel').textContent = ocDankeTitel('Anna Janssen');
      document.getElementById('confirmOrderNumber').textContent = ocDankeZeile('KM-0042', 'pickup', null, new Date(2026, 9, 7, 19, 15).toISOString());
      window.getLoyaltyData = function () { return { orders: 3 }; };
      stempelMoment('0170', 'r1', 'Hafenkneipe');
      openModal('orderConfirmationModal');
      window._trackingOrderType = 'pickup';
      updateOrderTrackerUI('received');
      return document.getElementById('ocDankeTitel').textContent + ' | ' + document.getElementById('confirmOrderNumber').textContent;
    });
    pruef(w + ': Kopf "Danke, Anna!" + Nummer und Abholzeit', kopf === 'Danke, Anna! | Bestellung #KM-0042 · Abholung um 19:15', kopf);
    var zustand = function () { return { satz: document.getElementById('ocStandSatz').textContent, balken: Array.prototype.map.call(document.querySelectorAll('#orderStatusTracker .status-step'), function (e) { var r = e.getBoundingClientRect(); return Math.round(r.height) + ':' + getComputedStyle(e).backgroundColor; }) }; };
    var z = await s.evaluate(zustand);
    pruef(w + ': 5 Balken, 6 px hoch, erster gefuellt', z.balken.length === 5 && z.balken.every(function (x) { return x.split(':')[0] === '6'; }) && z.balken[0].split(':')[1] !== z.balken[1].split(':')[1], JSON.stringify(z.balken));
    pruef(w + ': Satz "Eingegangen – das Restaurant bestätigt gleich"', z.satz === 'Eingegangen – das Restaurant bestätigt gleich', z.satz);
    var k = await s.evaluate(KONTRAST, '#ocDankeTitel, #confirmOrderNumber, .oc-stand-titel, .oc-stand-satz, .kmi-stempel-moment strong');
    var schlecht = k.filter(function (x) { return x.sichtbar && x.k < 4.5; });
    var satzK = (k.filter(function (x) { return /^Eingegangen/.test(x.t); })[0] || {}).k || 0;
    pruef(w + ': Satz kraeftig wie im Entwurf (>= 7 : 1)', satzK >= 7, satzK);
    var striche = await s.evaluate(function () { return Array.prototype.filter.call(document.querySelectorAll('#orderStatusTracker .status-step'), function (e) { return getComputedStyle(e, '::after').display !== 'none' || getComputedStyle(e, '::before').display !== 'none'; }).length; });
    pruef(w + ': keine Striche/Zeichen zwischen den Balken', striche === 0, striche);
    pruef(w + ': alle ' + k.length + ' Texte lesbar (>= 4,5)', k.length >= 4 && !schlecht.length, JSON.stringify(schlecht));
    await s.evaluate(function () { var m = document.querySelector('#orderConfirmationModal .modal'); if (m) m.scrollTop = 0; });
    await s.waitForTimeout(1500);   // Einblenden + Stempel-Sprung abwarten, sonst ist das Bild blass
    var doppelt = await s.evaluate(function () { var x = document.getElementById('liveStatusBanner'); return x ? getComputedStyle(x).display : 'none'; });
    pruef(w + ': Stand steht nur einmal da (kein zweiter Kasten)', doppelt === 'none', doppelt);
    await s.screenshot({ path: path.join(__dirname, 'ausgabe', 'danke-' + w + '.png') });
    var bx = await s.evaluate(function () { var r = document.getElementById('orderTrackerCard').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    await s.screenshot({ path: path.join(__dirname, 'ausgabe', 'danke-stand-' + w + '.png'), clip: bx });
    await s.evaluate(function () { updateOrderTrackerUI('preparing', 20); });
    z = await s.evaluate(zustand);
    pruef(w + ': Zubereitung: 3 Balken, "… · ca. 20 Min.", kein Symbol-Wort', z.satz === 'Wird jetzt frisch zubereitet · ca. 20 Min.' && z.balken.filter(function (x) { return x === z.balken[0]; }).length === 3, JSON.stringify(z));
    await s.evaluate(function () { updateOrderTrackerUI('ready'); });
    z = await s.evaluate(zustand);
    pruef(w + ': fertig (Abholung): "Fertig – du kannst es abholen"', z.satz === 'Fertig – du kannst es abholen', z.satz);
    await s.evaluate(function () { updateOrderTrackerUI('cancelled'); });
    z = await s.evaluate(zustand);
    pruef(w + ': storniert: alle Balken rot, Satz sagt es', z.balken.every(function (x) { return /220, 38, 38|248, 113, 113/.test(x); }) && /^Storniert/.test(z.satz), JSON.stringify(z));
    pruef(w + ': kein Seitenfehler', !fehler.length, fehler.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
