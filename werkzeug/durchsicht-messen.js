// DURCHSICHTIGE FLAECHEN FINDEN -- IM ECHTEN BROWSER.
//
// Entstanden am 06.10.2026 nach Ibos Foto aus der Vorschau: das Selbstcheck-
// Fenster war durchsichtig, das Dashboard stand mitten im Text. Ursache:
// Ich hatte den Weichzeichner pauschal abgeschaltet. Viele Flaechen haben
// einen halb durchsichtigen Grund (z. B. 85 % Weiss), der NUR mit
// Weichzeichner lesbar ist.
//
// Was das Werkzeug prueft, fuer JEDES Element der Seite (auch versteckte
// Fenster -- computed style gibt es auch bei display:none):
//   Grund halb durchsichtig (2 % bis 97 %) UND kein Weichzeichner UND
//   die Flaeche liegt ueber fremdem Inhalt.
// "Ueber fremdem Inhalt" heisst: auf dem Weg nach oben kommt ein fixiertes,
// klebendes oder absolut gesetztes Element, BEVOR eine deckende oder
// weichgezeichnete Flaeche kommt. Ein Eingabefeld in einem Fenster mit
// Weichzeichner ist also in Ordnung -- ein Fenster ohne ist es nicht.
//
// AUFRUF   node werkzeug/durchsicht-messen.js [datei]
// Laeuft nicht in run-all (braucht Chromium) -- wie dunkelmodus-messen.js.
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; }
catch (e) { console.log('playwright-core fehlt -- nichts gemessen.  npm i playwright-core'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var PORT = +(process.env.PORT || 8860);

function pruefe() {
  function alpha(c) { var m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return 0; var t = m[1].split(',').map(parseFloat); return t.length > 3 ? t[3] : 1; }
  function glas(st) { var b = st.backdropFilter || st.webkitBackdropFilter; return !!(b && b !== 'none'); }
  function name(e) { var t = []; for (var q = e; q && q !== document.body && t.length < 3; q = q.parentElement) t.unshift(q.id ? '#' + q.id : (q.tagName.toLowerCase() + (typeof q.className === 'string' && q.className.trim() ? '.' + q.className.trim().split(/\s+/)[0] : ''))); return t.join(' > '); }
  var raus = [];
  document.querySelectorAll('body *').forEach(function (e) {
    var st = getComputedStyle(e); var a = alpha(st.backgroundColor);
    if (!(a > 0.02 && a < 0.97) || glas(st)) return;
    if (st.backgroundImage && st.backgroundImage !== 'none') return;
    // Weg nach oben: kommt erst ein Schwebender oder erst ein sicherer Grund?
    for (var q = e; q && q !== document.documentElement; q = q.parentElement) {
      var qs = q === e ? st : getComputedStyle(q);
      if (q !== e && (alpha(qs.backgroundColor) >= 0.97 || glas(qs))) return;       // sicher
      if (qs.position === 'fixed' || qs.position === 'sticky' || qs.position === 'absolute') {
        // Ein abgedunkelter Hintergrund hinter einem Fenster (Overlay ohne
        // Text) ist gewollt durchsichtig -- er hat keine eigene Schrift.
        if (q === e && !(e.innerText || '').trim()) return;
        raus.push(name(e) + '  (Grund ' + a + ', ' + qs.position + (q === e ? '' : ' bei ' + name(q)) + ')');
        return;
      }
    }
  });
  return raus;
}
(async function () {
  var srv = http.createServer(function (q, r) { var p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] }).catch(function (e) { console.log('Chromium nicht startbar:', e.message); return null; });
  if (!b) { srv.close(); process.exit(0); }
  var gesamt = 0;
  for (var dunkel of [false, true]) {
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); } catch (e) {} }, dunkel);
    var s = await ctx.newPage(); s.on('pageerror', function () {});
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(2500);
    var r = await s.evaluate(pruefe); var u = Array.from(new Set(r));
    gesamt += r.length;
    console.log('\n' + (dunkel ? 'Dunkel' : 'Hell') + ': durchsichtig ueber fremdem Inhalt: ' + r.length + (u.length !== r.length ? ' (' + u.length + ' verschiedene)' : ''));
    u.slice(0, +(process.env.LISTE || 25)).forEach(function (x) { console.log('   ' + x); });
    await ctx.close();
  }
  await b.close(); srv.close();
  process.exit(gesamt ? 1 : 0);
})();
