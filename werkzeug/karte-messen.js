// DIE KARTE IM ECHTEN BROWSER -- Nadeln, Filter, Zeitregler, Karte unten.
//
// Entstanden am 07.10.2026 mit der Karte nach dem Entwurf (Claude Design
// "Die Karte -- sechs Ideen"). Probedaten statt Supabase; Kartenkacheln
// werden nicht geladen (der Proxy sperrt sie) -- gemessen wird alles, was
// die App selbst zeichnet:
//   - Nadel-Zustand: offen / Aktion / zu / ohne Zeiten, Zeichen statt Wort
//   - Schild "Fisch · bis 22", Aktion gold, kein Schild bei "zu"
//   - Filter "Jetzt offen" / "Aktion läuft", Zeitregler zaehlt neu
//   - Karte unten: echte Fakten, kein erfundener Satz, keine "Tische frei"
//   - Kontrast aller Texte hell und dunkel (>= 4,5)
// GRENZE: keine echten Lokale, kein echtes Geraet, keine Kacheln.
// Braucht Leaflet lokal: npm i --no-save leaflet@1.9.4
// AUFRUF   node werkzeug/karte-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8886);

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
  for (var dunkel of [false, true]) {
    var w = dunkel ? 'dunkel' : 'hell';
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); } catch (e) {} }, dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url(), lf = u.match(/unpkg\.com\/leaflet@[^/]+\/dist\/(leaflet\.(js|css))$/);
      // Leaflet kommt in der App vom CDN, das der Proxy sperrt: hier aus node_modules (npm i --no-save leaflet@1.9.4).
      if (lf) { var f = path.join(WURZEL, 'node_modules', 'leaflet', 'dist', lf[1]); if (fs.existsSync(f)) return rt.fulfill({ status: 200, contentType: lf[2] === 'js' ? 'application/javascript' : 'text/css', body: fs.readFileSync(f) }); }
      return /supabase\.co/.test(u) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function () {
      var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
      function hh(x) { x = ((x % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); }
      var tage = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'], oh = function (von, bis) { var o = {}; tage.forEach(function (t) { o[t + '_start'] = von; o[t + '_end'] = bis; }); return o; };
      // Fisch offen bis jetzt+60, zu ab dann; Bar offen 24h mit Aktion; Café ohne Zeiten; Pizza heute zu.
      APP_DATA.restaurants = [
        { id: 'k1', name: 'Hafenkneipe', city: 'Greetsiel', lat: 53.502, lng: 7.096, is_active: true, cuisine_type: ['fisch'], cuisine: 'fisch', opening_hours: oh(hh(m - 120), hh(m + 60)), features: [] },
        { id: 'k2', name: 'Lounge 26', city: 'Greetsiel', lat: 53.5035, lng: 7.099, is_active: true, cuisine_type: ['shisha'], cuisine: 'shisha', opening_hours: oh('00:00', '23:59'), features: [] },
        { id: 'k3', name: 'Teestube', city: 'Greetsiel', lat: 53.5008, lng: 7.093, is_active: true, cuisine_type: ['cafe'], cuisine: 'cafe', features: [] },
        { id: 'k4', name: 'Pizzeria Mare', city: 'Greetsiel', lat: 53.5045, lng: 7.0925, is_active: true, cuisine_type: ['italienisch'], cuisine: 'italienisch', opening_hours: oh(hh(m + 180), hh(m + 240)), features: [] }
      ];
      openFullscreenMap();
    });
    await s.waitForTimeout(1500);
    await s.evaluate(function () { window._karteAktionen = { k2: [{ titel: 'Happy Hour', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '00:00', bis: '23:59' }] }; _mapActiveIndex = 0; updateFullscreenMarkers(); });
    await s.waitForTimeout(300);
    var pins = await s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#fullscreenMapContainer .kn-nadel'), function (e) { var sch = e.querySelector('.kn-schild'); var sym = e.querySelector('.material-symbols-outlined'); return { k: e.className.replace('kn-nadel ', ''), s: sch ? sch.textContent : '', sym: sym ? Math.round(sym.getBoundingClientRect().width) : 0, label: e.getAttribute('aria-label') }; }); });
    var bei = function (name) { return pins.filter(function (p) { return p.label.indexOf(name) === 0; })[0] || {}; };
    pruef(w + ': 4 Nadeln', pins.length === 4, JSON.stringify(pins));
    pruef(w + ': Fisch offen, Schild "Fisch · bis HH"', /offen/.test(bei('Hafenkneipe').k) && /^Fisch · bis \d/.test(bei('Hafenkneipe').s), JSON.stringify(bei('Hafenkneipe')));
    pruef(w + ': Bar mit Aktion gold, Schild "Happy Hour"', /aktion/.test(bei('Lounge 26').k) && bei('Lounge 26').s === 'Happy Hour', JSON.stringify(bei('Lounge 26')));
    pruef(w + ': Café ohne Zeiten: "unbekannt", kein erfundenes "offen"', /unbekannt/.test(bei('Teestube').k) && /Zeiten nicht eingetragen/.test(bei('Teestube').label) && !bei('Teestube').s, JSON.stringify(bei('Teestube')));
    pruef(w + ': Pizza zu: klein, ohne Schild', /\bzu\b/.test(bei('Pizzeria Mare').k) && !bei('Pizzeria Mare').s, JSON.stringify(bei('Pizzeria Mare')));
    pruef(w + ': Symbole sind Zeichen, keine Wörter', pins.every(function (p) { return p.sym < 26; }), JSON.stringify(pins.map(function (p) { return p.sym; })));
    var zahl = await s.evaluate(function () { return document.getElementById('karteZeitText').textContent + ' | ' + document.getElementById('karteZeitZahl').textContent; });
    pruef(w + ': Zeitregler "Jetzt | 2 offen · 1 zu · 1 ohne Zeiten"', zahl === 'Jetzt | 2 offen · 1 zu · 1 ohne Zeiten', zahl);
    var spaeter = await s.evaluate(function () { var r = document.getElementById('karteZeit'); r.value = 120; r.dispatchEvent(new Event('input')); return new Promise(function (ok) { setTimeout(function () { ok(document.getElementById('karteZeitText').textContent + ' | ' + document.getElementById('karteZeitZahl').textContent + ' | ' + document.querySelector('#fullscreenMapContainer [aria-label^="Hafenkneipe"]').className); }, 120); }); });
    pruef(w + ': +2 h: Fisch zu, Text "um HH:MM"', /um \d\d:\d\d \| 1 offen · 2 zu · 1 ohne Zeiten \|.*\bzu\b/.test(spaeter), spaeter);
    await s.evaluate(function () { var r = document.getElementById('karteZeit'); r.value = 0; r.dispatchEvent(new Event('input')); });
    await s.waitForTimeout(120);
    var nurOffen = await s.evaluate(function () { document.querySelector('[data-kfilter="offen"]').click(); return document.querySelectorAll('#fullscreenMapContainer .kn-nadel').length; });
    pruef(w + ': Filter "Jetzt offen": 2 Nadeln', nurOffen === 2, nurOffen);
    var nurAkt = await s.evaluate(function () { document.querySelector('[data-kfilter="aktion"]').click(); return document.querySelectorAll('#fullscreenMapContainer .kn-nadel').length; });
    pruef(w + ': Filter "Aktion läuft": 1 Nadel', nurAkt === 1, nurAkt);
    var karte = await s.evaluate(function () { return { fakten: document.getElementById('mapCardFakten').textContent, aktion: document.getElementById('mapCardAktion').textContent, alles: document.getElementById('fullscreenMapCard').textContent }; });
    pruef(w + ': Karte unten: "Offen bis 23:59", "Läuft gerade: Happy Hour"', /Offen bis 23:59/.test(karte.fakten) && /Läuft gerade: Happy Hour/.test(karte.aktion), JSON.stringify(karte).slice(0, 200));
    pruef(w + ': kein erfundener Satz, keine "Tische frei"', !/frische Gerichte|Tische frei/.test(karte.alles), karte.alles.slice(0, 120));
    await s.evaluate(function () { document.querySelector('[data-kfilter="alle"]').click(); });
    var k = await s.evaluate(function () {
      function z(x) { var m = String(x).match(/rgba?\(([^)]+)\)/); if (!m) return null; var t = m[1].split(',').map(parseFloat); return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 }; }
      function L(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
      function grund(e) { for (; e; e = e.parentElement) { var f = z(getComputedStyle(e).backgroundColor); if (f && f.a > 0.9) return f; } return { r: 255, g: 255, b: 255 }; }
      var raus = [], n = 0;
      document.querySelectorAll('#fullscreenMapContainer .kn-schild, .kn-leiste button, .kn-zeit b, .kn-zeit span, #fullscreenMapCard h2, #fullscreenMapCard p, #fullscreenMapCard .kn-fakt, #fullscreenMapCard .kn-aktion, #fullscreenMapCard button').forEach(function (e) {
        var r = e.getBoundingClientRect(); if (r.width < 4 || getComputedStyle(e).display === 'none' || !e.textContent.trim()) return; n++;
        var a = L(z(getComputedStyle(e).color)), c = L(grund(e)), kk = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
        if (kk < 4.5) raus.push(e.textContent.trim().slice(0, 20) + ' ' + kk.toFixed(2));
      });
      return { n: n, raus: raus };
    });
    pruef(w + ': Kontrast aller ' + k.n + ' Texte >= 4,5', !k.raus.length, k.raus.join(' | '));
    await s.waitForTimeout(600); // Einblenden der Karte abwarten
    await s.screenshot({ path: path.join(AUS, 'karte-' + w + '.png') });
    pruef(w + ': kein Seitenfehler', !fehler.length, fehler.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
