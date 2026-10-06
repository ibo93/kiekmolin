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
  { id: 'r-7', guest_name: 'Stammtisch', guest_phone: null, party_size: 8, reservation_time: hh(nowMin - 40), duration_minutes: 180, status: 'seated', table_id: uuid(7), notes: null }
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
    await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); localStorage.setItem('kmi_tp3_ansicht', '3d'); } catch (e) {} }, !!opt.dunkel);
    await ctx.route(/^https?:\/\/(?!localhost)/, async function (rt) {
      var u = rt.request().url(), m = rt.request().method();
      var json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/supabase\.co\/rest\/v1\/restaurant_tables/.test(u)) {
        if (m === 'GET') {
          if (opt.ohneSpalten && /pos_x/.test(u)) return json({ code: '42703', message: 'column restaurant_tables.pos_x does not exist' }, 400);
          return json(TISCHE.map(function (t) { var c = Object.assign({}, t); if (opt.ohneSpalten) { delete c.pos_x; delete c.pos_y; delete c.rotation; } return c; }));
        }
        geschrieben.push({ m: m, u: u, body: rt.request().postData() });
        if (opt.rlsLeer) return json([]);
        return json([Object.assign({}, TISCHE[0], JSON.parse(rt.request().postData() || '{}'))], m === 'POST' ? 201 : 200);
      }
      if (/supabase\.co\/rest\/v1\/reservations/.test(u)) {
        if (m === 'GET') return json(RES);
        geschrieben.push({ m: m, u: u, body: rt.request().postData() });
        return json(opt.rlsLeer ? [] : [Object.assign({ id: 'neu' }, JSON.parse(rt.request().postData() || '{}'))], 201);
      }
      if (/supabase\.co\/rest\/v1\/orders/.test(u)) return json(ORDERS);
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
      var d = document.getElementById('dashboardView'); var p = d; while (p && p !== document.body) { p.style.setProperty('display', p === d ? 'flex' : 'block', 'important'); p = p.parentElement; }
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
  var gross = await p.s.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#tp3Boden .tp3-schild > span'), function (s) { return Math.round(s.getBoundingClientRect().height); }); });
  pruef('3D: jedes Schild mindestens 28 px hoch (lesbar, antippbar)', gross.every(function (h) { return h >= 28; }), gross.join(','));
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

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.') + '  Bilder: werkzeug/ausgabe/');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
