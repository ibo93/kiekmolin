// KASSEN-UMSATZ, GÄSTEPROFIL, PUSH-ANGEBOTE -- im echten Browser.
//
// Ibo, 09.10.2026 ("rest kannst du machen"): Kasse abends eintragen,
// Gästeprofil bei Reservierungen, Push-Werbung nur mit eigener Zustimmung.
// Misst, was der Wirt bzw. Gast sieht -- Supabase beantwortet das Werkzeug
// selbst (der Proxy sperrt es) und merkt sich, was gespeichert wurde:
//   - Startkarte: Gesamt = App + Kasse, Knopf "Kasse heute eintragen"
//   - Tagesabschluss: App · Kasse · Gesamt; eintragen -> Fenster -> gespeichert -> neu
//   - Monatsbericht: Spalten Kasse und Gesamt; ohne SQL 43 ein Hinweis
//   - Reservierungen: Abzeichen "Stammgast" / "Neu", Profil mit Lieblingstisch
//   - Push an: Kästchen "Auch Angebote …" leer, lesbar
// AUFRUF   node werkzeug/kasse-gaesteprofil-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8896);
var RID = '22222222-2222-4222-8222-222222222222';
function tag(zurueck) { var d = new Date(); d.setDate(d.getDate() - zurueck); return d.toLocaleDateString('sv-SE'); }
function iso(zurueck, stunde) { var d = new Date(); d.setDate(d.getDate() - zurueck); d.setHours(stunde || 12, 0, 0, 0); return d.toISOString(); }
var HEUTE = tag(0);
// Der Tagesabschluss liest über den Supabase-Client (CDN, vom Proxy gesperrt).
// Lokal mitgeben: SUPABASE_JS=<pfad zu supabase-js/dist/umd/supabase.js>
// oder npm i @supabase/supabase-js. Ohne ihn werden diese Prüfungen als
// "nicht messbar" gezählt, nicht als Fehler.
var SBJS = [process.env.SUPABASE_JS, path.join(WURZEL, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js')].filter(function (f) { return f && fs.existsSync(f); })[0] || null;
var ORDERS = [
  { customer_phone: '0176 1111111', total: 42.5, created_at: iso(0, 13), status: 'completed', order_type: 'delivery', tip: 0, payment_method: 'cash' },
  { customer_phone: '0171 3333333', total: 25, created_at: iso(0, 12), status: 'delivered', order_type: 'dine_in', tip: 2, payment_method: 'paypal' }
];
// Heute: zwei Reservierungen. Ayse war 3x da (Tisch 5 zweimal), Neu ist neu.
var HEUTIGE = [
  { id: 'r-heute-1', restaurant_id: RID, guest_name: 'Ayse Yilmaz', guest_phone: '0176 1111111', reservation_date: HEUTE, reservation_time: '19:00:00', party_size: 4, status: 'confirmed', table_id: 't5', tables: { table_number: 5 } },
  { id: 'r-heute-2', restaurant_id: RID, guest_name: 'Neu Gast', guest_phone: '0160 5555555', reservation_date: HEUTE, reservation_time: '20:00:00', party_size: 2, status: 'pending', table_id: null }
];
var VERLAUF = HEUTIGE.concat([
  { guest_phone: '+49 176 1111111', reservation_date: tag(40), status: 'finished', table_id: 't5', notes: 'Allergie: Nüsse' },
  { guest_phone: '0176-1111111', reservation_date: tag(20), status: 'finished', table_id: 't5' },
  { guest_phone: '01761111111', reservation_date: tag(6), status: 'confirmed', table_id: 't2', notes: 'Geburtstag, Kuchen mitgebracht' }
]);
var TISCHE = [{ id: 't5', table_number: 5 }, { id: 't2', table_number: 2 }, { id: 'tx', table_number: '-123456' }];

(async function () {
  var srv = http.createServer(function (q, r) {
    var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    var f = p === '/index.html' ? DATEI : path.join(WURZEL, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(PORT);
  var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
  var rot = 0, n = 0;
  function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }

  async function seite(ohne43) {
    var kasse = {};   // tag -> Zeile, wie die Datenbank
    var ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var rq = rt.request(), u = decodeURIComponent(rq.url()), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (SBJS && /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u)) return rt.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SBJS, 'utf8') });
      if (/rest\/v1\/kassen_umsatz/.test(u)) {
        if (ohne43) return json({ code: 'PGRST205', message: 'Could not find the table public.kassen_umsatz' }, 404);
        if (rq.method() === 'POST') { var z = JSON.parse(rq.postData()); z.id = 'k-' + z.tag; kasse[z.tag] = z; return json([z], 201); }
        return json(Object.keys(kasse).map(function (k) { return kasse[k]; }));
      }
      if (/rest\/v1\/orders/.test(u)) return json(ORDERS);
      if (/rest\/v1\/restaurant_tables/.test(u)) return json(TISCHE);
      if (/rest\/v1\/reservations/.test(u)) return json(/reservation_date=gte\.|reservation_date=eq\./.test(u) ? HEUTIGE : VERLAUF);
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    await s.evaluate(function (rid) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #cartPanel, .cart-panel, #cartOverlay, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      APP_DATA.restaurants = [{ id: rid, name: 'Lounge 7', slug: 'lounge7' }];
      window._gastroOnlyRestaurantId = rid;
    }, RID);
    return { s: s, ctx: ctx, fehler: fehler, kasse: kasse };
  }
  async function bereich(p, id) {
    await p.s.evaluate(function (id) {
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var d = document.getElementById('dashboardView'); for (var q = d; q && q !== document.body; q = q.parentElement) q.style.setProperty('display', 'block', 'important');
      document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === id ? 'block' : 'none', 'important'); });
    }, id);
  }
  // Kontrast der Schrift gegen den nächsten deckenden Hintergrund.
  var KONTRAST = function (sel) {
    function rgb(c) { var m = String(c).match(/[\d.]+/g) || [0, 0, 0, 1]; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; }
    function lum(c) { return [c.r, c.g, c.b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
    var el = document.querySelector(sel); if (!el) return 0;
    var fg = rgb(getComputedStyle(el).color), bg = null;
    for (var q = el; q; q = q.parentElement) { var c = rgb(getComputedStyle(q).backgroundColor); if (c.a > 0.5) { bg = c; break; } }
    bg = bg || { r: 255, g: 255, b: 255 };
    var a = lum(fg), z = lum(bg); return Math.round(((Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05)) * 10) / 10;
  };

  // ---------- Startkarte ----------
  var p = await seite(false);
  await bereich(p, 'sectionDashboard');
  await p.s.evaluate(function () { try { updateDashboard(); } catch (e) { window._udFehler = e.message; } });
  await p.s.waitForTimeout(600);
  var sk = await p.s.evaluate(function () { var k = document.getElementById('dashKasseBtn'); return { zahl: document.getElementById('dashRevenue').textContent, zeile: (document.getElementById('dashRevenueLabel') || {}).textContent, knopf: k && getComputedStyle(k).display !== 'none' ? k.textContent : null, f: window._udFehler || '' }; });
  pruef('Startkarte: heute 68 € (nur App), "App 68 € · Kasse –", Knopf "Kasse heute eintragen"', sk.zahl === '68€' && /^App 68 € · Kasse – · Monat/.test(sk.zeile || '') && sk.knopf === 'Kasse heute eintragen', JSON.stringify(sk));

  // Kasse über den Knopf eintragen -- ungültig, dann richtig
  await p.s.click('#dashKasseBtn');
  await p.s.fill('#kasseBetragFeld', 'viel');
  await p.s.click('#kasseSpeichernBtn');
  var meld = await p.s.textContent('#kasseMeldung');
  pruef('Fenster: Unsinn wird gemeldet, nicht gespeichert', /Bitte einen Betrag/.test(meld) && !p.kasse[HEUTE], meld);
  await p.s.screenshot({ path: path.join(AUS, 'kasse-fenster.png') });
  await p.s.fill('#kasseBetragFeld', '1.234,50');
  await p.s.fill('#kasseNotizFeld', 'Geburtstagsfeier');
  await p.s.click('#kasseSpeichernBtn');
  await p.s.waitForTimeout(800);
  var sk2 = await p.s.evaluate(function () { return { zahl: document.getElementById('dashRevenue').textContent, zeile: (document.getElementById('dashRevenueLabel') || {}).textContent, knopf: document.getElementById('dashKasseBtn').textContent, offen: !!document.getElementById('genericModal') }; });
  pruef('gespeichert: 1234,50 in der Datenbank, mit Notiz, für heute', !!p.kasse[HEUTE] && p.kasse[HEUTE].betrag === 1234.5 && p.kasse[HEUTE].notiz === 'Geburtstagsfeier', JSON.stringify(p.kasse));
  pruef('Startkarte danach: 1302 € gesamt, "App 68 € · Kasse 1235 €", Knopf "Kasse ändern"', sk2.zahl === '1302€' && /^App 68 € · Kasse 1235 €/.test(sk2.zeile || '') && sk2.knopf === 'Kasse ändern' && !sk2.offen, JSON.stringify(sk2));

  // ---------- Tagesabschluss ----------
  var mitClient = await p.s.evaluate(function () { return !!(window.sb || (typeof sb !== 'undefined' && sb)); });
  if (!mitClient) console.log('NICHT MESSBAR | Tagesabschluss-Bestellungen: kein Supabase-Client (SUPABASE_JS setzen)');
  await p.s.evaluate(function (rid) { return openDayCloseReport(rid); }, RID);
  await p.s.waitForTimeout(500);
  var ta = await p.s.evaluate(function () { var m = document.getElementById('dayCloseModal'); var k = m.querySelector('[style*="linear-gradient"]'); return { text: k ? k.textContent.replace(/\s+/g, ' ').trim() : '', knopf: !!document.getElementById('dayCloseKasseBtn') }; });
  pruef('Tagesabschluss: "Tagesumsatz gesamt", App · Kasse 1234,50, Notiz, Knopf' + (mitClient ? ' (1302,00 = 67,50 + 1234,50)' : ''), (mitClient ? /Tagesumsatz gesamt\s*1302,00 €/.test(ta.text) && /App 67,50 € \(inkl\. 2,00 € Trinkgeld\)/.test(ta.text) : true) && /· Kasse 1234,50 €/.test(ta.text) && /Geburtstagsfeier/.test(ta.text) && ta.knopf, JSON.stringify(ta));
  await p.s.locator('#dayCloseModal .modal').screenshot({ path: path.join(AUS, 'kasse-tagesabschluss.png') });
  await p.s.click('#dayCloseKasseBtn');
  var vor = await p.s.inputValue('#kasseBetragFeld');
  pruef('"Kasse ändern" öffnet das Fenster mit dem gespeicherten Betrag', vor === '1234,5', vor);
  await p.s.fill('#kasseBetragFeld', '900');
  await p.s.click('#kasseSpeichernBtn'); await p.s.waitForTimeout(700);
  var ta2 = await p.s.evaluate(function () { var m = document.getElementById('dayCloseModal'); return m ? m.textContent.replace(/\s+/g, ' ') : ''; });
  pruef('nach dem Ändern: Tagesabschluss wieder offen, Kasse 900 (ersetzt, nicht addiert)', /Kasse 900,00 €/.test(ta2) && (!mitClient || /967,50 €/.test(ta2)) && p.kasse[HEUTE].betrag === 900, ta2.slice(0, 160));
  await p.s.evaluate(function () { var m = document.getElementById('dayCloseModal'); if (m) m.remove(); });

  // ---------- Monatsbericht ----------
  await bereich(p, 'sectionRevenue');
  await p.s.evaluate(function () { return monatsberichtLaden(); }); await p.s.waitForTimeout(300);
  var mb = await p.s.evaluate(function () {
    var box = document.getElementById('monatsberichtInhalt'), kopf = Array.prototype.map.call(box.querySelectorAll('.mb-tage thead th'), function (x) { return x.textContent; });
    var erste = box.querySelector('.mb-tage tbody tr'); return { kopf: kopf, zeile: erste ? Array.prototype.map.call(erste.children, function (x) { return x.textContent; }) : [], kacheln: (box.querySelector('.mb-kopf') || {}).textContent };
  });
  pruef('Monatsbericht: Spalten App, Kasse, Gesamt; heute 67,50 + 900,00 = 967,50', mb.kopf.join('|') === 'Tag|Bestellungen|App|Kasse|Gesamt' && /900,00/.test(mb.zeile[3] || '') && /967,50/.test(mb.zeile[4] || ''), JSON.stringify(mb));
  pruef('Monatsbericht-Kopf: Umsatz gesamt, davon App, davon Kasse (1 Tag eingetragen)', /Umsatz gesamt/.test(mb.kacheln) && /davon Kasse \(1 Tage eingetragen\)/.test(mb.kacheln), mb.kacheln);

  // ---------- Reservierungen + Gästeprofil ----------
  await bereich(p, 'sectionReservations');
  await p.s.evaluate(function (rid) { return loadReservationsForRestaurant(rid); }, RID);
  await p.s.waitForTimeout(700);
  var gp = await p.s.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll('.kmi-gp-chip'), function (c) { return { tel: c.getAttribute('data-tel'), text: c.textContent, sichtbar: getComputedStyle(c).display !== 'none' && c.offsetWidth > 0 }; });
  });
  var ay = gp.filter(function (c) { return c.tel === '491761111111'; })[0], neu = gp.filter(function (c) { return c.tel === '491605555555'; })[0];
  pruef('Abzeichen: Ayse "Stammgast · 3 Besuche", sichtbar', !!ay && ay.text === 'Stammgast · 3 Besuche' && ay.sichtbar, JSON.stringify(gp));
  pruef('Abzeichen: neue Nummer "Neu" (auch an der offenen Anfrage)', !!neu && neu.text === 'Neu' && neu.sichtbar, JSON.stringify(gp));
  pruef('Abzeichen lesbar (Kontrast ≥ 4,5)', (await p.s.evaluate(KONTRAST, '.kmi-gp-chip[data-tel="491761111111"]')) >= 4.5, await p.s.evaluate(KONTRAST, '.kmi-gp-chip[data-tel="491761111111"]'));
  await p.s.locator('#reservationsList').screenshot({ path: path.join(AUS, 'gaesteprofil-liste.png') });
  await p.s.click('.kmi-gp-chip[data-tel="491761111111"]');
  var prof = await p.s.evaluate(function () { var m = document.getElementById('genericModal'); return m ? m.textContent.replace(/\s+/g, ' ') : ''; });
  pruef('Profil: 3 Besuche, 1 Bestellung 42,50 €, Lieblingstisch 5 (2×), Notizen', /Gästeprofil – Ayse Yilmaz/.test(prof) && /Besuche \(Reservierung\)\s*3/.test(prof) && /Bestellungen über die App\s*1 · 42,50/.test(prof) && /Tisch 5 \(2×\)/.test(prof) && /Geburtstag, Kuchen mitgebracht/.test(prof) && /Allergie: Nüsse/.test(prof), prof.slice(0, 300));
  await p.s.locator('#genericModal .modal').screenshot({ path: path.join(AUS, 'gaesteprofil-fenster.png') });
  await p.s.evaluate(function () { closeGenericModal(); });
  pruef('kein Seitenfehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- ohne SQL 43 ----------
  p = await seite(true);
  await bereich(p, 'sectionDashboard');
  await p.s.evaluate(function () { try { updateDashboard(); } catch (e) {} }); await p.s.waitForTimeout(600);
  var o = await p.s.evaluate(function () { return { zahl: document.getElementById('dashRevenue').textContent, zeile: document.getElementById('dashRevenueLabel').textContent }; });
  pruef('ohne SQL 43: Startkarte zeigt den App-Umsatz weiter (nicht "nicht geladen")', o.zahl === '68€' && /App 68 € · Kasse –/.test(o.zeile), JSON.stringify(o));
  var toast = await p.s.evaluate(function () { var t = []; var alt = window.showToast; window.showToast = function (m) { t.push(m); }; document.getElementById('dashKasseBtn').click(); window.showToast = alt; return { t: t, fenster: !!document.getElementById('genericModal') }; });
  pruef('ohne SQL 43: Knopf sagt "datenbank/43 einspielen", kein Fenster', /datenbank\/43/.test(toast.t.join(' ')) && !toast.fenster, JSON.stringify(toast));
  await p.s.evaluate(function (rid) { return openDayCloseReport(rid); }, RID); await p.s.waitForTimeout(400);
  var ta3 = await p.s.evaluate(function () { var m = document.getElementById('dayCloseModal'); return { text: m.textContent.replace(/\s+/g, ' '), knopf: !!document.getElementById('dayCloseKasseBtn') }; });
  pruef('ohne SQL 43: Tagesabschluss sagt es, ohne Knopf', /datenbank\/43 einspielen/.test(ta3.text) && !ta3.knopf, JSON.stringify(ta3).slice(0, 200));
  await p.s.evaluate(function () { document.getElementById('dayCloseModal').remove(); });
  await bereich(p, 'sectionRevenue');
  await p.s.evaluate(function () { return monatsberichtLaden(); }); await p.s.waitForTimeout(300);
  var mb3 = await p.s.evaluate(function () { var box = document.getElementById('monatsberichtInhalt'); return { kf: (box.querySelector('.mb-kasse-fehler') || {}).textContent, kopf: box.querySelectorAll('.mb-tage thead th').length }; });
  pruef('ohne SQL 43: Monatsbericht nur App-Spalten und Hinweis', mb3.kopf === 3 && /datenbank\/43 einspielen/.test(mb3.kf || ''), JSON.stringify(mb3));
  pruef('kein Seitenfehler ohne SQL 43', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- Push an: Kästchen für Angebote ----------
  var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:' + PORT });
  await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
  await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) { return /supabase\.co/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : rt.abort(); });
  var s = await ctx.newPage(); var pf = []; s.on('pageerror', function (e) { pf.push(e.message); });
  await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1200);
  var pb = await s.evaluate(function () {
    document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
    var d = document.createElement('div'); d.id = 'pushProbe'; d.style.cssText = 'position:fixed;top:80px;left:16px;right:16px;z-index:99999;background:#fff;padding:12px;';
    d.innerHTML = renderPushOptInBanner(); document.body.appendChild(d);
    var k = document.getElementById('pushAngeboteKasten');
    window.subscribeWebPush = function () { return Promise.resolve(null); };
    return { da: !!k, leer: k && !k.checked, perm: Notification.permission, text: k ? k.closest('label').textContent.trim() : '' };
  });
  pruef('Push an: Kästchen "Auch Angebote und Stempel-Erinnerungen …" da und LEER', pb.da && pb.leer && /Auch Angebote und Stempel-Erinnerungen/.test(pb.text), JSON.stringify(pb));
  var kp = await s.evaluate(KONTRAST, '#pushAngeboteKasten + span');
  pruef('Push-Kästchen: Text lesbar (Kontrast ≥ 4,5)', kp >= 4.5, kp);
  await s.locator('#pushProbe').screenshot({ path: path.join(AUS, 'push-angebote.png') });
  await s.click('#pushAngeboteKasten');
  var ls = await s.evaluate(function () { return localStorage.getItem('kmi_push_angebote'); });
  pruef('Haken setzen merkt "an" auf dem Gerät', ls === '1', ls);
  pruef('kein Seitenfehler (Push)', !pf.length, pf.join(' | '));
  await ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/kasse-*.png, gaesteprofil-*.png, push-angebote.png');
  process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
