// FAHRER "BIN AUF DEM RUECKWEG" -- im echten Browser durchgeklickt.
//
// Ibo, 12.10.2026: "wenn Lieferant er drueckt ein Knopf, dass er zurueck
// kommt zum Laden, so machen die das Essen fuer die Bestellung schon
// fertig". Zwei Seiten, beide wirklich bedient:
//   A) Handy des Fahrers (fahrer.html): Link oeffnen, "Bin auf dem
//      Rueckweg" -> "10 Min". Die Server-Function ist die ECHTE
//      (netlify/functions/fahrer.js), nur Supabase dahinter ist nachgebaut.
//   B) Dashboard: was der Wirt dann sieht, und Fahrer anlegen.
// Was es NICHT sieht: das echte Handy, das echte Netz, die echte Datenbank.
// AUFRUF   node werkzeug/fahrer-messen.js
'use strict';
var path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto');
var CHROM = process.env.CHROMIUM_PFAD || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var chromium;
try { chromium = require('playwright-core').chromium; } catch (e) { console.log('playwright-core fehlt.'); process.exit(0); }
var WURZEL = path.resolve(__dirname, '..');
var AUS = path.join(__dirname, 'ausgabe'); try { fs.mkdirSync(AUS); } catch (e) {}
var PORT = +(process.env.PORT || 8897);
var RID = '22222222-2222-4222-8222-222222222222';
var GEHEIM = 'Abcdefghijklmnopqrstuvwxyz012345';

// Nachgebautes Supabase fuer die echte Function.
var zeile = { id: 'f1', name: 'Ali', status: 'unterwegs', zurueck_um: null, restaurant_id: RID, restaurants: { name: 'Die Millis' } };
var geschrieben = [];
process.env.SUPABASE_SERVICE_KEY = 'dienst';
global.fetch = async function (url, opt) {
    opt = opt || {};
    var antw = function (status, body, kopf) { return { ok: status < 300, status: status, json: async function () { return body; }, text: async function () { return JSON.stringify(body); }, headers: { get: function (k) { return (kopf || {})[k.toLowerCase()] || null; } } }; };
    if (/fahrer\?token_hash=eq\./.test(url)) return antw(200, url.indexOf(crypto.createHash('sha256').update(GEHEIM).digest('hex')) > 0 ? [zeile] : []);
    if (/fahrer\?id=eq\.f1/.test(url) && opt.method === 'PATCH') { var b = JSON.parse(opt.body); geschrieben.push(b); Object.assign(zeile, b); return antw(200, [Object.assign({ id: 'f1' }, b)]); }
    if (/orders\?/.test(url)) return antw(206, [], { 'content-range': '0-0/2' });
    return antw(404, {});
};
var F = require(path.join(WURZEL, 'netlify/functions/fahrer.js'));

