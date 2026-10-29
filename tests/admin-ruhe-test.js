// WAS AUF DEM HANDY DES BETREIBERS ANKOMMT -- UND WAS NICHT.
//
// 27.10.2026: Reservierungen, Bestellungen und die 20-Minuten-Erinnerung
// gehen WIEDER an ihn, immer, ohne Schalter ("ich will selber alles auch
// kontrollieren der wirt ist selber oft vergesslich" / "ich will kein
// schalter ich will das ich benachrichtigungen bekomme"). Genau EINMAL,
// auch wenn sein Handy die restaurant_id traegt. Waechter, Absage und
// Kellner-Ruf bleiben beim Wirt -- dafuer gilt der 14.10. weiter.
//
// Vorher:
// Ibo, 14.10.2026: "ich will kein wächter nachrichten oder so bekommen als
// admin". Auf Nachfrage: keine Kopien (Reservierung, Bestellung,
// Erinnerung, Absage, Kellner-Ruf, Waechter). Der Wache-Alarm und neue
// Gastronom-Anmeldungen bleiben bei ihm.
//
// Dazu: Melder und Waechter liefen bis dahin nie. Alles Alte hat keinen
// Merker -- ohne Zeitgrenze kaeme es beim ersten Lauf als "neu" bei den
// Wirten an.
//
// Der Test FUEHRT die Functions aus, mit nachgebautem Netz, und zaehlt,
// an welche Geraete wirklich gesendet wird.
'use strict';
var fs = require('fs'), path = require('path'), Module = require('module');
var FN = path.join(__dirname, '..', 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

var gesendet = [];
var echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return {
        setVapidDetails: function () {},
        sendNotification: async function (sub, text) { gesendet.push({ an: sub.endpoint, was: JSON.parse(text) }); return { statusCode: 201 }; }
    };
    return echtLaden.apply(this, arguments);
};
process.env.SUPABASE_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dienst';
process.env.VAPID_PUBLIC = 'pub';
process.env.VAPID_PRIVATE = 'priv';

var RID = '11111111-2222-3333-4444-555555555555';
var WIRT = { id: 'w1', endpoint: 'https://push/wirt', p256dh_key: 'a', auth_key: 'b', customer_email: null };
var WIRT2 = { id: 'w2', endpoint: 'https://push/wirt-mit-mail', p256dh_key: 'a', auth_key: 'b', customer_email: 'koch@lokal.de' };
// Sein Handy -- MIT restaurant_id, weil er das Lokal einmal geoeffnet hat.
var IBO = { id: 'i1', endpoint: 'https://push/ibo', p256dh_key: 'a', auth_key: 'b', customer_email: 'Ibo@Kiekmolin.DE' };

var abfragen = [];
function netz(antworten) {
    global.fetch = async function (url, opt) {
        url = String(url); abfragen.push(url);
        var body = [];
        for (var i = 0; i < antworten.length; i++) if (antworten[i][0].test(url)) { body = antworten[i][1]; break; }
        return { ok: true, status: 200, json: async function () { return body; }, text: async function () { return JSON.stringify(body); } };
    };
}
function laden(name) {
    var p = path.join(FN, name + '.js');
    Object.keys(require.cache).forEach(function (k) { if (k.indexOf(FN) === 0) delete require.cache[k]; });
    return require(p);
}

