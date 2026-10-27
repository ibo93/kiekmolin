// DER BETREIBER BEKOMMT JEDE NEUE RESERVIERUNG UND BESTELLUNG -- PER E-MAIL
// UND PUSH, OHNE SCHALTER.
//
// Ibo, 27.10.2026: "ich will selber alles auch kontrollieren der wirt ist
// selber oft vergesslich" / "ich will kein schalter" / "es ging nie wegen
// browser blockt ich will auch nachrichten bekommen wenn mein handy aus ist".
//
// Gemessen am selben Tag: jede Geraete-Abfrage eines Lokals kam leer
// zurueck. Deshalb die E-Mail -- sie haengt an keinem Browser.
//
// Der Test FUEHRT pending-reminder.js und admin-meldungen.js aus, mit
// nachgebautem Netz, und zaehlt, was wirklich hinausgeht.
'use strict';
var path = require('path'), Module = require('module');
var FN = path.join(__dirname, '..', 'netlify', 'functions');
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

var pushes = [], mails = [];
var echtLaden = Module._load;
Module._load = function (anfrage) {
    if (anfrage === 'web-push') return {
        setVapidDetails: function () {},
        sendNotification: async function (sub, text, opt) { pushes.push({ an: sub.endpoint, was: JSON.parse(text), opt: opt }); return { statusCode: 201 }; }
    };
    return echtLaden.apply(this, arguments);
};
process.env.SUPABASE_URL = 'https://mvrgmbdokdzmumdyezha.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'dienst';
process.env.VAPID_PUBLIC = 'pub';
process.env.VAPID_PRIVATE = 'priv';
process.env.RESEND_API_KEY = 're_test';

var RID = '11111111-2222-3333-4444-555555555555';
var IBO = { id: 'i1', endpoint: 'https://push/ibo', p256dh_key: 'a', auth_key: 'b', customer_email: 'IBO@kiekmolin.de' };
var FREMD = { id: 'f1', endpoint: 'https://push/fremd', p256dh_key: 'a', auth_key: 'b', customer_email: 'ibo@kiekmolin.de.evil' };

function netz(antworten, mitToken) {
    global.fetch = async function (url, opt) {
        url = String(url);
        if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(opt.body)); return { ok: true, status: 200, json: async function () { return {}; } }; }
        if (/\/auth\/v1\/user/.test(url)) {
            var gut = mitToken && /Bearer echt/.test(opt.headers.Authorization);
            return { ok: gut, status: gut ? 200 : 401, json: async function () { return { email: 'ibo@kiekmolin.de' }; } };
        }
        var body = [];
        for (var i = 0; i < antworten.length; i++) if (antworten[i][0].test(url)) { body = antworten[i][1]; break; }
        return { ok: true, status: 200, json: async function () { return body; }, text: async function () { return JSON.stringify(body); } };
    };
}
function laden(name) {
    Object.keys(require.cache).forEach(function (k) { if (k.indexOf(FN) === 0) delete require.cache[k]; });
    return require(path.join(FN, name + '.js'));
}

