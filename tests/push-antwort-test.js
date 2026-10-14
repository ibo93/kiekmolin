// ANNEHMEN/ABLEHNEN AUS DER PUSH + STATUS/TEST IM DASHBOARD.
//
// Ibo, 14.10.2026: Wirte nehmen am Ruhetag Reservierungen von zu Hause an,
// "es geht nicht so 100%". Dazu (1) Knoepfe in der Push, (2) im Dashboard
// sichtbar, ob Benachrichtigungen ankommen, mit "Test senden".
//
// Ausgefuehrt: Schluessel, res-push-antwort, pending-reminder, push-status,
// der Service Worker (push + notificationclick).
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm'), Module = require('module');
var R = path.join(__dirname, '..'), FN = path.join(R, 'netlify', 'functions');
var H = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
function fn(name, Q) { Q = Q || H; var i = Q.indexOf('function ' + name + '('); if (i < 0) throw new Error('fehlt: ' + name); var a = Q.lastIndexOf('\n', i) + 1; var d = 0, j = Q.indexOf('{', i); for (var k = j; k < Q.length; k++) { if (Q[k] === '{') d++; else if (Q[k] === '}') { d--; if (!d) return Q.slice(a, k + 1); } } }

var gesendet = [], mails = [];
var echtLaden = Module._load;
Module._load = function (anfrage, eltern) {
    if (anfrage === 'web-push') return { setVapidDetails: function () {}, sendNotification: async function (sub, text) { gesendet.push({ an: sub.endpoint, was: JSON.parse(text) }); return { statusCode: 201 }; } };
    if (anfrage === './order-email') return { handler: async function (ev) { mails.push(JSON.parse(ev.body)); return { statusCode: 200, body: '{}' }; } };
    return echtLaden.apply(this, arguments);
};
process.env.SUPABASE_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dienst-geheim';
process.env.VAPID_PUBLIC = 'pub'; process.env.VAPID_PRIVATE = 'priv';
function frisch(name) { Object.keys(require.cache).forEach(function (k) { if (k.indexOf(FN) === 0) delete require.cache[k]; }); return require(path.join(FN, name)); }
var abfragen = [];
function netz(antwort) {
    global.fetch = async function (url, o) {
        url = String(url); abfragen.push({ url: url, o: o || {} });
        var r = antwort(url, o || {}); var code = 200, body = r;
        if (r && r.__code) { code = r.__code; body = r.body; }
        return { ok: code < 300, status: code, json: async function () { return body; }, text: async function () { return JSON.stringify(body); } };
    };
}
var RID = '11111111-2222-4333-8444-555555555555', RES = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