(async function () {
    // ---- 1. Melder: neue Reservierung ----
    netz([
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        [/push_subscriptions\?restaurant_id=/, [WIRT, WIRT2, IBO]],
        [/push_subscriptions\?or=/, [IBO]],
        [/reservations\?status=eq\.pending&push_sent_at=is\.null/, [{ id: 'r1', restaurant_id: RID, guest_name: 'Meier', reservation_date: '2026-10-15', reservation_time: '19:00', party_size: 4 }]],
        [/customers\?role=eq\.restaurant/, [{ id: 'c1', name: 'Neues Lokal', email: 'neu@lokal.de' }]],
        [/restaurants\?id=in/, [{ id: RID, name: 'Lütt Italia' }]]
    ]);
    gesendet = []; abfragen = [];
    var r = await laden('pending-reminder').handler({});
    t('Melder läuft durch', r.statusCode === 200, r.statusCode + ' ' + r.body);
    var res = gesendet.filter(function (g) { return g.was.data && g.was.data.type === 'reservation'; });
    t('neue Reservierung geht an beide Wirte-Geräte (auch das ohne E-Mail)',
      res.length === 3 && res.some(function (g) { return g.an === WIRT.endpoint; }) && res.some(function (g) { return g.an === WIRT2.endpoint; }),
      JSON.stringify(res.map(function (g) { return g.an; })));
    var anIbo = gesendet.filter(function (g) { return g.an === IBO.endpoint && g.was.data && g.was.data.type === 'reservation'; });
    t('… und an das Handy des Betreibers, GENAU EINMAL (obwohl es auch die restaurant_id trägt)',
      anIbo.length === 1, anIbo.length + '×');
    t('… mit dem Namen des Lokals im Text (er hat viele)', anIbo.length === 1 && /Lütt Italia/.test(anIbo[0].was.body), anIbo[0] && anIbo[0].was.body);
    var anfrage = abfragen.filter(function (u) { return /push_subscriptions\?or=/.test(u); })[0] || '';
    t('seine Geräte werden ohne Groß/klein-Falle gesucht (ilike, nicht in.())',
      /ilike/.test(decodeURIComponent(anfrage)), anfrage);
    var anm = gesendet.filter(function (g) { return g.was.data && g.was.data.type === 'gastro_registration'; });
    t('neue Gastronom-Anmeldung kommt weiter bei ihm an',
      anm.length === 1 && anm[0].an === IBO.endpoint, JSON.stringify(anm.map(function (g) { return g.an; })));

    // ---- 2. Nichts Altes ausgraben ----
    var offen = abfragen.filter(function (u) { return /^https:\/\/[^?]+\/rest\/v1\/(orders|reservations)\?status=/.test(u); });
    t('alle vier Abfragen (neu + Erinnerung, Bestellung + Reservierung) haben eine Zeitgrenze',
      offen.length === 4 && offen.every(function (u) { return /created_at=gte\./.test(u); }), offen.join(' | '));
    var grenze = offen.length && decodeURIComponent((offen[0].match(/created_at=gte\.([^&]+)/) || [])[1] || '');
    var alter = (Date.now() - new Date(grenze).getTime()) / 3600000;
    t('… von etwa drei Stunden', alter > 2.9 && alter < 3.1, grenze);

    // ---- 3. Fällt die Admin-Suche aus, bekommt der Wirt trotzdem alles ----
    netz([
        [/push_subscriptions\?restaurant_id=/, [WIRT]],
        [/reservations\?status=eq\.pending&push_sent_at=is\.null/, [{ id: 'r2', restaurant_id: RID, guest_name: 'X', party_size: 2 }]],
        [/restaurants\?id=in/, [{ id: RID, name: 'Lütt Italia' }]]
    ]);
    var echt = global.fetch;
    global.fetch = async function (url, o) { if (/customers\?role=eq\.superadmin/.test(String(url))) throw new Error('weg'); return echt(url, o); };
    gesendet = [];
    await laden('pending-reminder').handler({});
    t('Admin-Suche kaputt -> Wirt bekommt seine Meldung trotzdem',
      gesendet.length === 1 && gesendet[0].an === WIRT.endpoint, JSON.stringify(gesendet.map(function (g) { return g.an; })));

    // ---- 4. Waechter ----
    netz([
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        [/restaurant_events\?/, [{ id: 'e1', restaurant_id: RID, type: 'order_save_failed', payload: { order_number: 'A1' }, created_at: new Date().toISOString() }]],
        [/push_subscriptions\?restaurant_id=/, [WIRT, IBO]],
        [/restaurants\?id=in/, [{ id: RID, name: 'Lütt Italia' }]]
    ]);
    gesendet = []; abfragen = [];
    var w = await laden('waechter').handler({});
    t('Wächter läuft durch', w.statusCode === 200, w.statusCode + ' ' + w.body);
    t('Wächter-Alarm geht an den Wirt, nicht an den Betreiber',
      gesendet.length === 1 && gesendet[0].an === WIRT.endpoint, JSON.stringify(gesendet.map(function (g) { return g.an; })));
    var ev = abfragen.filter(function (u) { return /restaurant_events\?/.test(u) && /notified_at=is\.null/.test(u); });
    t('Wächter gräbt keine alten Ereignisse aus (Zeitgrenze)',
      ev.length === 1 && /created_at=gte\./.test(ev[0]), ev.join(' | '));

    // ---- 5. Absage und Kellner-Ruf ----
    var WG = require(path.join(FN, 'lib', 'wirt-geraete.js'));
    t('Filter: Gerät ohne E-Mail bleibt (SQL-NULL-Falle)',
      WG.nurWirte([WIRT, IBO], ['ibo@kiekmolin.de']).length === 1 && WG.nurWirte([WIRT, IBO], ['ibo@kiekmolin.de'])[0] === WIRT, 'Wirt fällt heraus');
    ['res-cancel', 'waiter-call'].forEach(function (name) {
        var q = fs.readFileSync(path.join(FN, name + '.js'), 'utf8');
        t(name + ': filtert das Betreiber-Handy heraus',
          /WIRT\.nurWirte\(subs, await WIRT\.adminMails\(/.test(q) && /restaurant_id=eq\.[\s\S]{0,140}customer_email'/.test(q), 'fehlt');
        t(name + ': hängt keine Admin-Geräte mehr dazu',
          !/push_subscriptions\?customer_email=in\./.test(q), 'Kopie an den Admin');
    });

    // ---- Keine Mail-Flut: erst abhaken, dann mailen (Pruefung 29.10.2026) ----
    process.env.RESEND_API_KEY = 're_test';
    var mails = 0, patchOk = false;
    function netzMail() {
        global.fetch = async function (url, opt) {
            url = String(url); opt = opt || {};
            if (/api\.resend\.com/.test(url)) { mails++; return { ok: true, status: 200, json: async function () { return {}; }, text: async function () { return ''; } }; }
            if (opt.method === 'PATCH') return { ok: patchOk, status: patchOk ? 200 : 500, json: async function () { return []; }, text: async function () { return 'kaputt'; } };
            var body = [];
            if (/customers\?role=eq\.superadmin/.test(url)) body = [{ email: 'ibo@kiekmolin.de' }];
            else if (/reservations\?status=eq\.pending&push_sent_at=is\.null/.test(url)) body = [{ id: 'r7', restaurant_id: RID, guest_name: 'Flut', reservation_date: '2026-10-15', reservation_time: '19:00', party_size: 2 }];
            else if (/restaurants\?id=in/.test(url)) body = [{ id: RID, name: 'Lütt Italia' }];
            return { ok: true, status: 200, json: async function () { return body; }, text: async function () { return JSON.stringify(body); } };
        };
    }
    netzMail(); mails = 0; patchOk = false;
    try { await laden('pending-reminder').handler({}); } catch (e) {}
    t('Abhaken scheitert -> KEINE Mail (sonst jede Minute dieselbe, bis zu 3 Std)', mails === 0, mails + ' Mails');
    netzMail(); mails = 0; patchOk = true;
    await laden('pending-reminder').handler({});
    t('Abhaken klappt -> genau eine Mail an den Betreiber', mails === 1, mails + ' Mails');
    delete process.env.RESEND_API_KEY;
    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