(async function () {
    // ---- 1. Lokal OHNE Geraet (der gemessene Fall), Betreiber ohne Geraet ----
    netz([
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        [/reservations\?status=eq\.pending&push_sent_at=is\.null/, [
            { id: 'r1', restaurant_id: RID, guest_name: 'Meier', reservation_date: '2026-10-28', reservation_time: '19:00:00', party_size: 4 },
            { id: 'r2', restaurant_id: RID, guest_name: '[Probe] Wache', party_size: 2 }]],
        [/orders\?status=in\.\(received,pending\)&push_sent_at=is\.null/, [{ id: 'o1', restaurant_id: RID, customer_name: 'Kaya' }]],
        [/restaurants\?id=in/, [{ id: RID, name: 'Lütt Italia' }]]
    ]);
    mails = []; pushes = [];
    await laden('pending-reminder').handler({});
    var resMail = mails.filter(function (m) { return /Reservierung/.test(m.subject); });
    var bestMail = mails.filter(function (m) { return /Bestellung/.test(m.subject); });
    t('neue Reservierung -> genau eine E-Mail an ihn, obwohl kein Gerät da ist', resMail.length === 1 && resMail[0].to[0] === 'ibo@kiekmolin.de', JSON.stringify(mails.map(function (m) { return m.subject; })));
    t('… mit Lokal, Gast, Uhrzeit, Personen im Betreff/Text', resMail.length === 1 && /Lütt Italia/.test(resMail[0].html) && /Meier/.test(resMail[0].html) && /19:00/.test(resMail[0].html) && /4 Pers/.test(resMail[0].html), resMail[0] && resMail[0].html);
    t('… mit Knopf ins Dashboard', resMail.length === 1 && /kiekmolin\.de\/\?adminTab=reservations/.test(resMail[0].html), '');
    t('neue Bestellung -> auch eine E-Mail ("alles")', bestMail.length === 1 && /Kaya/.test(bestMail[0].html), JSON.stringify(mails.map(function (m) { return m.subject; })));
    t('die Probe der Wache erzeugt KEINE E-Mail', !mails.some(function (m) { return /Probe/.test(m.html); }), 'Fehlalarm');

    // ---- 2. Erinnerung nach 20 Minuten ----
    netz([
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        [/reservations\?status=eq\.pending&push_sent_at=not\.is\.null|reservations\?status=eq\.pending.*reminder_sent_at=is\.null/, [{ id: 'r3', restaurant_id: RID, guest_name: 'Vergessen', reservation_date: '2026-10-28', reservation_time: '20:00:00', party_size: 2 }]],
        [/restaurants\?id=in/, [{ id: RID, name: 'Lütt Italia' }]]
    ]);
    mails = [];
    await laden('pending-reminder').handler({});
    t('Wirt reagiert 20 Min nicht -> E-Mail "wartet noch" an ihn', mails.some(function (m) { return /wartet noch/.test(m.subject) && /Vergessen/.test(m.html); }), JSON.stringify(mails.map(function (m) { return m.subject; })));

    // ---- 3. Mit Geraet: Push genau einmal, gross/klein egal, kein Fremder ----
    netz([
        [/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]],
        [/push_subscriptions\?restaurant_id=/, []],
        [/push_subscriptions\?or=/, [IBO, FREMD, IBO]],
        [/reservations\?status=eq\.pending&push_sent_at=is\.null/, [{ id: 'r4', restaurant_id: RID, guest_name: 'Lund', party_size: 3 }]],
        [/restaurants\?id=in/, [{ id: RID, name: 'Lütt Italia' }]]
    ]);
    pushes = []; mails = [];
    await laden('pending-reminder').handler({});
    var anIbo = pushes.filter(function (p) { return p.an === IBO.endpoint && p.was.data.type === 'reservation'; });
    t('Push an sein Handy, auch mit anders geschriebener E-Mail (IBO@…)', anIbo.length === 1, anIbo.length + '×');
    t('kein Push an eine Adresse, die nur so ähnlich aussieht', !pushes.some(function (p) { return p.an === FREMD.endpoint; }), 'fremdes Gerät');
    t('Push mit hoher Dringlichkeit und Haltbarkeit (Handy aus -> kommt beim Einschalten)', anIbo.length === 1 && anIbo[0].opt && anIbo[0].opt.urgency === 'high' && anIbo[0].opt.TTL >= 3600, JSON.stringify(anIbo[0] && anIbo[0].opt));

    // ---- 4. admin-meldungen: nur fuer ihn, und der Test sagt die Wahrheit ----
    netz([[/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]], [/push_subscriptions\?or=/, []]], true);
    var F = laden('admin-meldungen');
    var r = await F.handler({ httpMethod: 'POST', headers: {}, body: '{"test":true}' });
    t('ohne Anmeldung: 403', r.statusCode === 403, r.statusCode);
    r = await F.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer echt' }, body: '{"test":true}' });
    var j = JSON.parse(r.body);
    t('ohne Gerät: sagt "auf keinem Gerät angemeldet" statt "ok"', j.ok === false && j.von === 0 && /keinem Gerät/.test(j.error), r.body);
    netz([[/customers\?role=eq\.superadmin/, [{ email: 'ibo@kiekmolin.de' }]], [/push_subscriptions\?or=/, [IBO]]], true);
    pushes = [];
    F = laden('admin-meldungen');
    r = await F.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer echt' }, body: '{"test":true}' });
    j = JSON.parse(r.body);
    t('mit Gerät: Test geht raus, 1 von 1', j.ok === true && j.gesendet === 1 && pushes.length === 1 && pushes[0].an === IBO.endpoint, r.body);

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
