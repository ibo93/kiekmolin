// SILVESTER-BLOCK GANZ OBEN AUF DER LOKALSEITE -- im echten Browser.
//
// Ibo, 12.10.2026 (Luett Italia): Der QR-Code der gedruckten Silvester-Karte
// fuehrt auf die Lokalseite, und dort steht oben der Silvester-Block mit
// Menue, Ablauf und Restplaetzen. Geprueft wird, was der Gast sieht:
//   - der Block steht ueber allem anderen, mit Menue, Ablauf, Preis, Plaetzen
//   - #silvester springt hin (so endet der QR-Code)
//   - "Reservieren" oeffnet das Fenster mit dem 31.12. schon gewaehlt
//   - ist alles voll: "Ausgebucht", Warteliste statt Uhrzeiten
// Supabase und aktion-plaetze beantwortet das Werkzeug selbst.
// AUFRUF   node werkzeug/abend-messen.js
'use strict';
var path = require('path'), fs = require('fs'), http = require('http');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8896);
var RID = '33333333-3333-4333-8333-333333333333';
var JAHR = new Date().getFullYear(), SILVESTER = JAHR + '-12-31';

(async function () {
    var srv = http.createServer(function (q, r) {
        var p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
        var f = path.join(WURZEL, p);
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(PORT);
    var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
    var rot = 0, n = 0;
    function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }

    async function lauf(frei, dunkel, bild) {
        var ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: dunkel ? 'dark' : 'light' });
        await ctx.addInitScript(function (d) { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', d ? 'dark' : 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} }, dunkel);
        var abfragen = [];
        await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
            var u = rt.request().url(), json = function (d) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); };
            if (/rest\/v1\/aktionen/.test(u)) {
                abfragen.push(u);
                return json([
                    { id: 'silv', titel: 'Silvester ' + JAHR, beschreibung: 'Der Jahreswechsel bei uns – mit Live-Musik.', art: 'event', gilt_fuer: 'alle', datum: SILVESTER, von: '19:00', bis: null, aktiv: true, reihenfolge: 0,
                      menue: 'Vitello tonnato\nRisotto ai funghi porcini\nTagliata di manzo\nTiramisù', ablauf: '19:00 Empfang mit Prosecco\n20:00 Menü in vier Gängen\n00:00 Anstoßen und Feuerwerk', preis_pp: 89, plaetze: 60 },
                    { id: 'happy', titel: 'Happy Hour', art: 'vorteil', gilt_fuer: 'alle', wochentage: [0, 1, 2, 3, 4], von: '17:00', bis: '19:00', vorteil: '2 für 1', aktiv: true, reihenfolge: 1 }
                ]);
            }
            if (/supabase\.co/.test(u)) return json([]);
            return rt.abort();
        });
        // Playwright fragt die ZULETZT angelegte Route zuerst -- die genaue
        // fuer aktion-plaetze muss also nach der allgemeinen kommen.
        await ctx.route(/\/\.netlify\/functions\//, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
        await ctx.route(/\/\.netlify\/functions\/aktion-plaetze/, function (rt) { return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plaetze: 60, frei: frei }) }); });
        var s = await ctx.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
        await s.goto('http://localhost:' + PORT + '/#silvester', { waitUntil: 'load' }); await s.waitForTimeout(1500);
        await s.evaluate(async function (rid) {
            document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro,#installBanner').forEach(function (x) { x.remove(); });
            var r = { id: rid, name: 'Lütt Italia', slug: 'luett-italia', city: 'Emden', features: ['reservations'], opening_hours: null };
            APP_DATA.restaurants = (APP_DATA.restaurants || []).concat([r]);
            await showRestaurantLanding(r);
        }, RID);
        await s.waitForTimeout(1200);
        return { ctx: ctx, s: s, fehler: fehler, abfragen: abfragen };
    }

    // ---- 1. Plätze frei ----
    var a = await lauf(6, false);
    var s = a.s;
    var info = await s.evaluate(function () {
        var k = document.querySelector('#lpAbend .abend-karte');
        var land = document.getElementById('restaurantLanding');
        var reihen = Array.prototype.map.call(land.querySelectorAll('#lpAbend, #lpSpecials, #lpAktionen, .lp-ueber-uns-grid'), function (x) { return x.id || x.className; });
        var r = k && k.getBoundingClientRect();
        return {
            text: k ? k.textContent.replace(/\s+/g, ' ').trim() : '',
            reihen: reihen,
            sichtbarOben: r ? (r.top >= -5 && r.top < 200) : false,
            platz: (document.querySelector('.abend-platz') || {}).textContent || ''
        };
    });
    pruef('der Block steht ganz oben, vor Tagesangeboten, Aktionen und "Über uns"', info.reihen[0] === 'lpAbend', info.reihen.join(' > '));
    pruef('Titel, Zeit, Preis, Menü und Ablauf stehen drin', /Silvester \d{4}/.test(info.text) && /31\.12\./.test(info.text) && /ab 19:00/.test(info.text) && /89 € pro Person/.test(info.text) && /Risotto ai funghi porcini/.test(info.text) && /00:00\s*Anstoßen und Feuerwerk/.test(info.text), info.text.slice(0, 260));
    pruef('Restplätze vom Server: "Nur noch 6 Plätze frei"', info.platz === 'Nur noch 6 Plätze frei', info.platz);
    pruef('#silvester (wie im QR-Code) springt zum Block', info.sichtbarOben, JSON.stringify(info.sichtbarOben));
    pruef('die Happy Hour bleibt unten bei den Aktionen, nicht im Silvester-Block', !/Happy Hour/.test(info.text), '');
    await s.screenshot({ path: path.join(AUS, 'abend-silvester.png') });
    // Nach dem Sprung darf die feste Leiste oben die Überschrift nicht verdecken.
    var frei = await s.evaluate(function () {
        var t = document.querySelector('.abend-titel').getBoundingClientRect();
        var unten = 0;
        document.querySelectorAll('#restaurantLanding *').forEach(function (el) {
            var cs = getComputedStyle(el); if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
            var r = el.getBoundingClientRect(); if (r.top <= 2 && r.height < 300 && r.width > 200) unten = Math.max(unten, r.bottom);
        });
        return { titelOben: Math.round(t.top), leisteUnten: Math.round(unten) };
    });
    pruef('nach dem Sprung ist die Überschrift frei (nicht unter der festen Leiste)', frei.titelOben >= frei.leisteUnten, JSON.stringify(frei));
    await s.locator('#lpAbend .abend-karte').screenshot({ path: path.join(AUS, 'abend-silvester-karte.png') });
    await s.click('.abend-knopf'); await s.waitForTimeout(900);
    var res = await s.evaluate(function () { var m = document.getElementById('reservationModal'); return { offen: !!m && getComputedStyle(m).display !== 'none', datum: (document.getElementById('reservationDate') || {}).value }; });
    pruef('"Für Silvester reservieren" öffnet das Fenster mit dem 31.12. gewählt', res.offen && res.datum === SILVESTER, JSON.stringify(res));
    pruef('kein Seitenfehler', !a.fehler.length, a.fehler.join(' | '));
    await a.ctx.close();

    // ---- 2. Ausgebucht ----
    var c = await lauf(0, false);
    var voll = await c.s.evaluate(function () { return { platz: (document.querySelector('.abend-platz') || {}).textContent, knopf: (document.querySelector('.abend-knopf') || {}).textContent }; });
    pruef('alles voll: "Ausgebucht – Warteliste offen", Knopf "Auf die Warteliste"', /^Ausgebucht/.test(voll.platz || '') && /^Auf die Warteliste/.test(voll.knopf || ''), JSON.stringify(voll));
    await c.s.click('.abend-knopf'); await c.s.waitForTimeout(1200);
    var wl = await c.s.evaluate(function () { var w = document.getElementById('resWaitlistSection') || document.querySelector('[id*="aitlist"]'); var a = document.querySelector('.kmi-res-ausgebucht'); return { hinweis: a ? a.textContent.replace(/\s+/g, ' ').trim() : '', warteliste: !!w && getComputedStyle(w).display !== 'none' }; });
    pruef('im Reservierungsfenster: Hinweis "ausgebucht" und Warteliste statt Uhrzeiten', /ausgebucht/i.test(wl.hinweis) && wl.warteliste, JSON.stringify(wl));
    await c.ctx.close();

    // ---- 3. Dunkel ----
    var d = await lauf(6, true);
    var kontrast = await d.s.evaluate(function () {
        function rgb(c) { var m = c.match(/\d+(\.\d+)?/g).map(Number); return m; }
        function lum(c) { var a = rgb(c).slice(0, 3).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
        var li = document.querySelector('.abend-menue li'), k = document.querySelector('.abend-karte');
        var L1 = lum(getComputedStyle(li).color), L2 = lum(getComputedStyle(k).backgroundColor);
        return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 10) / 10;
    });
    pruef('dunkel: Menü gut lesbar (mind. 7 : 1)', kontrast >= 7, kontrast);
    await d.s.locator('#lpAbend .abend-karte').screenshot({ path: path.join(AUS, 'abend-silvester-dunkel.png') });
    await d.ctx.close();

    // ---- 4. Dashboard: Vorlage Silvester ausfüllen und speichern ----
    var dctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
    await dctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    var gesendet = null;
    await dctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
        var rq = rt.request(), u = rq.url();
        if (/rest\/v1\/aktionen/.test(u) && rq.method() === 'POST') { gesendet = JSON.parse(rq.postData()); return rt.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([Object.assign({ id: 'neu' }, gesendet)]) }); }
        if (/rest\/v1\/aktionen/.test(u)) return rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        if (/supabase\.co/.test(u)) return rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return rt.abort();
    });
    var ds = await dctx.newPage(); var dfehler = []; ds.on('pageerror', function (e) { dfehler.push(e.message); });
    await ds.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await ds.waitForTimeout(1200);
    await ds.evaluate(function (rid) { window._gastroOnlyRestaurantId = rid; window._aktionenAbendFehlt = false; aktionFormular('silvester'); }, RID);
    await ds.waitForTimeout(200);
    var vor = await ds.evaluate(function () { return { titel: document.getElementById('akTitel').value, datum: document.getElementById('akDatum').value, von: document.getElementById('akVon').value, offen: document.getElementById('akAbend').open, menue: document.getElementById('akMenue').value }; });
    pruef('Vorlage "Silvester": Datum 31.12., ab 19:00, Abend-Felder offen, Menü leer (nichts erfunden)', vor.titel === 'Silvester' && vor.datum === SILVESTER && vor.von === '19:00' && vor.offen && vor.menue === '', JSON.stringify(vor));
    await ds.fill('#akTitel', 'Silvester ' + JAHR);
    await ds.fill('#akMenue', 'Vitello tonnato\nTiramisù');
    await ds.fill('#akAblauf', '19:00 Empfang\n00:00 Feuerwerk');
    await ds.fill('#akPreis', '89,50');
    await ds.fill('#akPlaetze', '60');
    await ds.click('#akSpeichernBtn'); await ds.waitForTimeout(600);
    pruef('gespeichert wird: Datum, Menü, Ablauf, Preis 89.5, 60 Plätze', gesendet && gesendet.datum === SILVESTER && /Tiramisù/.test(gesendet.menue) && /00:00 Feuerwerk/.test(gesendet.ablauf) && gesendet.preis_pp === 89.5 && gesendet.plaetze === 60 && gesendet.wochentage === null, JSON.stringify(gesendet));
    await ds.evaluate(function () { window._aktionenAbendFehlt = true; aktionFormular('silvester'); });
    await ds.fill('#akMenue', 'Antipasti'); gesendet = null;
    await ds.click('#akSpeichernBtn'); await ds.waitForTimeout(500);
    var meldung = await ds.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('.toast, .kmi-toast, #toastContainer *'), function (x) { return x.textContent; }).join(' '); });
    pruef('ohne SQL 45: nichts gesendet, Meldung "45-besonderer-abend.sql einspielen"', gesendet === null && /45-besonderer-abend\.sql/.test(meldung), meldung.slice(0, 160));
    pruef('kein Seitenfehler (Dashboard)', !dfehler.length, dfehler.join(' | '));
    await dctx.close();

    await b.close(); srv.close();
    console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/abend-*.png');
    process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
