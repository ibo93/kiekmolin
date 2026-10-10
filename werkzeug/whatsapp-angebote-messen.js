// WHATSAPP-ANGEBOTE, KUNDENLISTE, MONATSBERICHT -- im echten Browser.
//
// Ibo, 09.10.2026: Einwilligung bei Bestellung/Reservierung, Kampagnen mit
// persönlichem Code, Liste und Monatsbericht getrennt nach Quelle, Umsatz
// jeden Tag. Misst, was der Wirt sieht -- mit Probedaten, Supabase
// beantwortet das Werkzeug selbst (der Proxy sperrt es):
//   - Kästchen bei Bestellung und Reservierung, leer
//   - Tafel "WhatsApp-Angebote": ohne SQL 42 -> klare Meldung; mit Daten ->
//     Zahlen nach Quelle, Kampagne mit verschickt/eingelöst
//   - Kundenliste: Reservierungs-Gast dabei, Quelle, Werbe-Knopf nur mit Zustimmung
//   - Monatsbericht: Tag für Tag, WhatsApp-Zahlen
// AUFRUF   node werkzeug/whatsapp-angebote-messen.js [datei]
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var DATEI = path.resolve(process.argv[2] || path.join(WURZEL, 'index.html'));
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8895);
var RID = '22222222-2222-4222-8222-222222222222';
var heute = new Date(), iso = function (tageZurueck, stunde) { var d = new Date(heute); d.setDate(d.getDate() - tageZurueck); d.setHours(stunde || 12, 0, 0, 0); return d.toISOString(); };
var ORDERS = [
  { customer_phone: '0176 1111111', customer_name: 'Ayse Yilmaz', customer_email: '', total: 42.5, created_at: iso(0, 13), status: 'completed', order_type: 'delivery' },
  { customer_phone: '0176 1111111', customer_name: 'Ayse Yilmaz', customer_email: '', total: 18, created_at: iso(3, 19), status: 'completed', order_type: 'pickup' },
  { customer_phone: '0171 3333333', customer_name: 'Tim Ohne', customer_email: '', total: 25, created_at: iso(1, 20), status: 'delivered', order_type: 'dine_in' }
];
var RESERV = [{ guest_name: 'Jan Reserviert', guest_phone: '0176 2222222', guest_email: '', reservation_date: iso(2).slice(0, 10), created_at: iso(5), status: 'confirmed', party_size: 4 }];
var EINW = [
  { id: 'e1', telefon: '491761111111', name: 'Ayse Yilmaz', quelle: 'bestellung', erstmals_at: iso(3), erteilt_at: iso(3), widerrufen_at: null, abmelde_token: '11111111-1111-4111-8111-111111111111' },
  { id: 'e2', telefon: '491762222222', name: 'Jan Reserviert', quelle: 'reservierung', erstmals_at: iso(5), erteilt_at: iso(5), widerrufen_at: null, abmelde_token: '22222222-1111-4111-8111-111111111111' }
];
var KAMP = [{ id: 'k1', restaurant_id: RID, titel: 'Schnitzeltag', nachricht: 'Freitag alle Schnitzel 12,90 €.', rabatt_prozent: 15, gueltig_bis: iso(-10).slice(0, 10), erstellt_at: iso(1) }];
var EMPF = [
  { id: 'm1', kampagne_id: 'k1', einwilligung_id: 'e1', name: 'Ayse Yilmaz', telefon: '491761111111', quelle: 'bestellung', code: 'KIEK-AAAAAA', gesendet_at: iso(1), eingeloest_at: iso(0), bestell_id: 'b1', umsatz: '42.50' },
  { id: 'm2', kampagne_id: 'k1', einwilligung_id: 'e2', name: 'Jan Reserviert', telefon: '491762222222', quelle: 'reservierung', code: 'KIEK-BBBBBB', gesendet_at: null, eingeloest_at: null, bestell_id: null, umsatz: null }
];

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
  async function seite(ohne42) {
    var ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
      var u = rt.request().url(), json = function (d, s) { return rt.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
      if (/rest\/v1\/(gast_einwilligungen|wa_kampagnen)/.test(u) && ohne42) return json({ code: 'PGRST205', message: 'Could not find the table' }, 404);
      if (/rest\/v1\/gast_einwilligungen/.test(u)) return json(EINW);
      if (/rest\/v1\/wa_kampagnen_empfaenger/.test(u)) return json(EMPF);
      if (/rest\/v1\/wa_kampagnen/.test(u)) return json(KAMP);
      if (/rest\/v1\/orders/.test(u)) return json(ORDERS);
      if (/rest\/v1\/reservations/.test(u)) return json(RESERV);
      if (/supabase\.co/.test(u)) return json([]);
      return rt.abort();
    });
    var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await s.waitForTimeout(1500);
    return { s: s, ctx: ctx, fehler: fehler };
  }
  async function bereich(p, id) {
    await p.s.evaluate(function (a) {
      document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
      document.getElementById('guestView').style.setProperty('display', 'none', 'important');
      var d = document.getElementById('dashboardView'); for (var q = d; q && q !== document.body; q = q.parentElement) q.style.setProperty('display', 'block', 'important');
      document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === a.id ? 'block' : 'none', 'important'); });
      document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #cartPanel, .cart-panel, #cartOverlay, #installBanner, #toastContainer').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
      APP_DATA.restaurants = [{ id: a.rid, name: 'Lounge 7', slug: 'lounge7' }];
      window._gastroOnlyRestaurantId = a.rid;
    }, { id: id, rid: RID });
  }

  // ---------- Kästchen ----------
  var p = await seite(false);
  var k = await p.s.evaluate(function () {
    var a = document.getElementById('checkoutWaAngebote'), r = document.getElementById('resWaAngebote');
    return { a: !!a && !a.checked, r: !!r && !r.checked, text: a && a.closest('label').textContent.replace(/\s+/g, ' ').trim().slice(0, 90) };
  });
  pruef('Bestellung und Reservierung: Kästchen "Angebote per WhatsApp" da und leer', k.a && k.r && /Angebote und Gutscheine dieses Lokals per WhatsApp/.test(k.text), JSON.stringify(k));

  // ---------- Marketing mit Daten ----------
  await bereich(p, 'sectionMarketing');
  await p.s.evaluate(function () { return loadCustomerAnalytics(); }); await p.s.waitForTimeout(500);
  var mk = await p.s.evaluate(function () {
    var box = document.getElementById('waPanelInhalt');
    var karten = Array.prototype.map.call(document.querySelectorAll('#marketingCustomerList > div > div'), function (d) {
      return { name: (d.querySelector('strong') || {}).textContent, quellen: Array.prototype.map.call(d.querySelectorAll('.mkt-quelle'), function (x) { return x.textContent; }).join('+'),
        wa: !!d.querySelector('.mkt-wa-ja'), knopf: /sendMarketingWhatsApp/.test(d.innerHTML), ohne: !!d.querySelector('.mkt-ohne-zustimmung') };
    });
    return { zahlen: Array.prototype.map.call(box.querySelectorAll('.wa-zahl'), function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); }),
      kampagne: (box.querySelector('.wa-kampagne') || {}).textContent, neuAus: document.getElementById('waNeuBtn').disabled, karten: karten };
  });
  pruef('WhatsApp-Tafel: 2 Gäste dürfen, 1 aus Bestellung · 1 aus Reservierung', /^2\s*Gäste dürfen/.test(mk.zahlen[0] || '') && /^1 · 1\s*aus Bestellung · aus Reservierung/.test(mk.zahlen[1] || ''), JSON.stringify(mk.zahlen));
  pruef('Kampagne: verschickt 1/2 · eingelöst 1 · Umsatz', /Schnitzeltag/.test(mk.kampagne || '') && /verschickt 1\/2 · eingelöst 1 · 42,50/.test((mk.kampagne || '').replace(/\s+/g, ' ')), mk.kampagne);
  pruef('"Neues Angebot" ist frei (es gibt Zustimmungen)', mk.neuAus === false, mk.neuAus);
  var jan = mk.karten.filter(function (c) { return /Jan/.test(c.name || ''); })[0], tim = mk.karten.filter(function (c) { return /Tim/.test(c.name || ''); })[0], ayse = mk.karten.filter(function (c) { return /Ayse/.test(c.name || ''); })[0];
  pruef('Kundenliste: Reservierungs-Gast Jan ist dabei, Quelle "Reservierung"', !!jan && jan.quellen === 'Reservierung', JSON.stringify(mk.karten));
  pruef('Ayse: Bestellung, "WhatsApp-Angebote: ja", Werbe-Knopf da', !!ayse && ayse.quellen === 'Bestellung' && ayse.wa && ayse.knopf, JSON.stringify(ayse));
  pruef('Tim ohne Zustimmung: KEIN Werbe-Knopf, Hinweis stattdessen', !!tim && !tim.knopf && tim.ohne && !tim.wa, JSON.stringify(tim));
  await p.s.locator('#waPanel').screenshot({ path: path.join(AUS, 'wa-tafel.png') });
  await p.s.locator('#marketingCustomerList').screenshot({ path: path.join(AUS, 'wa-kundenliste.png') });

  // Versandliste + Nachricht
  var vs = await p.s.evaluate(function () {
    var geoeffnet = []; window.open = function (u) { geoeffnet.push(u); return null; };
    waVersandListe('k1');
    var zeilen = Array.prototype.map.call(document.querySelectorAll('#genericModal .wa-empf'), function (z) { return z.textContent.replace(/\s+/g, ' ').trim(); });
    return waSenden('m2').then(function () { return { zeilen: zeilen, url: decodeURIComponent((geoeffnet[0] || '').split('text=')[1] || '') }; });
  });
  pruef('Versandliste: Name, Quelle, Code, Status je Gast', vs.zeilen.length === 2 && /Ayse Yilmaz Bestellung\s*KIEK-AAAAAA · eingelöst/.test(vs.zeilen[0]) && /Jan Reserviert Reservierung\s*KIEK-BBBBBB · offen/.test(vs.zeilen[1]), JSON.stringify(vs.zeilen));
  pruef('Nachricht an Jan: Vorname, Text, Code, Link, Abmelde-Link', /^Hallo Jan!/.test(vs.url) && /\*KIEK-BBBBBB\* \(15 % Rabatt/.test(vs.url) && /kiekmolin\.de\/lounge7/.test(vs.url) && /abmelden\?t=22222222-1111-4111-8111-111111111111/.test(vs.url), vs.url);

  // ---------- Monatsbericht ----------
  await p.s.evaluate(function () { closeGenericModal(); });
  await bereich(p, 'sectionRevenue');
  await p.s.evaluate(function () { return monatsberichtLaden(); }); await p.s.waitForTimeout(300);
  var mb = await p.s.evaluate(function () {
    var box = document.getElementById('monatsberichtInhalt');
    return { kopf: (box.querySelector('.mb-kopf') || {}).textContent, zeilen: box.querySelectorAll('.mb-tage tbody tr').length, wa: (box.querySelector('.mb-wa') || {}).textContent, monate: document.getElementById('monatsberichtMonat').options.length };
  });
  pruef('Monatsbericht: Umsatz, Bestellungen, Reservierungen im Kopf', /Umsatz/.test(mb.kopf || '') && /Reservierungen · Gäste/.test(mb.kopf || ''), mb.kopf);
  pruef('Monatsbericht: eine Zeile je Tag bis heute, 12 Monate wählbar', mb.zeilen === heute.getDate() && mb.monate === 12, mb.zeilen + ' / ' + mb.monate);
  pruef('Monatsbericht: WhatsApp-Zahlen nach Quelle', /aus Bestellung/.test(mb.wa || '') && /aus Reservierung/.test(mb.wa || '') && /eingelöst/.test(mb.wa || ''), mb.wa);
  // Die Tafeln blenden beim Scrollen ein (opacity 0 -> 1). Erst ins Bild holen,
  // dann prüfen, dass sie WIRKLICH sichtbar wird -- Text im DOM reicht nicht.
  await p.s.evaluate(function () { document.getElementById('monatsberichtPanel').scrollIntoView({ block: 'start' }); });
  // Bestehende Einblendung (.scroll-reveal): Verzögerung = Position * 0,07 s. Bis 5 s warten.
  var deck = '0';
  for (var w = 0; w < 25 && deck !== '1'; w++) { await p.s.waitForTimeout(200); deck = await p.s.evaluate(function () { var el = document.getElementById('monatsberichtPanel'); return el.classList.contains('revealed') ? getComputedStyle(el).opacity : 'nicht eingeblendet'; }); }
  pruef('Monatsbericht wird im Bild wirklich sichtbar (opacity 1)', deck === '1', deck);
  await p.s.locator('#monatsberichtPanel').screenshot({ path: path.join(AUS, 'monatsbericht.png') });
  pruef('kein Seitenfehler', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  // ---------- ohne SQL 42 ----------
  p = await seite(true);
  await bereich(p, 'sectionMarketing');
  await p.s.evaluate(function () { return loadCustomerAnalytics(); }); await p.s.waitForTimeout(400);
  var o42 = await p.s.evaluate(function () { return { text: document.getElementById('waPanelInhalt').textContent, neu: document.getElementById('waNeuBtn').disabled, knoepfe: document.querySelectorAll('#marketingCustomerList [onclick*="sendMarketingWhatsApp"]').length }; });
  pruef('ohne SQL 42: Tafel sagt "datenbank/42 einspielen", Neues Angebot gesperrt', /datenbank\/42-whatsapp-angebote\.sql/.test(o42.text) && o42.neu === true, JSON.stringify(o42));
  pruef('ohne SQL 42: keine Werbe-Knöpfe (niemand hat zugestimmt)', o42.knoepfe === 0, o42.knoepfe);
  await bereich(p, 'sectionRevenue');
  await p.s.evaluate(function () { return monatsberichtLaden(); }); await p.s.waitForTimeout(300);
  var mb2 = await p.s.evaluate(function () { return (document.querySelector('#monatsberichtInhalt .mb-wa') || {}).textContent; });
  pruef('ohne SQL 42: Monatsbericht sagt es beim WhatsApp-Teil', /datenbank\/42 einspielen/.test(mb2 || ''), mb2);
  pruef('kein Seitenfehler ohne SQL 42', !p.fehler.length, p.fehler.join(' | '));
  await p.ctx.close();

  await b.close(); srv.close();
  console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/wa-*.png, monatsbericht.png');
  process.exit(rot ? 1 : 0);
})();
