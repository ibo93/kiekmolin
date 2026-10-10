// TISCHPLAN IM ECHTEN BROWSER -- iPad quer, mit Probedaten.
//
// Entstanden am 06.10.2026 mit dem neuen Tischplan (tp3). Die Quelltext-Tests
// sehen nicht, ob ein Tisch im 3D-Raum an der richtigen Stelle steht, ob die
// Schilder lesbar sind oder ob "Gaeste sind da" wirklich die Datenbank fragt.
//
// Supabase wird hier NICHT erreicht (der Proxy sperrt es). Stattdessen
// beantwortet das Werkzeug die Anfragen selbst mit Probedaten -- und
// protokolliert, was die Seite schreiben wollte. Damit ist messbar:
//   - beide Ansichten zeichnen jeden Tisch (3D und von oben)
//   - Kontrast jedes Textes im Plan, hell und dunkel (Schwelle 4,5 : 1)
//   - Status kommt aus Reservierung / offener Bestellung / Tischruf
//   - Schnell-Reservierung schickt die echte Tisch-ID (uuid), nicht "3"
//   - leere Antwort der Datenbank (RLS) wird als Fehler gemeldet, nicht als Erfolg
//   - fehlende Spalten pos_x/pos_y: Plan geht trotzdem, mit Hinweis
//
// GRENZE: keine echte Datenbank, kein echtes iPad. Bilder landen in
// werkzeug/ausgabe/ (nicht eingecheckt).
//
// AUFRUF   node werkzeug/tischplan-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8883);
var RID = '11111111-1111-4111-8111-111111111111';
function uuid(n) { return '00000000-0000-4000-8000-' + String(n).padStart(12, '0'); }

var heute = new Date().toLocaleDateString('sv-SE');
var jetzt = new Date(); var hh = function (m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':00'; };
var nowMin = jetzt.getHours() * 60 + jetzt.getMinutes();

