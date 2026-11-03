// GESCHENKGUTSCHEINE (03.11.2026) -- Server.
// Fuehrt netlify/functions/geschenkgutschein.js AUS, mit nachgebautem
// PayPal und nachgebauter Datenbank: kein Gutschein ohne Geld, richtiger
// Betrag, doppelt buchen = derselbe Gutschein, Einloesen nur fuers eigene
// Lokal und nur bis zum Rest.
'use strict';
process.env.SUPABASE_SERVICE_KEY = 'dienst';
process.env.SUPABASE_URL = 'https://db.test';
process.env.RESEND_API_KEY = 'resend';
var path = require('path');
var F = require(path.join(__dirname, '..', 'netlify', 'functions', 'geschenkgutschein.js'));
var T = F._test;
var n = 0, ok = 0;
function t(l, c, x) { n++; if (c === true) ok++; console.log((c === true ? 'OK  ' : 'FAIL') + ' | ' + l + (c === true ? '' : '  -> ' + x)); }

// ---- Reine Helfer ----
var c1 = T.neuerCode();
t('Code: KIN-XXXX-XXXX ohne 0/O/1/I/L', /^KIN-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(c1), c1);
var codes = {}; for (var i = 0; i < 2000; i++) codes[T.neuerCode()] = 1;
t('2000 Codes, alle verschieden (Zufall)', Object.keys(codes).length === 2000, Object.keys(codes).length);
t('abgetippt: klein, mit Leerzeichen, ohne Striche -> erkannt', T.codeNormal(' kin abcd 2345 ') === 'KIN-ABCD-2345' && T.codeNormal('ABCD2345') === 'KIN-ABCD-2345', T.codeNormal(' kin abcd 2345 '));
t('falsche Laenge / verbotene Zeichen -> leer', T.codeNormal('KIN-ABCD-234') === '' && T.codeNormal('KIN-AB0D-2345') === '' && T.codeNormal('') === '', '');
t('Betrag: ganze Euro 10-300', T.betragOk(50) && T.betragOk(10) && T.betragOk(300) && !T.betragOk(9) && !T.betragOk(301) && !T.betragOk(25.5) && !T.betragOk('x'), '');
t('gueltig 3 Jahre bis Jahresende', T.gueltigBis(new Date('2026-11-03T12:00:00')) === '2029-12-31', T.gueltigBis(new Date('2026-11-03T12:00:00')));
var oeff = T.oeffentlich({ code: 'KIN-A', betrag: '50.00', rest: '20.00', kaeufer_email: 'geheim@x.de', kaeufer_name: 'Anna', empfaenger_name: 'Opa' }, { id: 'R', name: 'Lokal' });
t('Ansicht per Code verraet die Kaeufer-Mail NICHT', JSON.stringify(oeff).indexOf('geheim') < 0 && oeff.von === 'Anna' && oeff.rest === 20, JSON.stringify(oeff));
var g0 = { status: 'aktiv', rest: '50.00', gueltig_bis: '2029-12-31' };
t('Einloesen 20 von 50 -> Rest 30, aktiv', JSON.stringify(T.einloesePlan(g0, 20, '2026-11-03')) === JSON.stringify({ betrag: 20, alterRest: 50, rest: 30, status: 'aktiv' }), JSON.stringify(T.einloesePlan(g0, 20, '2026-11-03')));
t('Einloesen genau den Rest -> eingeloest', T.einloesePlan(g0, 50, '2026-11-03').status === 'eingeloest', '');
t('mehr als der Rest -> abgelehnt mit Rest im Text', /nur noch 50,00 €/.test(T.einloesePlan(g0, 50.01, '2026-11-03').fehler || ''), T.einloesePlan(g0, 50.01, '2026-11-03').fehler);
t('abgelaufen / eingeloest / 0 € -> abgelehnt', !!T.einloesePlan({ status: 'aktiv', rest: 5, gueltig_bis: '2026-01-01' }, 1, '2026-11-03').fehler && !!T.einloesePlan({ status: 'eingeloest', rest: 0, gueltig_bis: '2029-12-31' }, 1, '2026-11-03').fehler && !!T.einloesePlan(g0, 0, '2026-11-03').fehler, '');
t('verkauft nur mit Schalter "geschenkgutschein"', T.verkauftAn({ features: ['geschenkgutschein'] }) && !T.verkauftAn({ features: ['payment_paypal'] }) && !T.verkauftAn({ features: ['geschenkgutschein'], is_active: false }), '');

