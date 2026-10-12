// FAHRER: "Bin auf dem Rueckweg" (Ibo, 12.10.2026)
//
// "wenn Lieferant er drueckt ein Knopf, dass er zurueck kommt zum Laden, so
// machen die das Essen fuer die Bestellung schon fertig" -- "die haben
// Handys alle, so koennt jeder Fahrer sein eigenes Profil haben".
//
// Ausgefuehrt, nicht nur gelesen: die Function mit nachgebautem Supabase,
// der Stand-Text des Dashboards, und der Fingerabdruck im Browser gegen den
// auf dem Server.
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var R = path.join(__dirname, '..');
var H = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var SEITE = fs.readFileSync(path.join(R, 'fahrer.html'), 'utf8');
var SQL = fs.readFileSync(path.join(R, 'datenbank', '44-fahrer.sql'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name) { var i = H.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = H.lastIndexOf('\n', i) + 1; var d = 0, j = H.indexOf('{', i); for (var k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(a, k + 1); } } }

(async function () {
    process.env.SUPABASE_SERVICE_KEY = 'dienst';
    delete require.cache[require.resolve('../netlify/functions/fahrer.js')];
    var F = require('../netlify/functions/fahrer.js');

    console.log('-- 1. Server: Regeln --');
    t('Minuten: 10 wenn Unsinn, hoechstens 60', F._minuten('abc') === 10 && F._minuten(0) === 10 && F._minuten(-5) === 10 && F._minuten(15) === 15 && F._minuten(600) === 60, [F._minuten('abc'), F._minuten(600)].join(','));
    var jetzt = new Date('2026-10-12T18:00:00Z');
    var rw = F._neuerStand('rueckweg', 10, jetzt);
    t('Rueckweg: Status und Uhrzeit = jetzt + Minuten', rw.status === 'rueckweg' && rw.zurueck_um === '2026-10-12T18:10:00.000Z', JSON.stringify(rw));
    t('Losgefahren / Im Laden loeschen die Rueckkehrzeit', F._neuerStand('los', 0, jetzt).status === 'unterwegs' && F._neuerStand('los', 0, jetzt).zurueck_um === null && F._neuerStand('da', 0, jetzt).status === 'im_laden', '');
    t('unbekannte Aktion schreibt nichts', F._neuerStand('loeschen', 0, jetzt) === null, '');
    t('nur diese drei Felder werden geschrieben (kein name, kein restaurant_id)', Object.keys(rw).sort().join(',') === 'aktualisiert,status,zurueck_um', Object.keys(rw).join(','));
    t('Geheimnis: nur 32-64 sichere Zeichen werden ueberhaupt nachgeschlagen', F._gueltigesGeheimnis('a'.repeat(32)) && !F._gueltigesGeheimnis('a'.repeat(31)) && !F._gueltigesGeheimnis("x'or'1'='1" + 'a'.repeat(30)) && !F._gueltigesGeheimnis(undefined), '');

    console.log('\n-- 2. Server: ausgefuehrt mit nachgebautem Supabase --');
    var geheim = 'Abcdefghijklmnopqrstuvwxyz012345';
    var anfragen = [];
    function welt(o) {
        global.fetch = async function (url, opt) {
            opt = opt || {};
            anfragen.push({ url: url, opt: opt });
            var antw = function (status, body, kopf) { return { ok: status < 300, status: status, json: async function () { return body; }, text: async function () { return JSON.stringify(body); }, headers: { get: function (k) { return (kopf || {})[k.toLowerCase()] || null; } } }; };
            if (/\/rest\/v1\/fahrer\?token_hash=eq\./.test(url)) {
                var h = url.match(/token_hash=eq\.([0-9a-f]+)/)[1];
                return antw(200, h === F._fingerabdruck(geheim) && !o.entfernt ? [{ id: 'f1', name: 'Ali', status: 'unterwegs', zurueck_um: null, restaurant_id: 'r1', restaurants: { name: 'Die Millis' } }] : []);
            }
            if (/\/rest\/v1\/fahrer\?id=eq\.f1/.test(url) && opt.method === 'PATCH') return antw(200, o.patchLeer ? [] : [Object.assign({ id: 'f1' }, JSON.parse(opt.body))]);
            if (/\/rest\/v1\/orders\?/.test(url)) return o.ordersKaputt ? antw(500, {}) : antw(206, [], { 'content-range': '0-0/3' });
            return antw(404, {});
        };
    }
    function aufruf(m, body, kopf) { return F.handler({ httpMethod: m, body: body ? JSON.stringify(body) : '', headers: kopf || {} }).then(function (r) { r.daten = JSON.parse(r.body || '{}'); return r; }); }

    welt({});
    var g = await aufruf('GET', null, { 'x-fahrer': geheim });
    t('GET mit Link: Name, Lokal, Stand und wartende Lieferungen', g.statusCode === 200 && g.daten.name === 'Ali' && g.daten.haus === 'Die Millis' && g.daten.wartend === 3, g.body);
    t('in der Datenbank wird nach dem Fingerabdruck gesucht, nie nach dem Link selbst', anfragen.every(function (a) { return a.url.indexOf(geheim) < 0; }), anfragen.map(function (a) { return a.url; }).join(' | '));
    t('nur aktive Fahrer zaehlen', /aktiv=eq\.true/.test(anfragen[0].url), anfragen[0].url);
    t('gezaehlt werden nur Lieferungen, die auf einen Fahrer warten', /order_type=eq\.delivery&status=in\.\(accepted,confirmed,preparing,ready\)/.test(anfragen[1].url), anfragen[1].url);

    anfragen = []; welt({});
    var p = await aufruf('POST', { t: geheim, aktion: 'rueckweg', minuten: 10 });
    var patch = anfragen.filter(function (a) { return a.opt.method === 'PATCH'; })[0];
    t('POST Rueckweg: gespeichert und zurueckgemeldet', p.statusCode === 200 && p.daten.status === 'rueckweg' && !!p.daten.zurueck_um, p.body);
    t('geschrieben wird nur die EIGENE Zeile, mit Rueckmeldung (return=representation)', patch && /fahrer\?id=eq\.f1&/.test(patch.url) && patch.opt.headers.Prefer === 'return=representation', patch && patch.url);

    welt({});
    var falsch = await aufruf('POST', { t: 'Zyxwvutsrqponmlkjihgfedcba543210', aktion: 'rueckweg' });
    t('falscher Link: 401, nichts geschrieben', falsch.statusCode === 401 && falsch.daten.ok === false, falsch.body);
    welt({ entfernt: true });
    var weg = await aufruf('GET', null, { 'x-fahrer': geheim });
    t('entfernter Fahrer: Link gilt nicht mehr (401)', weg.statusCode === 401 && /gilt nicht mehr/.test(weg.daten.error), weg.body);
    welt({ patchLeer: true });
    var leer = await aufruf('POST', { t: geheim, aktion: 'da' });
    t('leere Antwort beim Speichern ist KEIN Erfolg (sonst wartet die Kueche nicht)', leer.statusCode !== 200 && leer.daten.ok === false, leer.body);
    welt({ ordersKaputt: true });
    var unb = await aufruf('GET', null, { 'x-fahrer': geheim });
    t('Bestellungen nicht lesbar: "unbekannt" (null), nicht 0', unb.statusCode === 200 && unb.daten.wartend === null, unb.body);
    welt({});
    var q = await F.handler({ httpMethod: 'GET', queryStringParameters: { t: geheim }, headers: {} });
    t('der Link in der Adresse (?t=) wird nicht angenommen -- Adressen landen in Protokollen', q.statusCode === 401, q.statusCode);

    console.log('\n-- 3. Dashboard --');
    var stand = new Function(fn('fahrerStandText') + '; return fahrerStandText;')();
    var j = new Date('2026-10-12T18:00:00Z');
    t('"zurück in ca. 7 Min"', stand({ status: 'rueckweg', zurueck_um: '2026-10-12T18:07:00Z' }, j).text === 'zurück in ca. 7 Min', stand({ status: 'rueckweg', zurueck_um: '2026-10-12T18:07:00Z' }, j).text);
    t('Zeit erreicht: "müsste jetzt da sein"', stand({ status: 'rueckweg', zurueck_um: '2026-10-12T17:55:00Z' }, j).art === 'gleich', '');
    t('eine halbe Stunde drueber: kein Alarm mehr, nur noch Hinweis', stand({ status: 'rueckweg', zurueck_um: '2026-10-12T17:20:00Z' }, j).art === 'alt', '');
    t('unterwegs / im Laden', stand({ status: 'unterwegs' }, j).text === 'unterwegs' && stand({ status: 'im_laden' }, j).text === 'im Laden', '');
    var geheimFn = new Function('crypto', 'btoa', fn('fahrerGeheimnis') + '; return fahrerGeheimnis;')(crypto.webcrypto, function (s) { return Buffer.from(s, 'binary').toString('base64'); });
    var g1 = geheimFn(), g2 = geheimFn();
    t('der Link-Teil passt zu dem, was der Server annimmt, und ist jedes Mal neu', F._gueltigesGeheimnis(g1) && g1.length === 32 && g1 !== g2, g1);
    var abdruck = await new Function('crypto', 'TextEncoder', fn('fahrerFingerabdruck') + '; return fahrerFingerabdruck;')(crypto.webcrypto, TextEncoder)(g1);
    t('Fingerabdruck im Browser == Fingerabdruck auf dem Server', abdruck === F._fingerabdruck(g1), abdruck);
    t('in die Datenbank geht nur der Fingerabdruck, nie der Link', /token_hash: await fahrerFingerabdruck\(t\)/.test(fn('fahrerAnlegen')) && fn('fahrerAnlegen').indexOf('token: t') < 0, '');
    t('Anlegen, neuer Link und Entfernen pruefen die Rueckmeldung (leer = nicht gespeichert)', ['fahrerAnlegen', 'fahrerNeuerLink', 'fahrerEntfernen'].every(function (x) { var c = fn(x); return /'Prefer': 'return=representation'/.test(c) && /!Array\.isArray\(z\) \|\| !z\.length/.test(c); }), '');
    t('fehlt die Tabelle, steht das da -- nicht "noch keine Fahrer"', /44-fahrer\.sql in Supabase einspielen/.test(fn('fahrerLaden')), '');
    t('die Leiste sitzt ueber den Bestellungen und wird mit jeder Liste neu gezeichnet', /<div id="fahrerLeiste" class="fahrer-leiste" hidden><\/div>\s*\n\s*<div data-ladestand="bestellungen">/.test(H) && /try \{ fahrerLeisteZeichnen\(\); \} catch \(e\) \{\}/.test(fn('renderDashboardOrders')) && /fahrerStarten\(\)/.test(fn('loadDashboardOrders')), '');
    t('Namen kommen escapt in die Leiste und ins Fenster', /escapeHtml\(f\.name\)/.test(fn('fahrerLeisteZeichnen')) && /escapeHtml\(f\.name\)/.test(fn('fahrerVerwalten')), '');

    console.log('\n-- 4. Seite des Fahrers --');
    // sw.js legt jede Navigation OHNE Endung als App-Huelle ab. "/fahrer"
    // haette auf einem Handy mit installierter App die Huelle ueberschrieben.
    var SW = fs.readFileSync(path.join(R, 'sw.js'), 'utf8');
    var huelle = new Function('self', SW.slice(SW.indexOf('function istHuelle('), SW.indexOf("self.addEventListener('fetch'")) + '; return istHuelle;')({ location: { origin: 'https://kiekmolin.de' } });
    var linkCode = fn('fahrerLink');
    var beispiel = new Function('location', linkCode + '; return fahrerLink("' + 'a'.repeat(32) + '");')({ origin: 'https://kiekmolin.de' });
    var u = new URL(beispiel);
    t('der Fahrer-Link endet auf .html -- der Zwischenspeicher der App fasst ihn nicht an', huelle({ mode: 'navigate' }, u) === false && huelle({ mode: 'navigate' }, new URL('https://kiekmolin.de/fahrer')) === true, beispiel);
    t('der Link steht nach dem # (geht an keinen Server) und wird aus der Adresszeile genommen', /location\.hash/.test(SEITE) && /history\.replaceState\(null, '', location\.pathname\)/.test(SEITE) && !/location\.search/.test(SEITE), '');
    t('das Geheimnis geht im Kopf X-Fahrer, nicht in der Adresse', /headers: \{ 'X-Fahrer': geheim \}/.test(SEITE) && !/fahrer\?t=/.test(SEITE), '');
    t('keine Daten per innerHTML (nur textContent)', SEITE.indexOf('innerHTML') < 0, '');
    t('nicht gesendet heisst sichtbar nicht gesendet', /Die Küche weiß es noch nicht/.test(SEITE) && /Kein Netz – nicht gesendet/.test(SEITE), '');
    t('wartend unbekannt wird gesagt, nicht als 0 gezeigt', /d\.wartend === null \|\| d\.wartend === undefined/.test(SEITE), '');
    t('Seite nicht in Suchmaschinen', /<meta name="robots" content="noindex, nofollow">/.test(SEITE), '');

    console.log('\n-- 5. Datenbank --');
    t('Gaeste (anon) duerfen die Tabelle nicht lesen', /revoke all on public\.fahrer from anon;/.test(SQL) && !/to anon/.test(SQL.replace(/revoke all on public\.fahrer from anon;/, '')), '');
    t('jede Regel bindet an die eigenen Haeuser', (SQL.match(/restaurant_id in \(select public\.kmi_meine_haeuser\(\)\)/g) || []).length >= 4, (SQL.match(/kmi_meine_haeuser/g) || []).length);
    t('nur ein 64-stelliger Fingerabdruck passt in token_hash, und jeder nur einmal', /token_hash\s+text\s+not null unique check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(SQL), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
