// DAS HANDY DES WIRTS WIRD MIT SEINEM LOKAL GESPEICHERT.
//
// Gemessen am 27.10.2026: jede Abfrage "Geraete dieses Lokals" leer. Die
// App meldete das Handy mit dem oeffentlichen Schluessel an (role=anon),
// der Ausloeser in der Datenbank strich Lokal und E-Mail -- still. Jetzt
// geht die Anmeldung ueber push-geraet.js. Der Test FUEHRT sie aus.
'use strict';
var fs = require('fs'), path = require('path');
var FN = path.join(__dirname, '..', 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }
process.env.SUPABASE_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dienst';

var MEIN = '11111111-2222-3333-4444-555555555555', FREMD = '99999999-2222-3333-4444-555555555555';
var gespeichert = [], fehltAngebote = false;
global.fetch = async function (url, opt) {
    url = String(url); opt = opt || {};
    var auth = (opt.headers && opt.headers.Authorization) || '';
    function antw(code, body) { return { ok: code < 300, status: code, json: async function () { return body; }, text: async function () { return JSON.stringify(body); } }; }
    if (/\/auth\/v1\/user/.test(url)) return /Bearer wirt/.test(auth) ? antw(200, { email: 'Koch@Lokal.de' }) : antw(401, {});
    if (/customers\?role=eq\.superadmin/.test(url)) return antw(200, []);
    if (/rpc\/kmi_meine_haeuser_fuer/.test(url)) return antw(200, [MEIN]);
    if (/push_subscriptions\?on_conflict=endpoint/.test(url)) {
        var b = JSON.parse(opt.body);
        if (fehltAngebote && 'angebote' in b) return antw(400, { message: 'column angebote does not exist' });
        gespeichert.push({ body: b, auth: auth, prefer: opt.headers.Prefer });
        return antw(201, [b]);
    }
    return antw(404, {});
};
var F = require(path.join(FN, 'push-geraet.js'));
var G = { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'P', auth: 'A' } };
function post(tok, body) { return F.handler({ httpMethod: 'POST', headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: JSON.stringify(body) }); }

(async function () {
    var r = await post('wirt', { geraet: G, r: MEIN, telefon: '0151', angebote: false });
    var j = JSON.parse(r.body), z = gespeichert[0] && gespeichert[0].body;
    t('Wirt angemeldet -> gespeichert MIT seinem Lokal', j.ok === true && j.lokal === true && z && z.restaurant_id === MEIN, r.body);
    t('… E-Mail aus der Sitzung (klein), nicht aus dem Browser', z && z.customer_email === 'koch@lokal.de', z && z.customer_email);
    t('… mit Dienstschlüssel und Rückmeldung', gespeichert[0] && gespeichert[0].auth === 'Bearer dienst' && /return=representation/.test(gespeichert[0].prefer), '');

    gespeichert = [];
    r = await post('wirt', { geraet: G, r: FREMD, customer_email: 'ibo@kiekmolin.de' });
    j = JSON.parse(r.body); z = gespeichert[0] && gespeichert[0].body;
    t('fremdes Lokal -> NICHT eingetragen, und es wird gesagt', j.ok === true && j.lokalVerweigert === true && z && !('restaurant_id' in z), r.body);
    t('… und keine fremde E-Mail aus dem Browser', z && z.customer_email === 'koch@lokal.de', z && z.customer_email);

    gespeichert = [];
    r = await post('', { geraet: G, r: MEIN });
    t('ohne Anmeldung: 401, nichts gespeichert', r.statusCode === 401 && gespeichert.length === 0, r.statusCode);
    r = await post('wirt', { geraet: { endpoint: 'http://x', keys: {} }, r: MEIN });
    t('unvollständiges Gerät: 400', r.statusCode === 400 && gespeichert.length === 0, r.statusCode);

    fehltAngebote = true; gespeichert = [];
    r = await post('wirt', { geraet: G, r: MEIN, angebote: true });
    t('Spalte angebote fehlt -> zweiter Versuch ohne, Anmeldung klappt', JSON.parse(r.body).ok === true && gespeichert.length === 1 && !('angebote' in gespeichert[0].body), r.body);

    // ---- App ----
    var H = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    var sw = H.slice(H.indexOf('function subscribeWebPush()'), H.indexOf('function pushAngebote()'));
    t('App: angemeldet -> über push-geraet mit der SITZUNG', /\/\.netlify\/functions\/push-geraet/.test(sw) && /'Authorization': 'Bearer ' \+ _sitzung/.test(sw) && /_sitzung !== SUPABASE_KEY/.test(sw), '');
    t('App: das Lokal wird mitgeschickt', /r: gastroRestaurantId/.test(sw), '');
    t('App: scheitert es beim Wirt, steht es da (nicht still)', /Benachrichtigungen nicht eingerichtet/.test(sw), '');
    t('App: der Server-Weg kommt VOR dem alten Weg mit dem öffentlichen Schlüssel', sw.indexOf('push-geraet') > 0 && sw.indexOf('push-geraet') < sw.indexOf('_pushSpeichern'), '');
    var d = H.slice(H.indexOf('async function dashLaden()'), H.indexOf('async function dashLaden()') + 6000);
    t('Dashboard: Push-Anzeige zählt Handys beim Server, nicht die Browser-Erlaubnis', /push-status\?r=/.test(d) && /kein Handy angemeldet/.test(d) && !/Notification\.permission === 'granted'/.test(d), '');

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