// ---- Nachgebaute Welt ----
var RID = '11111111-2222-3333-4444-555555555555';
var welt;
function neueWelt() {
    welt = {
        lokal: { id: RID, name: 'Hafenkate', slug: 'hafenkate', city: 'Greetsiel', email: 'wirt@hafenkate.de', features: ['geschenkgutschein'], is_active: true },
        konto: [{ client_id: 'cid', secret: 'sec', live: false }],
        gutscheine: [], events: [], mails: [], tabelle: true,
        capture: { status: 'COMPLETED', value: '50.00', currency: 'EUR' },
        user: 'wirt@hafenkate.de', kunden: { 'wirt@hafenkate.de': [RID] }, insertFehler: 0, patchLeer: false
    };
}
function antwort(status, obj) { var tx = typeof obj === 'string' ? obj : JSON.stringify(obj); return { ok: status < 400, status: status, text: async function () { return tx; }, json: async function () { return JSON.parse(tx); } }; }
global.fetch = async function (url, o) {
    o = o || {}; var m = o.method || 'GET';
    if (/api\.resend\.com/.test(url)) { welt.mails.push(JSON.parse(o.body)); return antwort(200, { id: 'm1' }); }
    if (/\/v1\/oauth2\/token/.test(url)) return antwort(200, { access_token: 'pp' });
    if (/\/v2\/checkout\/orders\/[^/]+\/capture/.test(url)) {
        var c = welt.capture;
        return antwort(201, { id: 'PP1', status: c.status, purchase_units: [{ payments: { captures: [{ id: 'CAP1', amount: { value: c.value, currency_code: c.currency } }] } }] });
    }
    if (/\/v2\/checkout\/orders$/.test(url)) { welt.angelegt = JSON.parse(o.body); return antwort(201, { id: 'PP1' }); }
    if (/\/auth\/v1\/user/.test(url)) return welt.user ? antwort(200, { email: welt.user }) : antwort(401, {});
    var q = decodeURIComponent(url);
    if (/\/rest\/v1\/customers/.test(url)) {
        if (/role=eq\.superadmin|select=role/.test(q)) return antwort(200, []);
        var mail = (/email=ilike\.([^&]+)/.exec(q) || [])[1] || '';
        return antwort(200, (welt.kunden[mail] || []).map(function (r) { return { restaurant_id: r }; }));
    }
    if (/\/rest\/v1\/restaurants\?/.test(url)) return antwort(200, [welt.lokal]);
    if (/\/rest\/v1\/paypal_konten/.test(url)) return antwort(200, welt.konto);
    if (/\/rest\/v1\/restaurant_events/.test(url)) { welt.events.push(JSON.parse(o.body)); return antwort(201, ''); }
    if (/\/rest\/v1\/zahlsperre|zahl_sperre|abo/.test(url)) return antwort(200, []);
    if (/\/rest\/v1\/geschenkgutscheine/.test(url)) {
        if (!welt.tabelle) return antwort(404, { code: 'PGRST205', message: 'Could not find the table public.geschenkgutscheine' });
        if (m === 'POST') {
            if (welt.insertFehler) { welt.insertFehler--; return antwort(500, { message: 'kaputt' }); }
            var z = Object.assign({ id: 'g' + (welt.gutscheine.length + 1), einloesungen: [], erstellt: '2026-11-03T10:00:00Z' }, JSON.parse(o.body));
            welt.gutscheine.push(z); return antwort(201, [z]);
        }
        var f = welt.gutscheine.filter(function (g) {
            var ok2 = true;
            q.replace(/[?&](code|paypal_order_id|restaurant_id|id|status)=eq\.([^&]+)/g, function (_, k, v) { if (String(g[k]) !== v) ok2 = false; });
            var r = /[?&]rest=eq\.([^&]+)/.exec(q); if (r && Number(g.rest) !== Number(r[1])) ok2 = false;
            return ok2;
        });
        if (m === 'PATCH') { if (welt.patchLeer) return antwort(200, []); f.forEach(function (g) { Object.assign(g, JSON.parse(o.body)); }); return antwort(200, f); }
        return antwort(200, f);
    }
    return antwort(200, []);
};
function rufe(body, tok) { return F.handler({ httpMethod: 'POST', headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: JSON.stringify(body) }).then(function (r) { return { code: r.statusCode, j: JSON.parse(r.body) }; }); }