(async function () {
    // ---- 1. Schluessel ----
    console.log('-- 1. Schluessel fuer genau eine Reservierung --');
    var PA = frisch('lib/push-antwort.js');
    var s = PA.ausstellen(RES, RID, 'dienst-geheim');
    t('ausgestellt und gültig', PA.pruefen(s, 'dienst-geheim') === true, JSON.stringify(s));
    t('andere Reservierung mit demselben Schlüssel -> ungültig', PA.pruefen(Object.assign({}, s, { id: RES.replace('a', 'b') }), 'dienst-geheim') === false, '');
    t('anderes Lokal -> ungültig', PA.pruefen(Object.assign({}, s, { r: RID.replace('1', '9') }), 'dienst-geheim') === false, '');
    t('abgelaufen (nach 7 Tagen) -> ungültig', PA.pruefen(s, 'dienst-geheim', s.exp + 1) === false, '');
    t('verlängert (exp geändert) -> ungültig', PA.pruefen(Object.assign({}, s, { exp: s.exp + 86400000 }), 'dienst-geheim') === false, '');
    t('anderer Server-Schlüssel -> ungültig', PA.pruefen(s, 'anderer') === false, '');
    t('der Dienstschlüssel steht nicht im Schlüssel', JSON.stringify(s).indexOf('dienst-geheim') === -1, JSON.stringify(s));

    // ---- 2. res-push-antwort ----
    console.log('\n-- 2. Knopf "Annehmen" / "Ablehnen" --');
    var stand = 'pending';
    netz(function (url, o) {
        if (o.method === 'PATCH' && /reservations\?id=eq\./.test(url)) {
            if (stand !== 'pending' || !/status=eq\.pending/.test(url)) return [];
            stand = JSON.parse(o.body).status;
            return [{ id: RES, status: stand, guest_name: 'Meier', reservation_date: '2026-10-16', reservation_time: '19:00:00', party_size: 4 }];
        }
        if (/reservations\?id=eq\./.test(url)) return [{ status: stand, guest_name: 'Meier', reservation_date: '2026-10-16', reservation_time: '19:00:00', party_size: 4 }];
        return [];
    });
    var A = frisch('res-push-antwort.js');
    function post(b) { return A.handler({ httpMethod: 'POST', body: JSON.stringify(b) }).then(function (r) { return { code: r.statusCode, j: JSON.parse(r.body) }; }); }
    var r = await post(Object.assign({}, s, { t: s.t.slice(0, -2) + 'xx', aktion: 'annehmen' }));
    t('falscher Schlüssel -> 403, nichts geändert', r.code === 403 && stand === 'pending' && !abfragen.some(function (a) { return a.o.method === 'PATCH'; }), JSON.stringify(r));
    mails = []; abfragen = [];
    r = await post(Object.assign({}, s, { aktion: 'annehmen' }));
    var patch = abfragen.filter(function (a) { return a.o.method === 'PATCH'; })[0];
    t('Annehmen -> confirmed, nur aus "offen" heraus, nur in diesem Lokal', r.code === 200 && r.j.status === 'confirmed' && stand === 'confirmed'
      && /status=eq\.pending/.test(patch.url) && patch.url.indexOf('restaurant_id=eq.' + RID) > -1, JSON.stringify(r) + ' ' + (patch && patch.url));
    t('… Gast bekommt die Bestätigungs-Mail (wie aus dem Dashboard)', mails.length === 1 && mails[0].event === 'confirmed' && mails[0].reservation_id === RES, JSON.stringify(mails));
    t('… Antwort nennt Gast und Zeit für die Bestätigung auf dem Handy', r.j.gast === 'Meier' && /19:00/.test(r.j.wann) && /4 Pers/.test(r.j.wann), JSON.stringify(r.j));
    mails = [];
    r = await post(Object.assign({}, s, { aktion: 'ablehnen' }));
    t('zweites Handy drückt danach "Ablehnen" -> bleibt bestätigt, Antwort "schon"', r.code === 200 && r.j.schon === 'confirmed' && stand === 'confirmed' && mails.length === 0, JSON.stringify(r));
    stand = 'pending'; mails = [];
    r = await post(Object.assign({}, s, { aktion: 'ablehnen' }));
    t('Ablehnen -> cancelled + Absage-Mail', r.j.status === 'cancelled' && mails[0] && mails[0].event === 'cancelled', JSON.stringify(r) + JSON.stringify(mails));
    r = await post(Object.assign({}, s, { aktion: 'loeschen' }));
    t('unbekannte Aktion -> 400', r.code === 400, r.code);

    // ---- 3. pending-reminder haengt die Knoepfe an ----
    console.log('\n-- 3. Die Push traegt die Knoepfe --');
    netz(function (url) {
        if (/customers\?role=eq\.superadmin/.test(url)) return [];
        if (/push_subscriptions\?restaurant_id=/.test(url)) return [{ id: 'w', endpoint: 'https://push/wirt', p256dh_key: 'a', auth_key: 'b', customer_email: null }];
        if (/reservations\?status=eq\.pending&push_sent_at=is\.null/.test(url)) return [{ id: RES, restaurant_id: RID, guest_name: 'Meier', reservation_date: '2026-10-16', reservation_time: '19:00', party_size: 4 }];
        if (/orders\?status=in\.\(received,pending\)&push_sent_at=is\.null/.test(url)) return [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', restaurant_id: RID, customer_name: 'Ali' }];
        if (/restaurants\?id=in/.test(url)) return [{ id: RID, name: 'Lütt Italia' }];
        return [];
    });
    gesendet = [];
    var log = console.log; console.log = function () {};
    await frisch('pending-reminder.js').handler({});
    console.log = log;
    var pr = gesendet.filter(function (g) { return g.was.data && g.was.data.type === 'reservation'; })[0];
    var po = gesendet.filter(function (g) { return g.was.data && g.was.data.type === 'order'; })[0];
    t('Reservierungs-Push hat "Annehmen" und "Ablehnen"', pr && JSON.stringify(pr.was.actions) === JSON.stringify([{ action: 'annehmen', title: 'Annehmen' }, { action: 'ablehnen', title: 'Ablehnen' }]), pr && JSON.stringify(pr.was.actions));
    t('… und einen gültigen Schlüssel für genau diese Reservierung', pr && pr.was.data.antwort && pr.was.data.antwort.id === RES && PA.pruefen(pr.was.data.antwort, 'dienst-geheim') === true, pr && JSON.stringify(pr.was.data.antwort));
    t('Bestell-Push bleibt ohne Knöpfe', po && !po.was.actions && !po.was.data.antwort, po && JSON.stringify(po.was));

    // ---- 4. Service Worker ----
    console.log('\n-- 4. Service Worker --');
    var SW = fs.readFileSync(path.join(R, 'sw.js'), 'utf8');
    var hoerer = {}, angezeigt = [], geoeffnet = [], swFetch = [];
    var selbst = {
        addEventListener: function (typ, f) { hoerer[typ] = f; },
        registration: { showNotification: function (titel, o) { angezeigt.push({ titel: titel, o: o }); return Promise.resolve(); } },
        clients: { matchAll: function () { return Promise.resolve([]); }, openWindow: function (u) { geoeffnet.push(u); return Promise.resolve(); }, claim: function () {} },
        location: { origin: 'https://kiekmolin.de' }, skipWaiting: function () {}
    };
    var kasten = { self: selbst, caches: { open: function () { return Promise.resolve({ addAll: function () {}, put: function () {} }); }, keys: function () { return Promise.resolve([]); }, match: function () { return Promise.resolve(null); } },
        fetch: function (u, o) { swFetch.push({ u: u, o: o }); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true, status: 'confirmed', gast: 'Meier', wann: 'Fr., 16.10. 19:00, 4 Pers.' }); } }); },
        URL: URL, console: console, Promise: Promise, JSON: JSON, setTimeout: setTimeout, Response: function () {}, Request: function () {} };
    vm.createContext(kasten); vm.runInContext(SW, kasten);
    var warten = [];
    hoerer.push({ data: { json: function () { return pr.was; } }, waitUntil: function (p) { warten.push(p); } });
    await Promise.all(warten);
    var opt = angezeigt[0] && angezeigt[0].o;
    t('Push zeigt die Knöpfe an', opt && opt.actions.length === 2, opt && JSON.stringify(opt.actions));
    t('Push behält Ziel-Link und Schlüssel aus data.data (vorher immer "/")', opt && opt.data.url === '/?adminTab=reservations' && opt.data.antwort && opt.data.antwort.id === RES, opt && JSON.stringify(opt.data));
    angezeigt = []; warten = [];
    hoerer.notificationclick({ action: 'annehmen', notification: { data: opt.data, close: function () {} }, waitUntil: function (p) { warten.push(p); } });
    await Promise.all(warten);
    t('Knopf "Annehmen" ruft res-push-antwort mit Schlüssel, ohne die App zu öffnen',
      swFetch.length === 1 && swFetch[0].u === '/.netlify/functions/res-push-antwort' && JSON.parse(swFetch[0].o.body).aktion === 'annehmen' && JSON.parse(swFetch[0].o.body).t === opt.data.antwort.t && geoeffnet.length === 0, JSON.stringify(swFetch) + geoeffnet);
    t('… danach Bestätigung auf dem Handy: "✓ Reservierung angenommen – Meier …"', angezeigt[0] && /angenommen/.test(angezeigt[0].titel) && /Meier/.test(angezeigt[0].o.body), angezeigt[0] && JSON.stringify(angezeigt[0]));
    kasten.fetch = function () { return Promise.reject(new Error('offline')); };
    angezeigt = []; warten = [];
    hoerer.notificationclick({ action: 'annehmen', notification: { data: opt.data, close: function () {} }, waitUntil: function (p) { warten.push(p); } });
    await Promise.all(warten);
    t('kein Netz -> "⚠ Nicht gespeichert … im Dashboard bestätigen" (nicht still)', angezeigt[0] && /Nicht gespeichert/.test(angezeigt[0].titel) && /Dashboard/.test(angezeigt[0].o.body) && angezeigt[0].o.requireInteraction === true, angezeigt[0] && JSON.stringify(angezeigt[0]));
    warten = [];
    hoerer.notificationclick({ action: '', notification: { data: opt.data, close: function () {} }, waitUntil: function (p) { warten.push(p); } });
    await Promise.all(warten);
    t('normales Antippen öffnet die Reservierungen', geoeffnet[0] === '/?adminTab=reservations', JSON.stringify(geoeffnet));

    // ---- 5. push-status ----
    console.log('\n-- 5. Status und Test im Dashboard --');
    var darf = true;
    netz(function (url, o) {
        if (/auth\/v1\/user/.test(url)) return /Bearer gut/.test(o.headers.Authorization) ? { email: 'wirt@lokal.de' } : { __code: 401, body: {} };
        if (/customers\?role=eq\.superadmin&select=email&email=eq/.test(url)) return [];
        if (/rpc\/kmi_meine_haeuser_fuer/.test(url)) return darf ? [RID] : ['99999999-9999-4999-8999-999999999999'];
        if (/customers\?role=eq\.superadmin&select=email$/.test(url)) return [{ email: 'ibo@kiekmolin.de' }];
        if (/push_subscriptions\?restaurant_id=/.test(url)) return [
            { id: 'w1', endpoint: 'https://push/w1', p256dh_key: 'a', auth_key: 'b', customer_email: null },
            { id: 'w2', endpoint: 'https://push/w2', p256dh_key: 'a', auth_key: 'b', customer_email: 'koch@lokal.de' },
            { id: 'i1', endpoint: 'https://push/ibo', p256dh_key: 'a', auth_key: 'b', customer_email: 'Ibo@kiekmolin.de' }];
        if (/reservations\?.*push_sent_at=not\.is\.null/.test(url)) return [{ push_sent_at: '2026-10-14T16:42:00Z' }];
        if (/orders\?.*push_sent_at=not\.is\.null/.test(url)) return [{ push_sent_at: '2026-10-13T10:00:00Z' }];
        return [];
    });
    var P = frisch('push-status.js');
    var g = await P.handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { r: RID } });
    t('ohne Anmeldung -> 403', g.statusCode === 403, g.statusCode);
    darf = false;
    g = await P.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer gut' }, queryStringParameters: { r: RID } });
    t('fremdes Lokal -> 403', g.statusCode === 403, g.statusCode);
    darf = true;
    g = await P.handler({ httpMethod: 'GET', headers: { authorization: 'Bearer gut' }, queryStringParameters: { r: RID } });
    var gj = JSON.parse(g.body);
    t('Inhaber: 2 Geräte (das Betreiber-Handy zählt nicht), letzte Meldung = die neueste', gj.ok && gj.geraete === 2 && gj.letzte === '2026-10-14T16:42:00Z' && gj.vapid === true, g.body);
    gesendet = [];
    var p2 = await P.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer gut' }, body: JSON.stringify({ r: RID, test: true }) });
    var pj = JSON.parse(p2.body);
    t('Test senden: an beide Wirte-Geräte, nicht an den Betreiber', pj.ok && pj.gesendet === 2 && pj.von === 2 && gesendet.every(function (x) { return x.an !== 'https://push/ibo'; }) && /Test/.test(gesendet[0].was.title), p2.body);

    // ---- 6. Dashboard-Text ----
    var TXT = new Function('todayStrLocal', 'localDayStr', 'sperrTagePlus', fn('pushZeit') + fn('pushStatusText') + '; return pushStatusText;')(
        function () { return '2026-10-14'; }, function (d) { return d.toLocaleDateString('sv-SE'); }, function (d, k) { var x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + k); return x.toLocaleDateString('sv-SE'); });
    var a1 = TXT({ ok: true, vapid: true, geraete: 2, letzte: '2026-10-14T16:42:00Z' });
    t('Dashboard: "✓ Aktiv auf 2 Geräten · letzte Meldung heute …"', /^✓ Aktiv auf 2 Geräten · letzte Meldung heute \d\d:\d\d$/.test(a1.text) && !a1.warn, a1.text);
    var a2 = TXT({ ok: true, vapid: true, geraete: 0 });
    t('kein Gerät -> Warnung, nicht leer (Regel 6)', /Kein Gerät angemeldet/.test(a2.text) && a2.warn, a2.text);
    var a3 = TXT({ ok: false, error: 'HTTP 403' });
    t('Status nicht abrufbar -> wird gesagt', /nicht abrufbar \(HTTP 403\)/.test(a3.text) && a3.warn, a3.text);
    t('Karte steht in den Reservierungs-Einstellungen und lädt mit', /id="pushStatusKarte"/.test(H) && /if \(typeof pushStatusLaden === 'function'\) pushStatusLaden\(\);/.test(fn('loadResSettingsUI')), 'fehlt');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