var TISCHE = [
  [1, 2, 'round', 14, 18], [2, 2, 'round', 34, 18], [3, 4, 'square', 55, 18], [4, 4, 'square', 76, 18],
  [5, 6, 'rectangle', 20, 50], [6, 6, 'rectangle', 48, 50], [9, 4, 'square', 76, 50],
  [7, 8, 'rectangle', 24, 82], [8, 4, 'round', 55, 82], [10, 4, 'round', 74, 82]
].map(function (z) { return { id: uuid(z[0]), table_number: String(z[0]), table_name: 'Tisch ' + z[0], max_capacity: z[1], status: z[0] === 9 ? 'occupied' : 'available', area: 'main', table_shape: z[2], pos_x: z[3], pos_y: z[4], rotation: 0 }; });
TISCHE.push({ id: uuid(20), table_number: '20', table_name: 'Terrasse 1', max_capacity: 4, status: 'available', area: 'terrace', table_shape: 'square', pos_x: 30, pos_y: 40, rotation: 0 });
var RES = [
  { id: 'r-4', guest_name: 'Familie Janssen', guest_phone: '0491 123', party_size: 4, reservation_time: hh(nowMin + 10), duration_minutes: 120, status: 'confirmed', table_id: uuid(4), notes: 'Fensterplatz' },
  { id: 'r-2', guest_name: 'Meyer', guest_phone: null, party_size: 2, reservation_time: hh(nowMin - 20), duration_minutes: 120, status: 'confirmed', table_id: uuid(2), notes: null },
  { id: 'r-7', guest_name: 'Stammtisch', guest_phone: null, party_size: 8, reservation_time: hh(nowMin - 40), duration_minutes: 180, status: 'seated', table_id: uuid(7), notes: null },
  // feste Uhrzeit, fuer den Zeitschieber (Terrasse -- stoert die Gastraum-Pruefungen nicht)
  { id: 'r-20', guest_name: 'Abendgast', guest_phone: null, party_size: 4, reservation_time: '19:00:00', duration_minutes: 120, status: 'confirmed', table_id: uuid(20), notes: null }
];
var ORDERS = [{ table_number: '3', total: '48.50', created_at: new Date(Date.now() - 38 * 60000).toISOString() }];
var RUFE = { ok: true, rufe: [{ tisch: '6', grund: 'pay' }] };

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(text, ok, mehr) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + text + (ok ? '' : '  -> ' + (mehr || ''))); }

  async function seite(opt) {
    opt = opt || {};
    var ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
    var geschrieben = [];
    // Nachbau der Eindeutigkeit (restaurant_id, table_number): aktive + gelöschte Nummern.
    var belegt = TISCHE.map(function (t) { return t.table_number; }).concat((opt.geloescht || []).map(String));
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); localStorage.setItem('kmi_tp3_ansicht', '3d'); } catch (e) {} }, !!opt.dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, async function (rt) {
      var u = rt.request().url(), m = rt.request().method();
      var json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/supabase\.co\/rest\/v1\/restaurant_tables/.test(u)) {
        if (m === 'GET') {
          if (opt.ohneSpalten && /pos_x/.test(u)) return json({ code: '42703', message: 'column restaurant_tables.pos_x does not exist' }, 400);
          var liste = TISCHE.map(function (t) { var c = Object.assign({}, t); if (opt.ohneSpalten) { delete c.pos_x; delete c.pos_y; delete c.rotation; } return c; });
          // Gelöschte Tische (is_active = false) bleiben mit ihrer Nummer in der Tabelle.
          if (opt.geloescht && !/is_active=eq\.true/.test(u)) liste = liste.concat(opt.geloescht.map(function (nr) { return { id: 'alt-' + nr, table_number: String(nr), is_active: false }; }));
          return json(liste);
        }
        geschrieben.push({ m: m, u: u, body: rt.request().postData() });
        // Wie live am 08.10.2026 08:51 UTC: Nummer gehört einem gelöschten Tisch -> 409 / 23505.
        if (opt.geloescht && m === 'PATCH' && /is_active=eq\.false&table_number=eq\./.test(u)) {
          var fr = decodeURIComponent(/table_number=eq\.([^&]+)/.exec(u)[1]);
          if (!opt.immer409 && opt.geloescht.map(String).indexOf(fr) >= 0) belegt = belegt.filter(function (x) { return x !== fr; });
          return rt.fulfill({ status: 204, body: '' });
        }
        if (opt.geloescht && m === 'POST') {
          var nr = String(JSON.parse(rt.request().postData() || '{}').table_number);
          if (opt.immer409 || belegt.indexOf(nr) >= 0) return json({ code: '23505', details: 'Key (restaurant_id, table_number)=(r, ' + nr + ') already exists.', message: 'duplicate key value violates unique constraint "restaurant_tables_restaurant_id_table_number_key"' }, 409);
          belegt.push(nr);
        }
        if (opt.rlsLeer) return json([]);
        return json([Object.assign({}, TISCHE[0], JSON.parse(rt.request().postData() || '{}'))], m === 'POST' ? 201 : 200);
      }
      if (/supabase\.co\/rest\/v1\/reservations/.test(u)) {
        if (m === 'GET') return json(RES);
        geschrieben.push({ m: m, u: u, body: rt.request().postData() });
        // Wie die echte Datenbank bis datenbank/40: table_id zeigt noch auf "tables" -> 409 / 23503.
        if (opt.altFk && m === 'POST' && JSON.parse(rt.request().postData() || '{}').table_id)
          return json({ code: '23503', details: 'Key is not present in table "tables".', message: 'insert or update on table "reservations" violates foreign key constraint "reservations_table_id_fkey"' }, 409);
        return json(opt.rlsLeer ? [] : [Object.assign({ id: 'neu' }, JSON.parse(rt.request().postData() || '{}'))], 201);
      }
      if (/supabase\.co\/rest\/v1\/orders/.test(u)) return json(ORDERS);
      // Raum (41-tischplan-raum.sql): L-Form, feste Teile.
      if (/supabase\.co\/rest\/v1\/restaurants\?id=eq\./.test(u)) {
        if (m === 'GET') {
          if (opt.ohneRaum && /tischplan_raum/.test(u)) return json({ code: '42703', message: 'column restaurants.tischplan_raum does not exist' }, 400);
          return json([{ tischplan_raum: opt.raum || null }]);
        }
        geschrieben.push({ m: m, u: u, body: rt.request().postData() });
        if (opt.ohneRaum) return json({ code: '42703', message: 'column restaurants.tischplan_raum does not exist' }, 400);
        return json(opt.rlsLeer ? [] : [JSON.parse(rt.request().postData() || '{}')]);
      }
      if (/supabase\.co\/rest\/v1\/rpc\//.test(u)) { geschrieben.push({ m: m, u: u, body: rt.request().postData() }); return json({ success: true }); }
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    await ctx.route(/\/\.netlify\/functions\/waiter-pending/, function (rt) { rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RUFE) }); });
    var s = await ctx.newPage(); var fehler = [];
    s.on('pageerror', function (e) { if (/tp3/.test(String(e.stack || e.message))) fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(2000);
    await s.evaluate(function (rid) {
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var d = document.getElementById('dashboardView'); var p = d; while (p && p !== document.body) { p.style.setProperty('display', 'block', 'important'); /* wie .dashboard-view.active (frueher 'flex': schrumpfte den Plan) */ p = p.parentElement; }
      document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === 'sectionReservations' ? 'block' : 'none', 'important'); });
      window.resCurrentRestaurant = rid;
      // Gaeste-Elemente mit position:fixed (Warenkorb ...) liegen sonst ueber dem
      // Bild -- sie gehoeren nicht zum Dashboard und waeren dort nie offen.
      Array.prototype.forEach.call(document.body.children, function (el) { if (!el.contains(d) && getComputedStyle(el).position === 'fixed') el.style.setProperty('display', 'none', 'important'); });
      document.getElementById('resTabBtnFloorplan').click();
    }, RID);
    await s.waitForTimeout(1500);
    return { ctx: ctx, s: s, geschrieben: geschrieben, fehler: fehler };
  }
  function kontrast() {
    function zahlen(x) { var m = String(x).match(/rgba?\(([^)]+)\)/); if (!m) return null; var t = m[1].split(',').map(parseFloat); return { r: t[0], g: t[1], b: t[2], a: t.length > 3 ? t[3] : 1 }; }
    function drauf(v, h) { return [v.r * v.a + h[0] * (1 - v.a), v.g * v.a + h[1] * (1 - v.a), v.b * v.a + h[2] * (1 - v.a)]; }
    function L(c) { var f = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; }
    var gf = document.body.classList.contains('dark-mode') ? [14, 14, 14] : [250, 250, 250];
    function grund(el) { var sch = []; for (var k = el; k && k !== document.documentElement; k = k.parentElement) { var st = getComputedStyle(k); if (st.backgroundImage && st.backgroundImage !== 'none' && k.id !== 'tp3Boden') return null; var f = zahlen(st.backgroundColor); if (f && f.a > 0) { sch.push(f); if (f.a >= 0.999) break; } } var c = gf.slice(); for (var i = sch.length - 1; i >= 0; i--) c = drauf(sch[i], c); return c; }
    var raus = [], n = 0;
    document.querySelectorAll('#tp3 *').forEach(function (el) {
      var t = ''; for (var j = 0; j < el.childNodes.length; j++) if (el.childNodes[j].nodeType === 3) t += el.childNodes[j].nodeValue;
      t = t.trim(); if (t.length < 1 || el.closest('style,script')) return;
      var r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
      for (var q = el; q && q.id !== 'tp3'; q = q.parentElement) { var st = getComputedStyle(q); if (st.display === 'none' || st.visibility === 'hidden') return; }
      var tf = zahlen(getComputedStyle(el).color), g = grund(el); if (!tf || !g) return; n++;
      var sc = drauf(tf, g), a = L(sc), b2 = L(g), k = (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
      if (k < 4.5) raus.push(Math.round(k * 100) / 100 + ' "' + t.slice(0, 30) + '"');
    });
    return { n: n, raus: raus };
  }
  function imBild() {
    var b = document.getElementById('tp3Buehne').getBoundingClientRect(), aus = [];
    document.querySelectorAll('#tp3Boden .tp3-schild > span').forEach(function (s) { var r = s.getBoundingClientRect(); if (r.left < b.left - 2 || r.right > b.right + 2 || r.top < b.top - 2 || r.bottom > b.bottom + 2) aus.push(s.textContent); });
    return aus;
  }
  function ueberlappt() {
    var sp = Array.prototype.slice.call(document.querySelectorAll('#tp3Boden .tp3-schild > span')).map(function (s) { return [s.textContent, s.getBoundingClientRect()]; }), o = [];
    for (var i = 0; i < sp.length; i++) for (var j = i + 1; j < sp.length; j++) { var a = sp[i][1], c = sp[j][1]; if (a.left < c.right - 2 && c.left < a.right - 2 && a.top < c.bottom - 2 && c.top < a.bottom - 2) o.push(sp[i][0] + ' / ' + sp[j][0]); }
    return o;
  }

  // ---------- 1. hell, 3D ----------
  var p = await seite();
  var tische = await p.s.evaluate(function () { return document.querySelectorAll('#tp3Boden .tp3-tisch').length; });
  pruef('3D: alle 10 Tische des Gastraums gezeichnet', tische === 10, tische);
  var z = await p.s.evaluate(function () { var o = {}; document.querySelectorAll('#tp3Boden .tp3-schild').forEach(function (s) { o[s.querySelector('b').textContent] = s.className.replace('tp3-schild ', ''); }); return o; });
  pruef('Tisch 3 besetzt (offene Bestellung)', z['3'] === 'bes', JSON.stringify(z));
  pruef('Tisch 6 ruft (Tischruf)', z['6'] === 'ruft', z['6']);
  pruef('Tisch 4 reserviert (in 10 Min.)', z['4'] === 'res', z['4']);
  pruef('Tisch 7 besetzt (Reservierung sitzt)', z['7'] === 'bes', z['7']);
  pruef('Tisch 9 besetzt (Status in der Datenbank)', z['9'] === 'bes', z['9']);
  pruef('Tisch 1 frei', z['1'] === 'frei', z['1']);
  var k = await p.s.evaluate(kontrast);
  pruef('hell 3D: Kontrast aller ' + k.n + ' Texte >= 4,5', !k.raus.length, k.raus.join(' | '));
  var aus = await p.s.evaluate(imBild); pruef('3D: kein Schild ragt aus der Bühne', !aus.length, aus.join(', '));
  var ue = await p.s.evaluate(ueberlappt); pruef('3D: keine zwei Schilder überdecken sich', !ue.length, ue.join(', '));
  // Lesbar = Schrift mind. 12 px; antippbar = Tippflaeche mind. 40 px hoch.
  // (Vorher: sichtbare Hoehe >= 28 px. Die ruhigen Schilder sind kleiner zu
  // sehen, ihre Tippflaeche ist durch einen unsichtbaren Rand groesser.)
  await p.s.evaluate(function () { document.getElementById('tp3Buehne').scrollIntoView({ block: 'center' }); }); await p.s.waitForTimeout(100);
  var gross = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp3Boden .tp3-schild:not(.teil) > span'), function (s) {
    var r = s.getBoundingClientRect(), f = parseFloat(getComputedStyle(s).fontSize), cx = r.left + r.width / 2, oben = 0, unten = 0;
    for (var y = r.top + r.height / 2; y > r.top - 30; y--) { var e = document.elementFromPoint(cx, y); if (!e || !(e === s || s.contains(e))) break; oben = r.top + r.height / 2 - y; }
    for (var y2 = r.top + r.height / 2; y2 < r.bottom + 30; y2++) { var e2 = document.elementFromPoint(cx, y2); if (!e2 || !(e2 === s || s.contains(e2))) break; unten = y2 - (r.top + r.height / 2); }
    return Math.round(f * 1.0) + 'px/' + Math.round(oben + unten); }); });
  pruef('3D: jedes Schild lesbar (Schrift >= 12 px) und antippbar (Tippfläche >= 40 px)', gross.every(function (x) { var p2 = x.split('px/'); return +p2[0] >= 12 && +p2[1] >= 40; }), gross.join(','));
  var neben = await p.s.evaluate(function () { var a = document.getElementById('tp3Buehne').getBoundingClientRect(), c = document.getElementById('tp3Seite').getBoundingClientRect(); return [Math.round(a.right), Math.round(c.left), Math.round(a.top), Math.round(c.top)]; });
  pruef('iPad quer mit Dashboard-Leiste: Tischleiste steht NEBEN dem Plan', neben[1] >= neben[0] && Math.abs(neben[2] - neben[3]) < 4, neben);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-3d-hell.png') });
  // Tisch 4 antippen
  await p.s.evaluate(function (id) { document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]').click(); }, uuid(4));
  await p.s.waitForTimeout(200);
  var seiteText = await p.s.evaluate(function () { return document.getElementById('tp3Seite').innerText; });
  pruef('Antippen zeigt den Gast in der Seitenleiste', /Familie Janssen/.test(seiteText) && /Gäste sind da/.test(seiteText), seiteText.slice(0, 80));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-3d-gewaehlt.png') });
  // Gaeste sind da -> RPC
  await p.s.evaluate(function () { document.querySelector('#tp3Seite [data-aktion="da"]').click(); });
  await p.s.waitForTimeout(800);
  var rpc = p.geschrieben.filter(function (g) { return /rpc\/update_reservation_details/.test(g.u); });
  pruef('"Gäste sind da" schreibt status seated über die RPC', rpc.length === 1 && /"p_status":"seated"/.test(rpc[0].body), JSON.stringify(p.geschrieben));
  // Tisch 1 frei -> Schnell-Reservierung
  await p.s.evaluate(function (id) { window.tp3.gewaehlt = id; document.getElementById('tp3Bereiche').click(); }, uuid(1));
  await p.s.evaluate(function (id) { document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]').click(); }, uuid(1));
  await p.s.waitForTimeout(200);
  await p.s.fill('#tp3sName', 'Probe Gast'); await p.s.fill('#tp3sPers', '2');
  await p.s.evaluate(function () { document.querySelector('#tp3Seite [data-aktion="reservieren"]').click(); });
  await p.s.waitForTimeout(800);
  var post = p.geschrieben.filter(function (g) { return g.m === 'POST' && /rest\/v1\/reservations/.test(g.u); });
  pruef('Schnell-Reservierung schickt die echte Tisch-ID (uuid)', post.length === 1 && JSON.parse(post[0].body).table_id === uuid(1), post[0] && post[0].body);
  pruef('Plan wirft keinen Fehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 1b. Tische zusammenschieben (08.10.2026) ----------
  // Gruppe von 8 an Tisch 8 (4 Plätze): der Plan schlägt Tische in der Nähe vor.
  p = await seite();
  await p.s.evaluate(function (id) { window.tp3.gewaehlt = id; document.getElementById('tp3Bereiche').click(); }, uuid(8));
  await p.s.evaluate(function (id) { document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]').click(); }, uuid(8));
  await p.s.waitForTimeout(200);
  await p.s.fill('#tp3sName', 'Gruppe Probe'); await p.s.fill('#tp3sPers', '8'); await p.s.waitForTimeout(100);
  var vor = await p.s.evaluate(function () { var d = document.getElementById('tp3Dazu'); return { text: d ? d.innerText.replace(/\s+/g, ' ') : '', chips: Array.prototype.map.call(document.querySelectorAll('#tp3Dazu [data-dazu]'), function (b) { return b.innerText.replace(/\s+/g, ' '); }) }; });
  pruef('8 Personen an einem 4er-Tisch: "fehlen 4", Vorschläge in der Nähe (nicht der besetzte 9)', /fehlen 4/.test(vor.text) && vor.chips.length > 0 && !vor.chips.some(function (c) { return /^9 /.test(c); }), JSON.stringify(vor));
  await p.s.click('#tp3Dazu [data-aktion="dazu-auto"]'); await p.s.waitForTimeout(100);
  var nach = await p.s.evaluate(function (id10) { return { text: document.getElementById('tp3Dazu').innerText.replace(/\s+/g, ' '), dazu: window.tp3.dazu.slice(), name: document.getElementById('tp3sName').value,
    markiert: !!document.querySelector('#tp3Boden .tp3-tisch.dazu[data-id="' + id10 + '"]') }; }, uuid(10));
  pruef('"Passende Tische dazunehmen": Tisch 10 dazu, "passt für 8", im Plan markiert', nach.dazu.length === 1 && nach.dazu[0] === uuid(10) && /passt für 8/.test(nach.text) && nach.markiert, JSON.stringify(nach));
  pruef('der eingetippte Name bleibt stehen (nur der Block wird neu gezeichnet)', nach.name === 'Gruppe Probe', nach.name);
  await p.s.evaluate(function () { document.querySelector('#tp3Seite [data-aktion="reservieren"]').click(); });
  await p.s.waitForTimeout(800);
  var gp = p.geschrieben.filter(function (g) { return g.m === 'POST' && /rest\/v1\/reservations/.test(g.u); }).map(function (g) { return JSON.parse(g.body); })[0] || {};
  pruef('gespeichert: table_id = Tisch 8, Notiz "Zusammen mit: Tisch 10", 8 Personen', gp.table_id === uuid(8) && gp.notes === 'Zusammen mit: Tisch 10' && gp.party_size === 8, JSON.stringify(gp));
  // So kommt sie beim nächsten Laden zurück: im Plan an beiden Tischen, verbunden
  var plan = await p.s.evaluate(function (g) {
    window.tp3.res.push(Object.assign({ id: 'neu-gruppe', duration_minutes: 120 }, g, { reservation_time: g.reservation_time + ':00' }));
    window.tp3.gewaehlt = null; document.querySelector('#tp3Bereiche [data-bereich="main"]').click();
    var s10 = document.querySelector('#tp3Boden .tp3-schild span[data-id="' + g.zehn + '"]'), s8 = document.querySelector('#tp3Boden .tp3-schild span[data-id="' + g.table_id + '"]');
    return { zehn: s10 && s10.parentNode.className + ' ' + s10.textContent, acht: s8 && s8.parentNode.className + ' ' + s8.textContent, linie: document.querySelectorAll('#tp3Boden .tp3-verbund').length };
  }, Object.assign({}, gp, { zehn: uuid(10) }));
  pruef('im Plan: beide Tische reserviert, Schild "mit 10" / "mit 8", gestrichelte Linie', /res/.test(plan.acht) && /mit 10/.test(plan.acht) && /res/.test(plan.zehn) && /mit 8/.test(plan.zehn) && plan.linie === 1, JSON.stringify(plan));
  await p.s.click('#tp3AnsichtOben'); await p.s.waitForTimeout(150);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-zusammen-oben.png') });
  pruef('kein Seitenfehler beim Zusammenschieben', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 1a. Alte Tisch-Regel in der Datenbank (gemessen 07.10.2026) ----------
  p = await seite({ altFk: true });
  await p.s.evaluate(function (id) { window.tp3.gewaehlt = id; document.getElementById('tp3Bereiche').click(); }, uuid(1));
  await p.s.evaluate(function (id) { document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]').click(); }, uuid(1));
  await p.s.waitForTimeout(200);
  await p.s.fill('#tp3sName', 'Celina Probe'); await p.s.fill('#tp3sPers', '2');
  await p.s.evaluate(function () { document.querySelector('#tp3Seite [data-aktion="reservieren"]').click(); });
  await p.s.waitForTimeout(900);
  post = p.geschrieben.filter(function (g) { return g.m === 'POST' && /rest\/v1\/reservations/.test(g.u); });
  var zweiter = post[1] ? JSON.parse(post[1].body) : {};
  pruef('409 wegen alter Tisch-Regel: zweiter Versuch ohne table_id, Tisch in der Notiz', post.length === 2 && !('table_id' in zweiter) && zweiter.notes === 'Tisch: Tisch 1', JSON.stringify(post.map(function (g) { return g.body; })));
  var mel = await p.s.evaluate(function () { var m = document.getElementById('tp3Meldung'); return m.className + ' | ' + m.textContent; });
  pruef('... und sagt es ehrlich (Hinweis mit 40-tisch-zuordnung.sql), kein roter Fehler', /hinweis/.test(mel) && /40-tisch-zuordnung\.sql/.test(mel) && !/fehler/.test(mel), mel);
  var amTisch = await p.s.evaluate(function (id) {
    var d = new Date(Date.now() + 10 * 60000), z = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':00';
    window.tp3.res.push({ id: 'nur-notiz', guest_name: 'Celina Probe', party_size: 2, reservation_time: z, status: 'confirmed', table_id: null, notes: 'Tisch: Tisch 1' });
    window.tp3.gewaehlt = null; document.getElementById('tp3Jetzt').click();
    var sch = document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]'); sch = sch && sch.closest('.tp3-schild');
    return sch ? sch.className : '(kein Schild)';
  }, uuid(1));
  pruef('Reservierung nur mit "Tisch: Tisch 1" in der Notiz steht im Plan an Tisch 1', /\bres\b/.test(amTisch), amTisch);
  pruef('Plan wirft keinen Fehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 1b. Zeitschieber ----------
  p = await seite();
  var zs = await p.s.evaluate(function () { var j = document.getElementById('tp3Jetzt'), r = document.getElementById('tp3Schieber'); return { jetzt: j && j.getAttribute('aria-pressed'), da: !!r, alt: !!document.getElementById('tp3Zeiten') }; });
  pruef('Zeitschieber da, "Jetzt" gewählt, alte Zeit-Knöpfe weg', zs.da && zs.jetzt === 'true' && !zs.alt, JSON.stringify(zs));
  var morgen = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE');
  await p.s.evaluate(function (d) { var e = document.getElementById('tp3Datum'); e.value = d; e.dispatchEvent(new Event('change')); }, morgen);
  await p.s.waitForTimeout(600);
  await p.s.evaluate(function () { document.querySelector('#tp3Bereiche [data-bereich="terrace"]').click(); });
  async function schieben(min) {
    await p.s.evaluate(function (m) { var r = document.getElementById('tp3Schieber'); r.value = m; r.dispatchEvent(new Event('input')); }, min);
    await p.s.waitForTimeout(150);
    return p.s.evaluate(function (id) {
      var t = document.querySelector('#tp3Boden .tp3-schild[data-id="' + id + '"]') || document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]');
      var sch = t ? (t.classList.contains('tp3-schild') ? t : t.closest('.tp3-schild')) : null;
      return { art: sch ? ['frei', 'res', 'bes', 'ruft'].filter(function (k) { return sch.classList.contains(k); })[0] : null,
               anzeige: document.getElementById('tp3ZeitAnzeige').textContent, info: document.getElementById('tp3ZeitInfo').textContent };
    }, uuid(20));
  }
  var um19 = await schieben(19 * 60);
  pruef('Schieber auf 19:00: Terrassen-Tisch reserviert, "1 von 1"', um19.art === 'res' && /19:00 Uhr/.test(um19.anzeige) && /^1 von 1/.test(um19.info), JSON.stringify(um19));
  var um22 = await schieben(22 * 60);
  pruef('Schieber auf 22:00: wieder frei, "0 von 1"', um22.art === 'frei' && /22:00/.test(um22.anzeige) && /^0 von 1/.test(um22.info), JSON.stringify(um22));
  var balken = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp3Balken i'), function (i) { return i.title + '|' + i.className; }); });
  pruef('Balken 19:00 orange (voll), 17:00 leer', balken.some(function (x) { return /^19:00 · 1 von 1/.test(x) && /eng/.test(x); }) && balken.some(function (x) { return /^17:00 · 0 von 1/.test(x) && !/eng/.test(x); }), balken.join(', '));
  // Median aus 5 Runden je 10 Bildern: eine einzelne Runde schwankte mit der
  // Rechnerlast um ±50 % (gemessen 08.10.2026: dieselbe Fassung 14,7 und 22,9 ms).
  var dauer = await p.s.evaluate(function () { document.querySelector('#tp3Bereiche [data-bereich="main"]').click(); var runden = []; for (var k = 0; k < 5; k++) { var t0 = performance.now(); for (var i = 0; i < 10; i++) { document.getElementById('tp3Jetzt').click(); } runden.push((performance.now() - t0) / 10); } runden.sort(function (a, b) { return a - b; }); return runden[2]; });
  // Zwei Zeiten, an denen sicher kein Tisch wechselt: die Probe-Reservierungen
  // liegen um "jetzt" herum (bis 70 min davor, 140 min danach) und um 19:00.
  // Vorher fest 20:15 -> 20:30: gegen 20:40 Uhr sprang Tisch 4 genau dort auf
  // reserviert, und der Test war rot, ohne dass der Plan etwas falsch machte.
  var ruhig = nowMin >= 15 * 60 + 30 ? [720, 735] : [1335, 1350];
  var leicht = await p.s.evaluate(function (zz) { var r = document.getElementById('tp3Schieber'); r.value = zz[0]; r.dispatchEvent(new Event('input')); return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(function () { var b = document.getElementById('tp3Boden').firstElementChild, t0 = performance.now(); r.value = zz[1]; r.dispatchEvent(new Event('input')); requestAnimationFrame(function () { ok({ ms: performance.now() - t0, gleich: document.getElementById('tp3Boden').firstElementChild === b, anz: document.getElementById('tp3ZeitAnzeige').textContent }); }); }); }); }); }, ruhig);
  pruef('Ziehen ohne Zustandswechsel: Boden bleibt stehen, nur die Zeit wechselt', leicht.gleich && leicht.anz.indexOf(hh(ruhig[1]).slice(0, 5)) === 0, JSON.stringify(leicht));
  pruef('Neuzeichnen beim Ziehen schnell genug (< 16 ms je Bild): ' + dauer.toFixed(1) + ' ms', dauer < 16, dauer);
  k = await p.s.evaluate(kontrast); pruef('hell mit Schieber: Kontrast aller ' + k.n + ' Texte >= 4,5', !k.raus.length, k.raus.join(' | '));
  await p.s.setViewportSize({ width: 820, height: 1180 }); await p.s.waitForTimeout(300);
  var quer = await p.s.evaluate(function () { var z = document.getElementById('tp3Zeitleiste'); return z.scrollWidth <= z.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; });
  pruef('iPad hochkant: Zeitleiste passt, nichts ragt raus', quer === true, quer);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-zeitschieber.png') });
  pruef('Plan wirft keinen Fehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 2. von oben + bearbeiten ----------
  p = await seite();
  await p.s.click('#tp3AnsichtOben'); await p.s.waitForTimeout(300);
  var tr = await p.s.evaluate(function () { return document.getElementById('tp3Boden').style.transform; });
  pruef('Von oben: Boden ist nicht gekippt', !/rotateX/.test(tr), tr);
  aus = await p.s.evaluate(imBild); pruef('Von oben: kein Schild ragt aus der Bühne', !aus.length, aus.join(', '));
  ue = await p.s.evaluate(ueberlappt); pruef('Von oben: keine zwei Schilder überdecken sich', !ue.length, ue.join(', '));
  var gemerkt = await p.s.evaluate(function () { return localStorage.getItem('kmi_tp3_ansicht'); });
  pruef('die gewählte Ansicht merkt sich das Gerät', gemerkt === 'oben', gemerkt);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-oben.png') });
  await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(300);
  // Tisch 1 mit dem "Finger" ziehen
  var box = await p.s.evaluate(function (id) { var r = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, uuid(1));
  await p.s.mouse.move(box.x, box.y); await p.s.mouse.down(); await p.s.mouse.move(box.x + 60, box.y + 40, { steps: 8 }); await p.s.mouse.up();
  await p.s.waitForTimeout(200);
  var lage = await p.s.evaluate(function (id) { var t = window.tp3.tische.find(function (x) { return x.id === id; }); return [t.x, t.y]; }, uuid(1));
  pruef('Ziehen verschiebt den Tisch und rastet ein (2,5 %)', lage[0] !== 14 && lage[0] % 2.5 === 0 && lage[1] % 2.5 === 0, lage);
  k = await p.s.evaluate(kontrast); pruef('hell Bearbeiten: Kontrast aller ' + k.n + ' Texte >= 4,5', !k.raus.length, k.raus.join(' | '));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-bearbeiten.png') });
  await p.s.click('#tp3Fertig'); await p.s.waitForTimeout(800);
  var patch = p.geschrieben.filter(function (g) { return g.m === 'PATCH' && /restaurant_tables/.test(g.u); });
  pruef('Fertig speichert die neue Lage (pos_x/pos_y)', patch.length === 1 && JSON.parse(patch[0].body).pos_x === lage[0], patch[0] && patch[0].body);
  pruef('Plan wirft keinen Fehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 3. dunkel ----------
  p = await seite({ dunkel: true });
  var platte = await p.s.evaluate(function (id) { var t = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]'); var f = t.querySelectorAll('.tp3-f'); return getComputedStyle(f[f.length - 1]).backgroundColor; }, uuid(1));
  pruef('dunkel: freier Tisch bleibt hell (nicht schwarz umgefaerbt)', /rgb\(25[01], 25[0-2], 25[01]\)/.test(platte), platte);
  var zahl = await p.s.evaluate(function () { return getComputedStyle(document.querySelector('#tp3Zahlen b.frei')).color; });
  pruef('dunkel: Zahl "frei" bleibt gruen', zahl === 'rgb(134, 239, 172)', zahl);
  k = await p.s.evaluate(kontrast); pruef('dunkel 3D: Kontrast aller ' + k.n + ' Texte >= 4,5', !k.raus.length, k.raus.join(' | '));
  await p.s.evaluate(function (id) { document.querySelector('#tp3Boden .tp3-schild span[data-id="' + id + '"]').click(); }, uuid(4));
  await p.s.waitForTimeout(200);
  k = await p.s.evaluate(kontrast); pruef('dunkel, Tisch gewählt: Kontrast aller ' + k.n + ' Texte >= 4,5', !k.raus.length, k.raus.join(' | '));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-3d-dunkel.png') });
  await p.ctx.close();

  // ---------- 4. Datenbank antwortet leer (RLS) ----------
  p = await seite({ rlsLeer: true });
  await p.s.click('#tp3AnsichtOben'); await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(200);
  box = await p.s.evaluate(function (id) { var r = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, uuid(2));
  await p.s.mouse.move(box.x, box.y); await p.s.mouse.down(); await p.s.mouse.move(box.x + 50, box.y, { steps: 6 }); await p.s.mouse.up();
  await p.s.click('#tp3Fertig'); await p.s.waitForTimeout(800);
  var mel = await p.s.evaluate(function () { var m = document.getElementById('tp3Meldung'); return m.className + ' ' + m.textContent; });
  pruef('leere Antwort (RLS) wird als Fehler gemeldet, nicht als "gespeichert"', /fehler/.test(mel) && /Nicht gespeichert/.test(mel), mel);
  var noch = await p.s.evaluate(function () { return window.tp3.bearbeiten; });
  pruef('... und der Plan bleibt im Bearbeiten (nichts geht verloren)', noch === true, noch);
  await p.ctx.close();

  // ---------- 5. Spalten aus 39-tischplan.sql fehlen ----------
  p = await seite({ ohneSpalten: true });
  tische = await p.s.evaluate(function () { return document.querySelectorAll('#tp3Boden .tp3-tisch').length; });
  pruef('ohne pos_x/pos_y: Plan zeigt trotzdem alle Tische', tische === 10, tische);
  await p.s.click('#tp3AnsichtOben'); await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(200);
  mel = await p.s.evaluate(function () { return document.getElementById('tp3Meldung').textContent; });
  pruef('... und sagt beim Bearbeiten, welche Datei fehlt', /39-tischplan\.sql/.test(mel), mel);
  await p.ctx.close();

  // ---------- 6. L-Form mit festen Teilen (07.10.2026) ----------
  // Ibo: "der Laden ist wie eine L-Form". 16 x 10 m, oben rechts fehlen 6 x 4 m.
  var RAUM = { main: { breite: 16, tiefe: 10, form: 'L', ecke: 'or', ausB: 6, ausT: 4,
    teile: [{ id: 'th', art: 'theke', x: 20, y: 8, b: 4, t: 0.8, dreh: 0 }, { id: 'tu', art: 'tuer', x: 50, y: 100, b: 1.4, t: 0.3, dreh: 0 }, { id: 'fe', art: 'fenster', x: 100, y: 75, b: 1.6, t: 0.12, dreh: 90 }] } };
  p = await seite({ raum: RAUM });
  var l = await p.s.evaluate(function () {
    var b = document.getElementById('tp3Boden');
    return { stuecke: b.querySelectorAll('.tp3-bodenteil').length, l: b.classList.contains('tp3-l'), w: b.offsetWidth, h: b.offsetHeight,
      teile: Array.prototype.map.call(b.querySelectorAll('.tp3-teil .tp3-schild span'), function (x) { return x.textContent; }),
      waende: b.querySelectorAll(':scope > .tp3-wand').length };
  });
  pruef('L-Form: Boden aus 2 Stücken, Seitenverhältnis 16 x 10 m', l.l && l.stuecke === 2 && Math.abs(l.w / l.h - 1.6) < 0.02, JSON.stringify(l));
  pruef('L-Form in 3D: 6 Wände/Sockel entlang des Umrisses (Rechteck: 4)', l.waende === 6, l.waende);
  pruef('feste Teile stehen im Plan: Theke und Eingang', l.teile.indexOf('Theke') >= 0 && l.teile.indexOf('Eingang') >= 0, l.teile.join(','));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-L-3d.png') });
  // ---- Architektur-Look (07.10.2026): Lücke für den Eingang, Licht nach Uhrzeit, Gedeck ----
  var schwelle = await p.s.evaluate(function () { return Array.prototype.some.call(document.querySelectorAll('#tp3Boden .tp3-wand .tp3-f'), function (f) { return /--tp3-schwelle/.test(f.getAttribute('style')); }); });
  pruef('Eingang an der Außenwand: dort hat die Wand eine Lücke mit Schwelle', schwelle, schwelle);
  var gedeck = await p.s.evaluate(function (ids) {
    function n(id, re) { var t = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]'); return t ? Array.prototype.filter.call(t.querySelectorAll('.tp3-f'), function (f) { return re.test(f.getAttribute('style')); }).length : -1; }
    return { besetzt: n(ids[0], /--tp3-teller/), plaetze: (window.tp3.tische.find(function (t) { return t.id === ids[0]; }) || {}).plaetze, frei: n(ids[1], /--tp3-teller/), kaertchen: n(ids[2], /border-top:2px solid #2563eb/) };
  }, [uuid(3), uuid(1), uuid(2)]);
  pruef('besetzter Tisch ist gedeckt: ein Teller je Platz', gedeck.besetzt === gedeck.plaetze && gedeck.plaetze > 0, JSON.stringify(gedeck));
  pruef('freier Tisch ohne Gedeck, reservierter mit Kärtchen', gedeck.frei === 0 && gedeck.kaertchen === 1, JSON.stringify(gedeck));
  function lichtUm(min) {
    return p.s.evaluate(function (m) {
      var r = document.getElementById('tp3Schieber'); r.value = m; r.dispatchEvent(new Event('input'));
      return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(function () {
        var b = document.getElementById('tp3Boden'), st = function (sel, re) { return Array.prototype.filter.call(b.querySelectorAll(sel), function (f) { return re.test(f.getAttribute('style')); }).length; };
        ok({ licht: document.getElementById('tp3').getAttribute('data-licht'), zeile: document.getElementById('tp3Licht').textContent,
             lampen: st('.tp3-tisch .tp3-f', /255,196,120/), tische: b.querySelectorAll('.tp3-tisch').length, fensterlicht: st('.tp3-wand .tp3-f', /255,243,212|255,186,110/) });
      }); }); });
    }, min);
  }
  var SONNE = [16.8, 17.6, 18.5, 20.3, 21.1, 21.8, 21.8, 20.9, 19.8, 18.7, 16.8, 16.3], unter = Math.round(SONNE[new Date().getMonth()] * 60);
  var tag = await lichtUm(720);
  pruef('12:00 in 3D: Tageslicht, Licht fällt durchs Fenster, keine Lampen', tag.licht === 'tag' && tag.fensterlicht > 0 && tag.lampen === 0 && /Tageslicht/.test(tag.zeile), JSON.stringify(tag));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-3d-tag.png') });
  var abend = await lichtUm(Math.floor((unter - 30) / 15) * 15);
  pruef('kurz vor Sonnenuntergang: Abendlicht, die Zeile nennt die Uhrzeit', abend.licht === 'abend' && /Sonne bis \d\d:\d\d/.test(abend.zeile), JSON.stringify(abend));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-3d-abend.png') });
  var nacht = await lichtUm(1350);
  pruef('22:30: Licht an über jedem Tisch, Fenster ohne Tageslicht', nacht.licht === 'nacht' && nacht.lampen === nacht.tische && nacht.fensterlicht === 0, JSON.stringify(nacht));
  await p.s.click('#tp3Jetzt'); await p.s.waitForTimeout(100);
  await p.s.click('#tp3AnsichtOben'); await p.s.waitForTimeout(200);
  var ecke = await p.s.evaluate(function () { return document.querySelectorAll('#tp3Boden .tp3-ecke').length; });
  pruef('von oben: die fehlende Ecke ist als "kein Raum" markiert', ecke === 1, ecke);
  // 3D: wischen dreht den Raum
  await p.s.click('#tp3Ansicht3d'); await p.s.waitForTimeout(150);
  var bb = await p.s.evaluate(function () { var r = document.getElementById('tp3Buehne').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height - 160 }; });
  var d0 = await p.s.evaluate(function () { return window.tp3.drehung; });
  await p.s.mouse.move(bb.x, bb.y); await p.s.mouse.down(); await p.s.mouse.move(bb.x + 200, bb.y, { steps: 10 }); await p.s.mouse.up(); await p.s.waitForTimeout(150);
  var d1 = await p.s.evaluate(function () { return window.tp3.drehung; });
  pruef('3D: Wischen dreht den ganzen Raum stufenlos', Math.abs(d1 - d0 - 90) < 6, d0 + ' -> ' + d1);
  await p.s.evaluate(function () { window.tp3.drehung = 0; });
  await p.s.click('#tp3AnsichtOben'); await p.s.waitForTimeout(150);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-L-oben.png') });
  // Profi-Ansicht: ruhige Schilder, Zoom
  var schilder = await p.s.evaluate(function () {
    var frei = document.querySelector('#tp3Boden .tp3-schild.frei span'), alle = document.querySelectorAll('#tp3Boden .tp3-schild:not(.teil):not(.gewaehlt) span');
    var breit = 0; alle.forEach(function (x) { breit = Math.max(breit, x.getBoundingClientRect().width); });
    return { freiText: frei ? frei.textContent : null, breitestes: Math.round(breit) };
  });
  pruef('freier Tisch: nur die Nummer auf dem Schild', /^\d+$/.test(schilder.freiText), schilder.freiText);
  pruef('Schilder bleiben klein (breitestes < 130 px, vorher ~150)', schilder.breitestes < 130, schilder.breitestes);
  var z0 = await p.s.evaluate(function () { return document.getElementById('tp3Boden').getBoundingClientRect().width; });
  await p.s.click('#tp3ZoomRein'); await p.s.waitForTimeout(100); await p.s.click('#tp3ZoomRein'); await p.s.waitForTimeout(150);
  var z1 = await p.s.evaluate(function () { return document.getElementById('tp3Boden').getBoundingClientRect().width; });
  pruef('"+" zweimal: Raum gut 1,5-mal so groß', z1 / z0 > 1.5 && z1 / z0 < 1.6, Math.round(z0) + ' -> ' + Math.round(z1));
  var vb = await p.s.evaluate(function () { var r = document.getElementById('tp3Buehne').getBoundingClientRect(); return { x: r.left + 30, y: r.top + 80 }; });
  var b0 = await p.s.evaluate(function () { return document.getElementById('tp3Boden').getBoundingClientRect().left; });
  await p.s.mouse.move(vb.x, vb.y); await p.s.mouse.down(); await p.s.mouse.move(vb.x + 80, vb.y + 20, { steps: 6 }); await p.s.mouse.up(); await p.s.waitForTimeout(100);
  var b1 = await p.s.evaluate(function () { return document.getElementById('tp3Boden').getBoundingClientRect().left; });
  pruef('vergrößert: mit dem Finger verschieben', Math.abs(b1 - b0 - 80) < 3, Math.round(b0) + ' -> ' + Math.round(b1));
  await p.s.click('#tp3ZoomFit'); await p.s.waitForTimeout(150);
  var z2 = await p.s.evaluate(function () { return { w: document.getElementById('tp3Boden').getBoundingClientRect().width, z: window.tp3.zoom, px: window.tp3.panX }; });
  pruef('"Einpassen": wieder ganzer Raum, nicht verschoben', Math.abs(z2.w - z0) < 1 && z2.z === 1 && z2.px === 0, JSON.stringify(z2));
  // Bearbeiten: Raum-Formular, Tisch in die Ecke ziehen, Theke dazu, speichern
  await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(200);
  var formular = await p.s.evaluate(function () { return document.getElementById('tp3Seite').innerText; });
  pruef('Bearbeiten zeigt rechts den Raum: Breite, Tiefe, L-Form, welche Ecke', /Breite/.test(formular) && /16,0 m/.test(formular) && /L-Form/.test(formular) && /oben rechts/.test(formular), formular.slice(0, 160));
  await p.s.click('#tp3Seite [data-raum="breite+"]'); await p.s.waitForTimeout(100);
  var breit = await p.s.evaluate(function () { return window.tp3.raum.main.breite; });
  pruef('"+" bei Breite: 16,5 m', breit === 16.5, breit);
  // Tisch 3 (oben, x=55) nach rechts oben in die fehlende Ecke ziehen
  box = await p.s.evaluate(function (id) { var r = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, uuid(3));
  var ziel = await p.s.evaluate(function () { var r = document.querySelector('#tp3Boden .tp3-ecke').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.s.mouse.move(box.x, box.y); await p.s.mouse.down(); await p.s.mouse.move(ziel.x, ziel.y, { steps: 8 }); await p.s.mouse.up(); await p.s.waitForTimeout(150);
  var lage = await p.s.evaluate(function (id) {
    var t = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]').getBoundingClientRect(), e = document.querySelector('#tp3Boden .tp3-ecke').getBoundingClientRect();
    var mx = t.left + t.width / 2, my = t.top + t.height / 2; return { drin: mx > e.left && mx < e.right && my > e.top && my < e.bottom };
  }, uuid(3));
  pruef('ein Tisch rutscht aus der fehlenden Ecke an den Rand', lage.drin === false, JSON.stringify(lage));
  // Drehgriff: Tisch 5 waehlen (antippen), Griff im Kreis ziehen
  box = await p.s.evaluate(function (id) { var r = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, uuid(5));
  await p.s.mouse.move(box.x, box.y); await p.s.mouse.down(); await p.s.mouse.up(); await p.s.waitForTimeout(150);
  var griff = await p.s.evaluate(function () { var g = document.querySelector('#tp3Boden .tp3-griff'); if (!g) return null; var r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  pruef('gewählter Tisch hat einen Drehgriff', !!griff, 'kein Griff');
  if (griff) {
    var rad = Math.hypot(griff.x - box.x, griff.y - box.y), w = 30 * Math.PI / 180;
    await p.s.mouse.move(griff.x, griff.y); await p.s.mouse.down();
    for (var st = 1; st <= 6; st++) { var ww = w * st / 6; await p.s.mouse.move(box.x + Math.sin(ww) * rad, box.y - Math.cos(ww) * rad); }
    await p.s.mouse.up(); await p.s.waitForTimeout(150);
    var gd = await p.s.evaluate(function (id) { var t = window.tp3.tische.find(function (x) { return x.id === id; }); return t.drehung; }, uuid(5));
    pruef('am Griff gezogen: Tisch steht auf 30°', gd === 30, gd);
    await p.s.click('#tp3Seite [data-aktion="drehPlus"]'); await p.s.waitForTimeout(100);
    gd = await p.s.evaluate(function (id) { return window.tp3.tische.find(function (x) { return x.id === id; }).drehung; }, uuid(5));
    pruef('"↻ 15°": 45°', gd === 45, gd);
    var anzeige = await p.s.evaluate(function () { var o = document.getElementById('tp3eWinkel'); return o && o.textContent; });
    pruef('rechts steht der Winkel: 45°', anzeige === '45°', anzeige);
  }
  // Echte Maße: Tisch 5 (6 Plätze, lang) -> 180 x 80 cm im Massstab des Raums
  var mass = await p.s.evaluate(function (id) {
    var t = window.tp3.tische.find(function (x) { return x.id === id; });
    var el = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]');
    return { b: parseFloat(el.style.width), t: parseFloat(el.style.height), ppm: window.tp3.ppm, plaetze: t.plaetze };
  }, uuid(5));
  pruef('echte Maße: 6er-Tisch ist 180 x 80 cm, im Massstab des Raums', Math.abs(mass.b - 1.8 * mass.ppm) < 0.5 && Math.abs(mass.t - 0.8 * mass.ppm) < 0.5, JSON.stringify(mass));
  var chips = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp3Seite [data-vorlage]'), function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }); });
  pruef('rechts: Größen als Knöpfe (120×80 … 360×90)', chips.length === 5 && /180×80/.test(chips.join('|')), chips.join(' | '));
  await p.s.click('#tp3Seite [data-vorlage="8,240,80"]'); await p.s.waitForTimeout(100);
  var nach = await p.s.evaluate(function (id) { var t = window.tp3.tische.find(function (x) { return x.id === id; }); var el = document.querySelector('#tp3Boden .tp3-tisch[data-id="' + id + '"]'); return { plaetze: t.plaetze, L: t.laenge, B: t.breite, b: parseFloat(el.style.width), ppm: window.tp3.ppm }; }, uuid(5));
  pruef('ein Tipp auf "240×80 · 8": 8 Plätze, 240 cm lang gezeichnet', nach.plaetze === 8 && nach.L === 240 && Math.abs(nach.b - 2.4 * nach.ppm) < 0.5, JSON.stringify(nach));
  await p.s.click('#tp3Seite [data-mass="L+"]'); await p.s.waitForTimeout(100);
  var laenger = await p.s.evaluate(function (id) { return window.tp3.tische.find(function (x) { return x.id === id; }).laenge; }, uuid(5));
  pruef('"+" bei Länge: 250 cm', laenger === 250, laenger);
  var neuKnoepfe = await p.s.evaluate(function () { return document.querySelectorAll('#tp3Leiste [data-neu]').length; });
  pruef('Leiste: 9 Tischgrößen zum Anlegen (vorher 5)', neuKnoepfe === 9, neuKnoepfe);
  // Eingang an die linke Wand ziehen: rastet ein und dreht sich mit
  await p.s.click('#tp3Seite [data-aktion="schliessen"]'); await p.s.waitForTimeout(100);
  // Erst ins Bild holen: je nach Seitenleiste lag die Tür unter dem Fensterrand,
  // dann ging der Finger ins Leere (elementFromPoint = null) -- gemessen 1 von 3 Läufen.
  var tu = await p.s.evaluate(function () { document.querySelector('#tp3Boden .tp3-teil[data-teil-id="tu"]').scrollIntoView({ block: 'center' }); var r = document.querySelector('#tp3Boden .tp3-teil[data-teil-id="tu"]').getBoundingClientRect(); var b = document.getElementById('tp3Boden').getBoundingClientRect(); var x = r.left + r.width / 2, y = r.top + r.height / 2, el = document.elementFromPoint(x, y); return { x: x, y: y, links: b.left, mitteY: b.top + b.height * 0.7, unter: el ? (el.className + ' ' + (el.closest('[data-teil-id],[data-id]') || {}).outerHTML).slice(0, 160) : null }; });
  await p.s.mouse.move(tu.x, tu.y); await p.s.mouse.down(); await p.s.mouse.move(tu.links + 12, tu.mitteY, { steps: 10 }); await p.s.mouse.up(); await p.s.waitForTimeout(150);
  var tuer = await p.s.evaluate(function () { var t = window.tp3.raum.main.teile.find(function (x) { return x.id === 'tu'; }); return { x: t.x, dreh: t.dreh }; });
  pruef('Eingang rastet an der linken Wand ein und steht senkrecht', tuer.x === 0 && tuer.dreh === 90, JSON.stringify(tuer) + ' unter dem Finger: ' + tu.unter);
  var mass = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp3Boden .tp3-mass'), function (x) { return x.textContent; }).join(' | '); });
  pruef('beim Bearbeiten stehen die Maße am Rand', /16,5 m/.test(mass) && /10,0 m/.test(mass) && /kein Raum/.test(mass), mass);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-L-bearbeiten.png') });
  await p.s.click('#tp3Leiste [data-teil="theke"]'); await p.s.waitForTimeout(150);
  var teile = await p.s.evaluate(function () { return window.tp3.raum.main.teile.length + ' / ' + document.getElementById('tp3Seite').innerText.slice(0, 40); });
  pruef('"Theke" antippen: neues Teil, rechts sein Formular', /^4 \//.test(teile) && /Theke/.test(teile), teile);
  await p.s.click('#tp3Fertig'); await p.s.waitForTimeout(800);
  var raumGeschrieben = p.geschrieben.filter(function (g) { return /restaurants\?id=eq\./.test(g.u) && g.m === 'PATCH'; }).map(function (g) { return JSON.parse(g.body); })[0];
  var tischGeschrieben = p.geschrieben.filter(function (g) { return /restaurant_tables\?id=eq\.00000000-0000-4000-8000-000000000005/.test(g.u); }).map(function (g) { return JSON.parse(g.body); })[0];
  pruef('Fertig speichert die Drehung 45° (rotation)', !!tischGeschrieben && tischGeschrieben.rotation === 45, JSON.stringify(tischGeschrieben));
  pruef('Fertig speichert die echten Maße (250 x 80 cm)', !!tischGeschrieben && tischGeschrieben.laenge_cm === 250 && tischGeschrieben.breite_cm === 80, JSON.stringify(tischGeschrieben));
  pruef('Fertig speichert den Raum in restaurants.tischplan_raum', !!raumGeschrieben && raumGeschrieben.tischplan_raum.main.form === 'L' && raumGeschrieben.tischplan_raum.main.breite === 16.5 && raumGeschrieben.tischplan_raum.main.teile.length === 4, JSON.stringify(raumGeschrieben).slice(0, 200));
  pruef('kein Seitenfehler im L-Plan', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 6a. Tisch anlegen, wenn gelöschte Tische Nummern belegen ----------
  // Danach Ibo: "Tisch löschen, neuen einfügen -- kann keinen auf die gelöschte
  // Nummer". Gelöscht ist hier Tisch 11 (und 21); der neue soll wieder 11 sein.
  // Ibo, 08.10.2026: "wenn ich die Tische einfügen möchte, kommt nichts".
  // Protokoll: 24 x POST restaurant_tables -> 409 duplicate key (table_number).
  // Der Plan lädt nur aktive Tische und nahm "höchste + 1" -- die Nummer
  // gehörte einem gelöschten Tisch.
  async function anlegen(q) {
    await q.s.evaluate(function () { var b = document.querySelector('#tp3Leiste [data-neu="rund4"]'); b.scrollIntoView({ block: 'center' }); });
    await q.s.click('#tp3Leiste [data-neu="rund4"]'); await q.s.waitForTimeout(1500);
    return q.s.evaluate(function () {
      var m = document.getElementById('tp3Meldung'), r = m.getBoundingClientRect(), vh = window.innerHeight;
      return { tische: window.tp3.tische.length, nummern: window.tp3.tische.map(function (t) { return t.nummer; }).join(','), meldung: m.textContent,
        sichtbar: m.classList.contains('zeigen') && r.height > 0 && r.top >= 0 && r.bottom <= vh, oben: Math.round(r.top) };
    });
  }
  p = await seite({ geloescht: [11, 21] });
  await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(150);
  var an = await anlegen(p);
  var posts = p.geschrieben.filter(function (g) { return g.m === 'POST' && /restaurant_tables/.test(g.u); }).map(function (g) { return JSON.parse(g.body).table_number; });
  pruef('Tisch 11 gelöscht -> neuer Tisch bekommt wieder die 11, steht im Plan', an.tische === 12 && /(^|,)11$/.test(an.nummern) && posts.join(',') === '11', JSON.stringify(an) + ' POSTs ' + posts.join(','));
  await p.ctx.close();
  p = await seite({ geloescht: [11, 21], immer409: true });
  await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(150);
  an = await anlegen(p);
  pruef('klappt es trotzdem nicht: Meldung steht im Blick, nicht oben außerhalb (Regel 6)', an.tische === 11 && an.sichtbar && /nicht angelegt/i.test(an.meldung), JSON.stringify(an));
  await p.ctx.close();

  // ---------- 6b. Eingerichtetes Lokal (07.10.2026) ----------
  // Ibo: "mit Küche einbauen, alles mögliche muss drin sein".
  var EINGERICHTET = {
    main: { breite: 16, tiefe: 10, form: 'L', ecke: 'or', ausB: 6, ausT: 4, teile: [
      { id: 'tu', art: 'tuer', x: 50, y: 100, b: 1.4, t: 0.3, dreh: 0 },
      { id: 'th', art: 'theke', x: 20, y: 9, b: 4, t: 0.8, dreh: 0 }, { id: 'ts', art: 'thekenschrank', x: 20, y: 2.3, b: 4, t: 0.45, dreh: 0 },
      { id: 'kb1', art: 'barhocker', x: 12, y: 16, b: 0.4, t: 0.4, dreh: 0 }, { id: 'kb2', art: 'barhocker', x: 18, y: 16, b: 0.4, t: 0.4, dreh: 0 }, { id: 'kb3', art: 'barhocker', x: 24, y: 16, b: 0.4, t: 0.4, dreh: 0 },
      { id: 'ka', art: 'kasse', x: 38, y: 8, b: 1.2, t: 0.6, dreh: 0 },
      { id: 'kue', art: 'kuehlung', x: 48, y: 5, b: 1.3, t: 0.7, dreh: 0 },
      { id: 'tv', art: 'tv', x: 30, y: 0, b: 1.4, t: 0.1, dreh: 0 },
      { id: 'km', art: 'kamin', x: 58, y: 4, b: 1.2, t: 0.5, dreh: 0 },
      { id: 'kc', art: 'kueche', x: 81, y: 80, b: 5, t: 3.6, dreh: 0 },
      { id: 'wc', art: 'wc', x: 92, y: 52, b: 2.2, t: 2, dreh: 0 },
      { id: 'bu', art: 'buehne', x: 74, y: 52, b: 3, t: 1.8, dreh: 0 },
      { id: 'so', art: 'sofa', x: 3.5, y: 60, b: 2, t: 0.9, dreh: 90 },
      { id: 'ga', art: 'garderobe', x: 62, y: 96, b: 1.6, t: 0.5, dreh: 0 },
      { id: 'sa', art: 'saeule', x: 40, y: 50, b: 0.4, t: 0.4, dreh: 0 },
      { id: 'pf', art: 'pflanze', x: 3, y: 5, b: 0.6, t: 0.6, dreh: 0 },
      { id: 'bi', art: 'bankinsel', x: 40, y: 66, b: 2.4, t: 1.6, dreh: 0 }, { id: 'bk', art: 'blumenkasten', x: 30, y: 30, b: 1.8, t: 0.45, dreh: 90 },
      { id: 'kv', art: 'kuchenvitrine', x: 41, y: 22, b: 1.4, t: 0.8, dreh: 0 }, { id: 'fl', art: 'fleischtheke', x: 58, y: 22, b: 2.5, t: 1.0, dreh: 0 }] },
    terrace: { breite: 8, tiefe: 5, teile: [
      { id: 'sc', art: 'schirm', x: 30, y: 45, b: 2.5, t: 2.5, dreh: 0 },
      { id: 'sk1', art: 'strandkorb', x: 75, y: 25, b: 1.25, t: 0.9, dreh: 0 }, { id: 'sk2', art: 'strandkorb', x: 75, y: 70, b: 1.25, t: 0.9, dreh: 180 }] }
  };
  p = await seite({ raum: EINGERICHTET });
  var ein = await p.s.evaluate(function () {
    var b = document.getElementById('tp3Boden'), kc = b.querySelector('.tp3-teil[data-teil-id="kc"]');
    return { teile: b.querySelectorAll('.tp3-teil').length, soll: window.tp3.raum.main.teile.length,
      herdplatten: kc ? Array.prototype.filter.call(kc.querySelectorAll('.tp3-f'), function (f) { return /1\.5px solid #6b7270/.test(f.getAttribute('style')); }).length : -1,
      kuecheFlaechen: kc ? kc.querySelectorAll('.tp3-f').length : -1,
      vitrine: ['kv', 'fl'].map(function (id) { var v = b.querySelector('.tp3-teil[data-teil-id="' + id + '"]'); if (!v) return null; var r = v.getBoundingClientRect();
        var f = Array.prototype.map.call(v.querySelectorAll('.tp3-f'), function (x) { return x.getAttribute('style'); });
        return { glas: f.filter(function (x) { return /rgba\(214,232,240,0\.30\)/.test(x); }).length, torte: f.filter(function (x) { return /conic-gradient\(from 30deg/.test(x); }).length,
          steak: f.filter(function (x) { return /#9a2530/.test(x); }).length, w: Math.round(r.width), h: Math.round(r.height) }; }) };
  });
  pruef('eingerichtetes Lokal: alle ' + ein.soll + ' Teile stehen im Plan', ein.teile === ein.soll, JSON.stringify(ein));
  pruef('Vitrinen (Ibo: "für Kuchen oder Fleisch"): Glas rundum und oben, Torten bzw. Steaks darin, sichtbar groß',
    ein.vitrine[0] && ein.vitrine[1] && ein.vitrine[0].glas === 4 && ein.vitrine[0].torte >= 3 && ein.vitrine[1].glas === 4 && ein.vitrine[1].steak >= 4 && ein.vitrine[0].w > 20 && ein.vitrine[1].w > 40, JSON.stringify(ein.vitrine));
  pruef('Küche ist eingerichtet: Herd mit 4 Platten, Arbeitsflächen, Wände', ein.herdplatten === 4 && ein.kuecheFlaechen > 40, JSON.stringify(ein));
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-eingerichtet-3d.png') });
  await p.s.click('#tp3AnsichtOben'); await p.s.waitForTimeout(150);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-eingerichtet-oben.png') });
  await p.s.click('#tp3Ansicht3d'); await p.s.click('#tp3Bereiche [data-bereich="terrace"]'); await p.s.waitForTimeout(150);
  await p.s.locator('#tp3').screenshot({ path: path.join(AUS, 'tischplan-terrasse-3d.png') });
  var terr = await p.s.evaluate(function () { var b = document.getElementById('tp3Boden'); return { boden: b.getAttribute('data-boden'), gelaender: Array.prototype.filter.call(b.querySelectorAll('.tp3-wand .tp3-f'), function (f) { return /214,232,240/.test(f.getAttribute('style')); }).length, hoch: Array.prototype.some.call(b.querySelectorAll('.tp3-wand .tp3-f'), function (f) { return /--tp3-wand-hell/.test(f.getAttribute('style')); }) }; });
  pruef('Terrasse: Holzdeck, Glasgeländer statt hoher Wände', terr.boden === 'draussen' && terr.gelaender === 4 && !terr.hoch, JSON.stringify(terr));
  await p.s.click('#tp3Bereiche [data-bereich="main"]');
  // Katalog: beim Bearbeiten rechts, jedes Teil lässt sich anlegen
  await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(150);
  await p.s.click('#tp3Leiste #tp3KatalogAuf'); await p.s.waitForTimeout(150);
  var kat = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp3Seite [data-neu-teil]'), function (x) { return x.getAttribute('data-neu-teil'); }); });
  pruef('Katalog rechts: 29 Teile in Gruppen (Raum, Gastro, Gäste, Nebenräume, Draußen)', kat.length === 29 && kat.indexOf('thekenschrank') >= 0 && kat.indexOf('kuchenvitrine') >= 0 && kat.indexOf('fleischtheke') >= 0 && kat.indexOf('bankinsel') >= 0 && kat.indexOf('kueche') >= 0 && kat.indexOf('strandkorb') >= 0, kat.length);
  var vorher = await p.s.evaluate(function () { return window.tp3.raum.main.teile.length; });
  for (var ki = 0; ki < kat.length; ki++) {
    await p.s.evaluate(function () { window.tp3.teilGewaehlt = null; window.tp3.gewaehlt = null; });
    await p.s.click('#tp3Bereiche [data-bereich="main"]');
    await p.s.click('#tp3Seite [data-neu-teil="' + kat[ki] + '"]');
  }
  var nachher = await p.s.evaluate(function () { return { n: window.tp3.raum.main.teile.length, tv: (window.tp3.raum.main.teile.filter(function (t) { return t.art === 'tv'; }).pop() || {}).y }; });
  pruef('jedes Katalog-Teil lässt sich anlegen (+29), der Bildschirm hängt an der Wand', nachher.n === vorher + 29 && nachher.tv === 0, JSON.stringify(nachher) + ' vorher ' + vorher);
  pruef('kein Seitenfehler mit Einrichtung', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- 7. 41-tischplan-raum.sql fehlt ----------
  p = await seite({ raum: null, ohneRaum: true });
  await p.s.click('#tp3AnsichtOben'); await p.s.click('#tp3Bearbeiten'); await p.s.waitForTimeout(200);
  mel = await p.s.evaluate(function () { return document.getElementById('tp3Meldung').textContent; });
  pruef('ohne 41: Bearbeiten sagt, welche Datei fehlt', /41-tischplan-raum\.sql/.test(mel), mel);
  var dreh = await p.s.evaluate(function () { return null; });
  await p.s.click('#tp3Seite [data-raum="form-L"]'); await p.s.waitForTimeout(100);
  await p.s.click('#tp3Fertig'); await p.s.waitForTimeout(800);
  mel = await p.s.evaluate(function () { return document.getElementById('tp3Meldung').textContent; });
  pruef('ohne 41: nach Fertig steht da, dass der Raum NICHT gespeichert ist', /NICHT/.test(mel) && /41-tischplan-raum/.test(mel), mel);
  await p.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