(async function () {
    neueWelt();
    var r = await rufe({ action: 'info', r: RID });
    t('info: Lokal mit Schalter + PayPal -> aktiv, mit Client-ID', r.j.aktiv === true && r.j.client_id === 'cid', JSON.stringify(r.j));
    welt.lokal.features = [];
    r = await rufe({ action: 'info', r: RID });
    t('info: ohne Schalter -> nicht aktiv (Wirt muss es wollen)', r.j.aktiv === false && r.j.grund === 'aus', JSON.stringify(r.j));
    neueWelt(); welt.konto = [];
    r = await rufe({ action: 'info', r: RID });
    t('info: ohne PayPal-Konto -> nicht aktiv', r.j.aktiv === false && r.j.grund === 'kein_paypal', JSON.stringify(r.j));
    neueWelt(); welt.tabelle = false;
    r = await rufe({ action: 'info', r: RID });
    t('info: ohne SQL 51 -> nicht aktiv, sagt "sql51"', r.j.aktiv === false && r.j.grund === 'sql51', JSON.stringify(r.j));
    r = await rufe({ action: 'anlegen', r: RID, betrag: 50 });
    t('anlegen ohne SQL 51 -> abgelehnt, NICHTS bei PayPal angelegt', r.code === 409 && !welt.angelegt, JSON.stringify(r.j));

    neueWelt();
    welt.lokal.features = [];
    r = await rufe({ action: 'anlegen', r: RID, betrag: 50 });
    t('anlegen bei ausgeschaltetem Schalter -> 409, NICHTS bei PayPal', r.code === 409 && !welt.angelegt, JSON.stringify(r.j));
    welt.lokal.features = ['geschenkgutschein'];
    r = await rufe({ action: 'anlegen', r: RID, betrag: 25.5 });
    t('anlegen: krummer Betrag -> 400', r.code === 400, r.code);
    r = await rufe({ action: 'anlegen', r: RID, betrag: 50 });
    t('anlegen: PayPal-Auftrag ueber genau 50.00 EUR', r.j.ok && welt.angelegt.purchase_units[0].amount.value === '50.00' && welt.angelegt.purchase_units[0].amount.currency_code === 'EUR', JSON.stringify(welt.angelegt && welt.angelegt.purchase_units));

    var kauf = { action: 'buchen', r: RID, paypal_id: 'PP1', betrag: 50, empfaenger: 'Oma Gerda', nachricht: 'Frohe Weihnachten!', kaeufer_name: 'Anna', kaeufer_email: 'Anna@Example.de', motiv: 'festlich' };
    r = await rufe(kauf);
    var g = welt.gutscheine[0];
    t('buchen: bezahlt -> Gutschein mit Code, 50 € Rest, gueltig 3 Jahre', r.j.ok && g && /^KIN-/.test(g.code) && g.rest === 50 && g.betrag === 50 && /-12-31$/.test(g.gueltig_bis) && r.j.gutschein.code === g.code, JSON.stringify(r.j));
    t('buchen: Gruss, Empfaenger, Motiv gespeichert; Mail klein geschrieben', g.nachricht === 'Frohe Weihnachten!' && g.empfaenger_name === 'Oma Gerda' && g.motiv === 'festlich' && g.kaeufer_email === 'anna@example.de', JSON.stringify(g));
    t('Mail an den Kaeufer mit Code und Link', welt.mails.length === 1 && welt.mails[0].to[0] === 'anna@example.de' && welt.mails[0].html.indexOf(g.code) > -1 && welt.mails[0].html.indexOf('?gutschein=' + encodeURIComponent(g.code)) > -1 && r.j.mail === true, JSON.stringify(welt.mails[0] && welt.mails[0].to));
    t('Antwort an den Gast verraet keine Kaeufer-Mail', JSON.stringify(r.j).indexOf('anna@example.de') < 0, '');
    r = await rufe(kauf);
    t('zweimal buchen (Zurueck-Taste) -> derselbe Gutschein, kein zweiter', r.j.ok && r.j.doppelt === true && welt.gutscheine.length === 1 && r.j.gutschein.code === g.code, JSON.stringify(r.j));

    neueWelt(); welt.capture.value = '5.00';
    r = await rufe(kauf);
    t('bezahlt 5 €, erwartet 50 € -> KEIN Gutschein, Meldung mit PayPal-Nummer', !r.j.ok && welt.gutscheine.length === 0 && /PP1/.test(r.j.error), JSON.stringify(r.j));
    neueWelt(); welt.capture.status = 'PENDING';
    r = await rufe(kauf);
    t('Zahlung nicht COMPLETED -> KEIN Gutschein', r.code === 402 && welt.gutscheine.length === 0, JSON.stringify(r.j));
    neueWelt(); welt.insertFehler = 9;
    r = await rufe(kauf);
    t('bezahlt, aber nicht gespeichert -> laut: restaurant_events + Nummer fuer den Gast', r.code === 500 && r.j.bezahlt === true && welt.events.length === 1 && welt.events[0].type === 'gutschein_bezahlt_ohne_gutschein', JSON.stringify(r.j));

    // ---- Ansehen ----
    neueWelt();
    await rufe(kauf); g = welt.gutscheine[0];
    r = await rufe({ action: 'ansehen', code: g.code.toLowerCase().replace(/-/g, ' ') });
    t('ansehen per Code (auch klein/ohne Striche) -> Betrag, Lokal, Gruss', r.j.ok && r.j.gutschein.betrag === 50 && r.j.gutschein.lokal.name === 'Hafenkate' && r.j.gutschein.nachricht === 'Frohe Weihnachten!', JSON.stringify(r.j));
    r = await rufe({ action: 'ansehen', code: 'KIN-ZZZZ-ZZZZ' });
    t('unbekannter Code -> 404', r.code === 404, r.code);

    // ---- Einloesen ----
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 });
    t('einloesen ohne Anmeldung -> 403', r.code === 403, r.code);
    welt.user = 'fremd@x.de';
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 }, 'tok');
    t('einloesen von fremdem Lokal-Konto -> 403', r.code === 403, r.code);
    welt.user = 'anderer@wirt.de'; welt.kunden['anderer@wirt.de'] = ['99999999-2222-3333-4444-555555555555'];
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 }, 'tok');
    t('Wirt eines ANDEREN Lokals -> 403, nichts abgebucht', r.code === 403 && g.rest === 50, r.code);
    welt.user = 'wirt@hafenkate.de';
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 20 }, 'tok');
    t('Wirt loest 20 € ein -> Rest 30, Buchung protokolliert', r.j.ok && r.j.rest === 30 && g.rest === 30 && g.einloesungen.length === 1 && g.einloesungen[0].betrag === 20, JSON.stringify(r.j));
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 40 }, 'tok');
    t('mehr als der Rest -> abgelehnt, Rest bleibt 30', r.code === 409 && g.rest === 30 && /30,00/.test(r.j.error), JSON.stringify(r.j));
    welt.patchLeer = true;
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 10 }, 'tok');
    t('gleichzeitig woanders geaendert (0 Zeilen) -> NICHT als eingeloest gemeldet', r.code === 409 && /nicht eingelöst/i.test(r.j.error), JSON.stringify(r.j));
    welt.patchLeer = false;
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 30 }, 'tok');
    t('Rest ganz einloesen -> Status eingeloest', r.j.ok && g.status === 'eingeloest' && g.rest === 0, JSON.stringify(g));
    r = await rufe({ action: 'einloesen', r: RID, code: g.code, betrag: 1 }, 'tok');
    t('danach nochmal -> "schon ganz eingelöst"', r.code === 409 && /schon ganz eingelöst/.test(r.j.error), JSON.stringify(r.j));
    r = await rufe({ action: 'liste', r: RID }, 'tok');
    t('liste fuer den Wirt -> seine Gutscheine', r.j.ok && r.j.gutscheine.length === 1, JSON.stringify(r.j).slice(0, 120));

    console.log('\n' + (ok === n ? 'Alle ' + n + ' Tests bestanden.' : (n - ok) + ' von ' + n + ' Tests FEHLGESCHLAGEN.'));
    process.exit(ok === n ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
