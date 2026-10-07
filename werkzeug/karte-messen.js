// DIE KARTE IM ECHTEN BROWSER -- Nadeln, Filter, Zeitregler, Karte unten.
//
// Entstanden am 07.10.2026 mit der Karte nach dem Entwurf (Claude Design
// "Die Karte -- sechs Ideen"). Probedaten statt Supabase; Kartenkacheln
// werden nicht geladen (der Proxy sperrt sie) -- gemessen wird alles, was
// die App selbst zeichnet:
//   - Nadel = Tropfen 1:1 aus dem Entwurf, Spitze auf dem Ort; Zustand
//     offen / Aktion (gold, Schild darueber) / zu / ohne Zeiten (klein, grau)
//   - "Mehrere": nahe Lokale als Kreis mit Zahl, Tipp zoomt hinein
//   - Zeitregler unten: "Jetzt"/"Heute um", Stunden, "2 offen · 1 zu"
//   - Tipp auf Nadel: Blatt mit Fakten, freien Zeiten, Aktion, Route;
//     Name oeffnet das Lokal, X schliesst
//   - alle Lokale im Bild (3 Orte), Kontrast aller Texte (>= 4,5)
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

// 256x256 einfarbiges PNG (hell #e6e8e3, dunkel #1e2422), ohne Bibliothek.
var zlib = require('zlib');
function flaeche(dunkel) {
  var c = dunkel ? [30, 36, 34] : [230, 232, 227], zeile = Buffer.alloc(1 + 256 * 3), roh = [];
  for (var x = 0; x < 256; x++) { zeile[1 + x * 3] = c[0]; zeile[2 + x * 3] = c[1]; zeile[3 + x * 3] = c[2]; }
  for (var y = 0; y < 256; y++) roh.push(zeile);
  function stueck(typ, daten) { var l = Buffer.alloc(4); l.writeUInt32BE(daten.length); var td = Buffer.concat([Buffer.from(typ), daten]); var crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(td) >>> 0 : crc32(td)); return Buffer.concat([l, td, crc]); }
  function crc32(b) { var t = crc32.t || (crc32.t = Array.from({ length: 256 }, function (_, n) { for (var k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; })); var c2 = 0xffffffff; for (var i = 0; i < b.length; i++) c2 = t[(c2 ^ b[i]) & 255] ^ (c2 >>> 8); return (c2 ^ 0xffffffff) >>> 0; }
  var kopf = Buffer.alloc(13); kopf.writeUInt32BE(256, 0); kopf.writeUInt32BE(256, 4); kopf[8] = 8; kopf[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), stueck('IHDR', kopf), stueck('IDAT', zlib.deflateSync(Buffer.concat(roh))), stueck('IEND', Buffer.alloc(0))]);
}

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
  // hell = Tag, abend = heller Modus nach Sonnenuntergang (dunkle Kacheln), dunkel = Dunkelmodus
  for (var fall of ['hell', 'abend', 'dunkel']) {
    var dunkel = fall === 'dunkel', w = fall;
    var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); } catch (e) {} }, dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url(), lf = u.match(/unpkg\.com\/leaflet@[^/]+\/dist\/(leaflet\.(js|css))$/);
      // Leaflet kommt in der App vom CDN, das der Proxy sperrt: hier aus node_modules (npm i --no-save leaflet@1.9.4).
      if (lf) { var f = path.join(WURZEL, 'node_modules', 'leaflet', 'dist', lf[1]); if (fs.existsSync(f)) return rt.fulfill({ status: 200, contentType: lf[2] === 'js' ? 'application/javascript' : 'text/css', body: fs.readFileSync(f) }); }
      // Kacheln sperrt der Proxy: einfarbige Flaeche statt grauer Bildzeichen (keine erfundenen Strassen).
      if (/arcgisonline\.com\/.*\/tile\//.test(u)) return rt.fulfill({ status: 200, contentType: 'image/png', body: flaeche(/Dark/.test(u)) });
      return /supabase\.co/.test(u) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function (abend) { window.karteNachSonnenuntergang = function () { return abend; }; }, fall === 'abend');
    await s.evaluate(function () {
      var d = new Date(), m = d.getHours() * 60 + d.getMinutes();
      function hh(x) { x = ((x % 1440) + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); }
      var tage = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'], oh = function (von, bis) { var o = {}; tage.forEach(function (t) { o[t + '_start'] = von; o[t + '_end'] = bis; }); return o; };
      // Fisch offen bis jetzt+60, zu ab dann; Bar offen 24h mit Aktion; Café ohne Zeiten; Pizza heute zu.
      APP_DATA.restaurants = [
        { id: 'k1', name: 'Hafenkneipe', city: 'Greetsiel', lat: 53.502, lng: 7.096, is_active: true, image: '/og-image.png', cuisine_type: ['fisch'], cuisine: 'fisch', opening_hours: oh(hh(m - 120), hh(m + 60)), features: [] },
        { id: 'k2', name: 'Lounge 26', city: 'Greetsiel', lat: 53.5035, lng: 7.099, is_active: true, cuisine_type: ['shisha'], cuisine: 'shisha', opening_hours: oh('00:00', '23:59'), features: [] },
        { id: 'k3', name: 'Teestube', city: 'Greetsiel', lat: 53.5008, lng: 7.093, is_active: true, cuisine_type: ['cafe'], cuisine: 'cafe', features: [] },
        { id: 'k4', name: 'Pizzeria Mare', city: 'Greetsiel', lat: 53.5045, lng: 7.0925, is_active: true, cuisine_type: ['italienisch'], cuisine: 'italienisch', opening_hours: oh(hh(m + 180), hh(m + 240)), features: [] }
      ];
      openFullscreenMap();
    });
    await s.waitForTimeout(1500);
    await s.evaluate(function () { window._karteAktionen = { k2: [{ titel: 'Happy Hour', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '00:00', bis: '23:59' }] }; updateFullscreenMarkers(); });
    await s.waitForTimeout(300);
    var TROPFEN = 'M20 50C20 50 4 33 4 19a16 16 0 1 1 32 0c0 14-16 31-16 31z';
    var nadeln = function () { return Array.prototype.map.call(document.querySelectorAll('#fullscreenMapContainer .kd-nadel'), function (e) { var sv = e.querySelector('svg'), r = sv.getBoundingClientRect(), f = e.querySelector('.kd-form'); return { k: e.className.replace('kd-nadel ', ''), label: e.getAttribute('aria-label'), schild: (e.querySelector('.kd-schild') || {}).textContent || '', badge: (e.querySelector('.kd-badge') || {}).textContent || '', b: Math.round(r.width), form: f.getAttribute('d'), farbe: getComputedStyle(f).fill, spitze: { x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom) } }; }); };
    var pins = await s.evaluate(nadeln);
    var bei = function (name) { return pins.filter(function (p) { return p.label.indexOf(name) === 0; })[0] || {}; };
    pruef(w + ': 4 Nadeln, Form 1:1 aus dem Entwurf (Tropfen)', pins.length === 4 && pins.every(function (p) { return p.form === TROPFEN; }), JSON.stringify(pins.map(function (p) { return p.label + '/' + p.form.slice(0, 12); })));
    pruef(w + ': Fisch offen 40 px, GELB, Schild "Fisch · bis HH"', /^offen/.test(bei('Hafenkneipe').k) && bei('Hafenkneipe').b === 40 && /254, 214, 91/.test(bei('Hafenkneipe').farbe) && /^Fisch · bis \d/.test(bei('Hafenkneipe').schild), JSON.stringify(bei('Hafenkneipe')));
    pruef(w + ': Bar mit Aktion gold, Schild "Happy Hour" darüber', /^aktion/.test(bei('Lounge 26').k) && bei('Lounge 26').badge === 'Happy Hour' && /254, 214, 91/.test(bei('Lounge 26').farbe), JSON.stringify(bei('Lounge 26')));
    pruef(w + ': Café ohne Zeiten: klein, grau, kein "offen"', /^unbekannt/.test(bei('Teestube').k) && bei('Teestube').b === 28 && /Zeiten nicht eingetragen/.test(bei('Teestube').label), JSON.stringify(bei('Teestube')));
    pruef(w + ': Pizza zu: klein, Schild "… · zu"', /^zu/.test(bei('Pizzeria Mare').k) && bei('Pizzeria Mare').b === 28 && / · zu$/.test(bei('Pizzeria Mare').schild), JSON.stringify(bei('Pizzeria Mare')));
    var spitzen = await s.evaluate(function () { return (APP_DATA.restaurants).map(function (r) { var p = fullscreenMap.latLngToContainerPoint([r.lat, r.lng]), c = fullscreenMap.getContainer().getBoundingClientRect(); return { name: r.name, x: Math.round(p.x + c.left), y: Math.round(p.y + c.top) }; }); });
    var daneben = spitzen.filter(function (sp) { var pn = bei(sp.name); return !pn.spitze || Math.abs(pn.spitze.x - sp.x) > 3 || Math.abs(pn.spitze.y - sp.y) > 4; });
    pruef(w + ': Spitze jeder Nadel steht genau auf dem Ort (±4 px)', !daneben.length, JSON.stringify(daneben));
    // Zeitregler unten (Entwurf "Zeitregler")
    var zeit = await s.evaluate(function () { var k = document.getElementById('karteZeitKarte'); return { sicht: getComputedStyle(k).display !== 'none', wort: document.getElementById('karteZeitWort').textContent, uhr: document.getElementById('karteZeitText').textContent, zahl: document.getElementById('karteZeitZahl').textContent, stunden: document.querySelectorAll('#karteStunden span').length, jetzt: document.getElementById('karteJetzt').hidden, blatt: getComputedStyle(document.getElementById('fullscreenMapCard')).display }; });
    pruef(w + ': Start: Zeitregler unten sichtbar, kein Blatt', zeit.sicht && zeit.blatt === 'none', JSON.stringify(zeit));
    pruef(w + ': Zeitregler "Jetzt HH:MM", "2 offen 1 zu 1 ohne Zeiten", Stunden', zeit.wort === 'Jetzt' && /^\d\d:\d\d$/.test(zeit.uhr) && zeit.zahl === '2 offen1 zu1 ohne Zeiten' && zeit.stunden >= 5 && zeit.jetzt, JSON.stringify(zeit));
    var spaeter = await s.evaluate(function () { var r = document.getElementById('karteZeit'); r.value = 120; r.dispatchEvent(new Event('input')); return new Promise(function (ok) { setTimeout(function () { ok({ wort: document.getElementById('karteZeitWort').textContent, zahl: document.getElementById('karteZeitZahl').textContent, jetzt: document.getElementById('karteJetzt').hidden, hafen: document.querySelector('#fullscreenMapContainer [aria-label^="Hafenkneipe"]').className }); }, 400); }); });
    pruef(w + ': +2 h: "Heute/Nachts um", "1 offen 2 schon zu", Fisch zu, Knopf "Jetzt"', /^(Heute|Nachts) um$/.test(spaeter.wort) && spaeter.zahl === '1 offen2 schon zu1 ohne Zeiten' && /\bzu\b/.test(spaeter.hafen) && !spaeter.jetzt, JSON.stringify(spaeter));
    await s.evaluate(function () { document.getElementById('karteJetzt').click(); });
    await s.waitForTimeout(150);
    var nurOffen = await s.evaluate(function () { document.querySelector('[data-kfilter="offen"]').click(); return document.querySelectorAll('#fullscreenMapContainer .kd-nadel').length; });
    pruef(w + ': Filter "Jetzt offen": 2 Nadeln', nurOffen === 2, nurOffen);
    var nurAkt = await s.evaluate(function () { document.querySelector('[data-kfilter="aktion"]').click(); return document.querySelectorAll('#fullscreenMapContainer .kd-nadel').length; });
    pruef(w + ': Filter "Aktion läuft": 1 Nadel', nurAkt === 1, nurAkt);
    var wieder = await s.evaluate(function () { document.querySelector('[data-kfilter="aktion"]').click(); return document.querySelectorAll('#fullscreenMapContainer .kd-nadel').length; });
    pruef(w + ': zweiter Tipp auf denselben Chip: wieder alle 4', wieder === 4, wieder);
    var suche = await s.evaluate(function () { var i = document.getElementById('mapSearchInput'); i.value = 'pizz'; i.dispatchEvent(new Event('input')); var n1 = document.querySelectorAll('#fullscreenMapContainer .kd-nadel').length; i.value = ''; i.dispatchEvent(new Event('input')); return n1; });
    pruef(w + ': Suche "pizz": 1 Nadel', suche === 1, suche);
    // Tipp auf eine Nadel -> Blatt (Entwurf "Karte · Tisch frei")
    var blatt = await s.evaluate(function () {
      var bis = new Date(Date.now() + 90 * 60000), t1 = String(bis.getHours()).padStart(2, '0') + ':' + (bis.getMinutes() < 30 ? '30' : '45');
      window._probeZeit = t1;
      window.getTableAvailabilityByTime = function () { return Promise.resolve([{ time: '00:00', free: 3 }, { time: t1, free: 2 }]); };
      var geoeffnet = []; window.openRestaurantBySlug = function (x) { geoeffnet.push(x); }; window._probeOffen = geoeffnet;
      var m = Array.prototype.filter.call(document.querySelectorAll('#fullscreenMapContainer .leaflet-marker-icon'), function (e) { var n = e.querySelector('.kd-nadel'); return n && /^Lounge 26/.test(n.getAttribute('aria-label')); })[0];
      m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return new Promise(function (ok) { setTimeout(function () {
        var c = document.getElementById('fullscreenMapCard'), g = document.querySelector('#fullscreenMapContainer .kd-nadel.gewaehlt');
        ok({ sicht: getComputedStyle(c).display, zeitkarte: getComputedStyle(document.getElementById('karteZeitKarte')).display, name: document.getElementById('mapCardName').textContent, fakten: document.getElementById('mapCardFakten').textContent, aktion: document.getElementById('mapCardAktion').textContent, zeiten: document.getElementById('mapCardZeiten').textContent, gewaehlt: g ? g.getAttribute('aria-label') + '|' + Math.round(g.querySelector('svg').getBoundingClientRect().width) + '|' + !!g.querySelector('.kd-hof') : '', route: document.getElementById('mapCardRoute').getAttribute('href') });
      }, 900); });
    });
    pruef(w + ': Tipp auf Nadel: Blatt auf, Zeitregler weg, Nadel groß mit Hof', blatt.sicht === 'flex' && blatt.zeitkarte === 'none' && /^Lounge 26.*\|52\|true$/.test(blatt.gewaehlt), JSON.stringify(blatt));
    var gewFarbe = await s.evaluate(function () { var g = document.querySelector('#fullscreenMapContainer .kd-nadel.gewaehlt .kd-form'); return g ? getComputedStyle(g).fill : ''; });
    pruef(w + ': gewählte Nadel dunkelgrün (hebt sich vom Gelb ab)', /0, 37, 30/.test(gewFarbe), gewFarbe);
    pruef(w + ': Blatt: Name, "Offen bis 23:59", "Läuft gerade: Happy Hour", Route', blatt.name === 'Lounge 26' && /Offen bis 23:59/.test(blatt.fakten) && /Läuft gerade: Happy Hour/.test(blatt.aktion) && /destination=53\.5035,7\.099/.test(blatt.route || ''), JSON.stringify(blatt));
    var probeZeit = await s.evaluate(function () { return window._probeZeit; });
    pruef(w + ': freie Zeiten nur in der Zukunft, Titel "Freie Tische heute"', blatt.zeiten === 'Freie Tische heute' + probeZeit, blatt.zeiten);
    var wahl = await s.evaluate(function () { var b = document.querySelector('#mapCardZeiten button'); b.click(); var t = document.getElementById('mapCardReserveBtn').textContent; document.getElementById('mapCardName').click(); return { knopf: t, offen: window._probeOffen.join() }; });
    pruef(w + ': Zeit antippen: "HH:MM reservieren"; Name antippen öffnet das Lokal', wahl.knopf === probeZeit + ' reservieren' && wahl.offen === 'k2', JSON.stringify(wahl));
    await s.evaluate(function () { openFullscreenMap(); });
    await s.waitForTimeout(500);
    // ECHTER MAUSKLICK auf das Schild neben einer Nadel (vorher ging der Tipp
    // dort ins Leere) und Protokoll mit ?karteprotokoll=1.
    await s.evaluate(function () { history.replaceState(null, '', '/?karteprotokoll=1'); karteProtokoll('Messung beginnt'); });
    await s.waitForTimeout(300);
    var schildPos = await s.evaluate(function () { var e = document.querySelector('#fullscreenMapContainer .kd-nadel.offen .kd-schild'); if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (schildPos) await s.mouse.click(schildPos.x, schildPos.y);
    await s.waitForTimeout(900);
    var proto = await s.evaluate(function () { return { blatt: getComputedStyle(document.getElementById('fullscreenMapCard')).display, name: document.getElementById('mapCardName').textContent, log: (document.getElementById('karteProtokoll') || {}).textContent || '' }; });
    pruef(w + ': echter Klick auf das Schild "Fisch · bis …" öffnet das Blatt', !!schildPos && proto.blatt === 'flex' && proto.name === 'Hafenkneipe', JSON.stringify(proto).slice(0, 200));
    pruef(w + ': Protokoll (?karteprotokoll=1) zeigt "Nadel angetippt" und "Blatt auf"', /Nadel angetippt: Hafenkneipe/.test(proto.log) && /Blatt auf: Hafenkneipe/.test(proto.log), proto.log.slice(0, 200));
    // Echter Klick auf die Nadel selbst (Lounge), dann Karte ZIEHEN, das Blatt darf dabei nicht neu aufgehen.
    await s.evaluate(function () { karteBlattZu('Messung'); window._karteTippUm = 0; });
    await s.waitForTimeout(800);
    var lp = await s.evaluate(function () { var e = document.querySelector('#fullscreenMapContainer .kd-nadel[aria-label^="Lounge 26"] svg'); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.35 }; });
    await s.mouse.click(lp.x, lp.y);
    await s.waitForTimeout(900);
    var nd = await s.evaluate(function () { return { blatt: getComputedStyle(document.getElementById('fullscreenMapCard')).display, name: document.getElementById('mapCardName').textContent, log: document.getElementById('karteProtokoll').textContent }; });
    pruef(w + ': echter Klick auf die Nadel öffnet das Blatt (Lounge 26)', nd.blatt === 'flex' && nd.name === 'Lounge 26' && /Nadel angetippt: Lounge 26/.test(nd.log), JSON.stringify(nd).slice(0, 220));
    await s.evaluate(function () { karteBlattZu('Messung'); window._karteTippUm = 0; });
    await s.waitForTimeout(800);
    lp = await s.evaluate(function () { var e = document.querySelector('#fullscreenMapContainer .kd-nadel[aria-label^="Lounge 26"] svg'); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.35 }; });
    await s.mouse.move(lp.x, lp.y); await s.mouse.down(); await s.mouse.move(lp.x + 40, lp.y + 30, { steps: 6 }); await s.mouse.up();
    await s.waitForTimeout(700);
    var zieh = await s.evaluate(function () { return getComputedStyle(document.getElementById('fullscreenMapCard')).display; });
    pruef(w + ': Karte ziehen (von einer Nadel aus) öffnet nichts', zieh === 'none', zieh);
    await s.evaluate(function () { history.replaceState(null, '', '/'); var b = document.getElementById('karteProtokoll'); if (b) b.remove(); });
    await s.evaluate(function () { openFullscreenMap(); });
    await s.waitForTimeout(500);
    await s.evaluate(function () { window._karteAktionen = { k2: [{ titel: 'Happy Hour', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4, 5, 6], von: '00:00', bis: '23:59' }] }; updateFullscreenMarkers(); var r = APP_DATA.restaurants[0]; karteLokalWaehlen(r); });
    await s.waitForTimeout(900);
    var k = await s.evaluate(function (fall) {
      function z(x) { var m = String(x).match(/rgba?\(([^)]+)\)/); if (!m) return null; var t = m[1].split(',').map(parseFloat); return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 }; }
      function L(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
      function grund(e) { if (e.closest('.kd-schild')) return fall === 'hell' ? { r: 230, g: 232, b: 227 } : { r: 30, g: 36, b: 34 }; for (; e; e = e.parentElement) { var f = z(getComputedStyle(e).backgroundColor); if (f && f.a > 0.9) return f; } return { r: 255, g: 255, b: 255 }; }
      var raus = [], n = 0;
      document.querySelectorAll('.kd-chips button, .kd-zeit-kopf span, .kd-zeit-kopf b, .kd-zeit-kopf button, .kd-stunden span, .kd-zahlen span, #fullscreenMapContainer .kd-schild, #fullscreenMapContainer .kd-badge, .kd-blatt h2, .kd-blatt p, .kd-fakt, .kd-ueber, .kd-lokal strong, .kd-zeiten-titel, .kd-zeiten button, .kd-aktion span, .kd-knoepfe button').forEach(function (e) {
        var r = e.getBoundingClientRect(); if (r.width < 4 || getComputedStyle(e).display === 'none' || !e.textContent.trim()) return; n++;
        var a = L(z(getComputedStyle(e).color)), c = L(grund(e)), kk = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
        if (kk < 4.5) raus.push(e.textContent.trim().slice(0, 20) + ' ' + kk.toFixed(2));
      });
      return { n: n, raus: raus };
    }, fall);
    pruef(w + ': Kontrast aller ' + k.n + ' Texte >= 4,5', k.n > 15 && !k.raus.length, k.raus.join(' | '));
    // Foto: erst ein Lokal OHNE Foto (frueher blieb danach der Fehler-Stil haengen), dann eins MIT.
    var foto = await s.evaluate(function () {
      _updateMapFloatingCard(APP_DATA.restaurants[2]);
      var ohne = document.getElementById('mapCardInitial').textContent;
      _updateMapFloatingCard(APP_DATA.restaurants[0]);
      return new Promise(function (ok) { setTimeout(function () { var i = document.getElementById('mapCardImg'), c = getComputedStyle(i); ok({ ohne: ohne, fit: c.objectFit, sichtbar: c.display !== 'none', breite: Math.round(i.getBoundingClientRect().width), geladen: i.naturalWidth > 0, buchstabe: document.getElementById('mapCardInitial').textContent }); }, 400); });
    });
    pruef(w + ': ohne Foto Anfangsbuchstabe, mit Foto füllend (cover, 64 px)', foto.ohne === 'T' && foto.fit === 'cover' && foto.sichtbar && foto.breite === 64 && foto.geladen && foto.buchstabe === '', JSON.stringify(foto));
    await s.waitForTimeout(500);
    await s.screenshot({ path: path.join(AUS, 'karte-blatt-' + w + '.png') });
    var zu = await s.evaluate(function () { document.getElementById('mapCardZu').click(); return { blatt: getComputedStyle(document.getElementById('fullscreenMapCard')).display, zeit: getComputedStyle(document.getElementById('karteZeitKarte')).display, gew: document.querySelectorAll('.kd-nadel.gewaehlt').length }; });
    pruef(w + ': ✕ schließt das Blatt, Zeitregler wieder da', zu.blatt === 'none' && zu.zeit !== 'none' && zu.gew === 0, JSON.stringify(zu));
    await s.waitForTimeout(300);
    await s.screenshot({ path: path.join(AUS, 'karte-' + w + '.png') });
    // MEHRERE: fuenf Lokale fast am selben Ort -> ein Kreis "5"; Tipp zoomt hinein.
    var mehr = await s.evaluate(function () {
      APP_DATA.restaurants = [0, 1, 2, 3, 4].map(function (i) { return { id: 'm' + i, name: 'Lokal ' + i, city: 'Greetsiel', lat: 53.5021 + i * 0.0002, lng: 7.0965 + i * 0.0002, is_active: true, features: [] }; });
      updateFullscreenMarkers(); fullscreenMap.setView([53.5025, 7.097], 12, { animate: false });
      return new Promise(function (ok) { setTimeout(function () {
        var kreis = document.querySelectorAll('#fullscreenMapContainer .kd-mehrere'), z0 = fullscreenMap.getZoom(), n0 = document.querySelectorAll('#fullscreenMapContainer .kd-nadel').length;
        var txt = kreis[0] ? kreis[0].textContent : '';
        if (kreis[0]) kreis[0].closest('.leaflet-marker-icon').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        setTimeout(function () { ok({ kreise: kreis.length, zahl: txt, nadeln: n0, vorher: z0, nachher: fullscreenMap.getZoom(), nadelnNachher: document.querySelectorAll('#fullscreenMapContainer .kd-nadel').length }); }, 1200);
      }, 300); });
    });
    pruef(w + ': 5 Lokale am selben Ort: ein Kreis "5" statt einer Nadel', mehr.kreise === 1 && mehr.zahl === '5' && mehr.nadeln === 0, JSON.stringify(mehr));
    pruef(w + ': Tipp auf den Kreis zoomt hinein, dann einzelne Nadeln', mehr.nachher > mehr.vorher && mehr.nadelnNachher >= 2, JSON.stringify(mehr));
    // VERTEILT (07.10.2026): Lokale in drei Orten. Vorher setzte sich die
    // Karte auf deren Mittelwert (Zoom 15) -- freies Land, keine Nadel.
    var verteilt = await s.evaluate(function () {
      APP_DATA.restaurants = [
        { id: 'v1', name: 'Börse', city: 'Greetsiel', lat: 53.5021, lng: 7.0965, is_active: true, cuisine_type: ['fisch'], features: [] },
        { id: 'v2', name: 'Teestube', city: 'Dornum', lat: 53.6466, lng: 7.4314, is_active: true, cuisine_type: ['cafe'], features: [] },
        { id: 'v3', name: 'Lounge', city: 'Norden', lat: 53.5961, lng: 7.2063, is_active: true, cuisine_type: ['shisha'], features: [] },
        { id: 'v4', name: 'Alt', city: 'Emden', lat: 53.367, lng: 7.206, is_active: false, features: [] }
      ];
      initFullscreenMap();
      return new Promise(function (ok) { setTimeout(function () {
        var c = document.getElementById('fullscreenMapContainer').getBoundingClientRect();
        var leiste = document.getElementById('karteLeiste').getBoundingClientRect().bottom;
        var unten = document.getElementById('karteZeitKarte').getBoundingClientRect().top;
        var nadeln = Array.prototype.map.call(document.querySelectorAll('#fullscreenMapContainer .kd-nadel svg'), function (m) { var r = m.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom) }; });
        var drin = nadeln.filter(function (p) { return p.x > c.left + 8 && p.x < c.right - 64 && p.y > leiste && p.y < unten; });
        ok({ nadeln: nadeln.length, drin: drin.length, zoom: fullscreenMap.getZoom() });
      }, 900); });
    });
    pruef(w + ': Lokale in 3 Orten: alle 3 Nadeln im Bild, zwischen Leiste und Zeitregler', verteilt.nadeln === 3 && verteilt.drin === 3, JSON.stringify(verteilt));
    await s.screenshot({ path: path.join(AUS, 'karte-verteilt-' + w + '.png') });
    pruef(w + ': kein Seitenfehler', !fehler.length, fehler.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