(async function () {
    var srv = http.createServer(function (q, r) {
        var p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; if (p === '/fahrer') p = '/fahrer.html';
        var f = path.join(WURZEL, p);
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(PORT);
    var b = await chromium.launch({ executablePath: CHROM, args: ['--no-sandbox'] });
    var rot = 0, n = 0;
    function pruef(t, ok, x) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + t + (ok ? '' : '  -> ' + x)); }

    // ---- A) Handy des Fahrers ----
    var handy = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var kopfe = [];
    await handy.route(/\/\.netlify\/functions\/fahrer/, async function (rt) {
        var rq = rt.request(); kopfe.push(rq.headers()['x-fahrer'] || '');
        var res = await F.handler({ httpMethod: rq.method(), body: rq.postData() || '', headers: rq.headers() });
        return rt.fulfill({ status: res.statusCode, contentType: 'application/json', body: res.body });
    });
    var s = await handy.newPage(); var fehler = []; s.on('pageerror', function (e) { fehler.push(e.message); });
    await s.goto('http://localhost:' + PORT + '/fahrer.html#t=' + GEHEIM, { waitUntil: 'load' }); await s.waitForTimeout(500);
    pruef('Link oeffnen: "Hallo Ali!", Lokal und Stand stehen da', (await s.textContent('#gruss')) === 'Hallo Ali!' && /Die Millis/.test(await s.textContent('#haus')) && (await s.textContent('#stand')) === 'Unterwegs', await s.textContent('#stand'));
    pruef('der Link ist aus der Adresszeile verschwunden, das Handy hat ihn sich gemerkt', s.url().indexOf(GEHEIM) < 0 && (await s.evaluate(function () { return localStorage.getItem('kmi_fahrer_t'); })) === GEHEIM, s.url());
    pruef('wartende Lieferungen stehen da', /warten 2 Lieferungen/.test(await s.textContent('#warten')), await s.textContent('#warten'));
    await s.tap('#rueckwegKnopf'); await s.waitForTimeout(150);
    await s.screenshot({ path: path.join(AUS, 'fahrer-handy-wahl.png') });
    await s.tap('[data-min="10"]'); await s.waitForTimeout(500);
    var w = geschrieben[geschrieben.length - 1] || {};
    var min = w.zurueck_um ? Math.round((new Date(w.zurueck_um) - Date.now()) / 60000) : null;
    pruef('"Bin auf dem Rueckweg" -> "10 Min": gespeichert als Rueckweg in ca. 10 Min', w.status === 'rueckweg' && min >= 9 && min <= 10, JSON.stringify(w));
    pruef('der Fahrer sieht, dass es angekommen ist', (await s.textContent('#stand')) === 'Auf dem Rückweg' && /Gesendet um .* – die Küche sieht es/.test(await s.textContent('#meldung')), await s.textContent('#meldung'));
    pruef('das Geheimnis ging nie in eine Adresse', kopfe.length >= 1 && kopfe[0] === GEHEIM, kopfe.join(','));
    await s.screenshot({ path: path.join(AUS, 'fahrer-handy.png') });
    await s.reload({ waitUntil: 'load' }); await s.waitForTimeout(400);
    pruef('wieder geoeffnet (vom Startbildschirm, ohne #t=): Stand ist da', (await s.textContent('#stand')) === 'Auf dem Rückweg', await s.textContent('#stand'));
    pruef('kein Seitenfehler (Handy)', !fehler.length, fehler.join(' | '));
    await handy.close();

    // ---- B) Dashboard ----
    var ctx = await b.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript(function () { try { localStorage.setItem('kmi_onboarded', 'true'); localStorage.setItem('kmi_consent', 'essential'); localStorage.setItem('kmi_theme', 'light'); sessionStorage.setItem('kmi_splash_seen', '1'); } catch (e) {} });
    var tabelleFehlt = false, angelegt = null;
    await ctx.route(/^https?:\/\/(?!localhost)/, function (rt) {
        var rq = rt.request(), u = rq.url(), json = function (d, st) { return rt.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(d) }); };
        if (/rest\/v1\/fahrer/.test(u)) {
            if (tabelleFehlt) return json({ code: 'PGRST205', message: "Could not find the table 'public.fahrer' in the schema cache" }, 404);
            if (rq.method() === 'POST') { angelegt = JSON.parse(rq.postData()); return json([{ id: 'f9', name: angelegt.name, status: 'im_laden', zurueck_um: null }], 201); }
            return json([
                { id: 'f1', name: 'Ali', status: 'rueckweg', zurueck_um: new Date(Date.now() + 8 * 60000 + 20000).toISOString() },
                { id: 'f2', name: 'Mehmet', status: 'unterwegs', zurueck_um: null }
            ]);
        }
        if (/supabase\.co/.test(u)) return json([]);
        return rt.abort();
    });
    var d = await ctx.newPage(); var dfehler = []; d.on('pageerror', function (e) { dfehler.push(e.message); });
    await d.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' }); await d.waitForTimeout(1500);
    await d.evaluate(function (rid) {
        document.querySelectorAll('#splashScreen,.kin-start-intro,#startIntro').forEach(function (x) { x.remove(); });
        document.getElementById('guestView').style.setProperty('display', 'none', 'important');
        var dv = document.getElementById('dashboardView'); for (var q = dv; q && q !== document.body; q = q.parentElement) q.style.setProperty('display', 'block', 'important');
        document.querySelectorAll('.dash-section').forEach(function (x) { x.style.setProperty('display', x.id === 'sectionOrders' ? 'block' : 'none', 'important'); });
        document.querySelectorAll('.cart-fab, #cartFab, .floating-cart, .bottom-nav, #installBanner').forEach(function (x) { x.style.setProperty('display', 'none', 'important'); });
        APP_DATA.restaurants = [{ id: rid, name: 'Die Millis', features: [] }];
        window._gastroOnlyRestaurantId = rid;
        var jetzt = new Date().toISOString();
        var mk = function (id, nr, typ, st) { return { id: id, order_number: nr, order_type: typ, status: st, customer_name: 'Gast ' + nr, total: 25, items: [{ name: 'Pizza', quantity: 1, price: 25 }], created_at: jetzt, restaurant_id: rid }; };
        dashboardOrders = [mk('a', 301, 'delivery', 'preparing'), mk('b', 302, 'delivery', 'ready'), mk('c', 303, 'pickup', 'preparing'), mk('e', 304, 'delivery', 'out_for_delivery')];
        renderDashboardOrders();
        return fahrerLaden();
    }, RID);
    await d.waitForTimeout(300);
    var leiste = (await d.textContent('#fahrerLeiste')).replace(/\s+/g, ' ').trim();
    pruef('Dashboard: "Ali kommt in ca. 8 Min zurück – 2 Lieferungen jetzt fertig machen"', /Ali kommt in ca\. 8 Min zurück – 2 Lieferungen jetzt fertig machen/.test(leiste), leiste);
    pruef('jeder Fahrer mit seinem Stand', /Ali · zurück in ca\. 8 Min/.test(leiste) && /Mehmet · unterwegs/.test(leiste), leiste);
    await d.evaluate(function () { document.querySelectorAll('.toast, #toastContainer, .kmi-toast').forEach(function (x) { x.style.display = 'none'; }); document.getElementById('fahrerLeiste').scrollIntoView(); });
    await d.locator('#fahrerLeiste').screenshot({ path: path.join(AUS, 'fahrer-dashboard.png') });

    await d.click('[data-fahrer="verwalten"]'); await d.waitForTimeout(200);
    await d.fill('#fahrerNeuName', 'Sven'); await d.click('#fahrerNeuForm button[type="submit"]'); await d.waitForTimeout(500);
    var link = await d.inputValue('#fahrerLinkFeld').catch(function () { return ''; });
    var teil = (link.match(/\/fahrer\.html#t=([A-Za-z0-9_-]+)$/) || [])[1] || '';
    pruef('Fahrer anlegen: Link wird einmal gezeigt, in die Datenbank geht nur sein Fingerabdruck',
        angelegt && angelegt.name === 'Sven' && /^[0-9a-f]{64}$/.test(angelegt.token_hash) && teil && crypto.createHash('sha256').update(teil).digest('hex') === angelegt.token_hash && JSON.stringify(angelegt).indexOf(teil) < 0,
        JSON.stringify(angelegt) + ' / ' + link);
    pruef('und per WhatsApp schickbar', /wa\.me\/\?text=.*fahrer\.html%23t%3D/.test(await d.getAttribute('.fahrer-link-knoepfe a', 'href')), await d.getAttribute('.fahrer-link-knoepfe a', 'href'));
    await d.locator('.fahrer-fenster-karte').screenshot({ path: path.join(AUS, 'fahrer-anlegen.png') });
    await d.keyboard.press('Escape');

    tabelleFehlt = true;
    await d.evaluate(function () { return fahrerLaden(); }); await d.waitForTimeout(200);
    var fl = (await d.textContent('#fahrerLeiste')).trim();
    pruef('Tabelle fehlt: das steht da, statt still "keine Fahrer"', /44-fahrer\.sql in Supabase einspielen/.test(fl), fl);
    pruef('kein Seitenfehler (Dashboard)', !dfehler.length, dfehler.join(' | '));

    await b.close(); srv.close();
    console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen grün.') + '  Bilder: werkzeug/ausgabe/fahrer-*.png');
    process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
